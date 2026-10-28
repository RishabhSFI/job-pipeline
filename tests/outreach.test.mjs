import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import nodemailer from "nodemailer";

// The store reads data/ under the working directory, so work in a temp dir.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-"));
process.chdir(tmp);
const lib = await import(new URL("../lib/outreach.js", import.meta.url));
const { guessEmails, companyDomain, followUpDateFor, isFollowUpDue, sentTodayCount, dailyCap, smtpStatus, gmailComposeUrl, clampNote } = lib;

const GOOD_ENV = { SMTP_EMAIL: "me@gmail.com", SMTP_APP_PASSWORD: "abcd efgh ijkl mnop" };
const jsonTransport = () => nodemailer.createTransport({ jsonTransport: true });
const recording = () => {
  const t = jsonTransport();
  const sent = [];
  return { sent, sendMail: async (m) => (sent.push(m), t.sendMail(m)) };
};

before(() => fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true }));

test("email guesses cover the four common formats, in order", () => {
  assert.deepEqual(
    guessEmails("Ada Lovelace", "acme.com").map((g) => g.email),
    ["ada.lovelace@acme.com", "ada@acme.com", "alovelace@acme.com", "adalovelace@acme.com"],
  );
});

test("guesses drop accents and punctuation, and a single name gets only first@", () => {
  assert.equal(guessEmails("José Núñez-Smith", "x.io")[0].email, "jose.nunezsmith@x.io");
  assert.deepEqual(guessEmails("Cher", "x.io").map((g) => g.email), ["cher@x.io"]);
  assert.deepEqual(guessEmails("", "x.io"), []);
  assert.deepEqual(guessEmails("Ada Lovelace", ""), []);
});

test("the company domain comes from its own site, not from a job board", () => {
  assert.deepEqual(companyDomain({ link: "https://careers.acme.com/jobs/1", company: "Acme" }), { domain: "acme.com", source: "posting link" });
  assert.equal(companyDomain({ link: "https://www.acme.co.uk/x" }).domain, "acme.co.uk");
  const board = companyDomain({ link: "https://boards.greenhouse.io/acme/jobs/1", company: "Acme Labs Inc" });
  assert.equal(board.domain, "acme.com");
  assert.match(board.source, /guess/);
});

test("follow-up is five days after sending and is due only for sent contacts", () => {
  assert.equal(followUpDateFor("2026-03-01T12:00:00"), "2026-03-06");
  const c = { status: "Sent", followUpDate: "2026-03-06" };
  assert.equal(isFollowUpDue(c, "2026-03-05"), false);
  assert.equal(isFollowUpDue(c, "2026-03-06"), true);
  assert.equal(isFollowUpDue({ ...c, status: "Replied" }, "2026-03-09"), false);
});

test("the daily cap defaults to 10 and reads MAX_OUTREACH_PER_DAY", () => {
  assert.equal(dailyCap({}), 10);
  assert.equal(dailyCap({ MAX_OUTREACH_PER_DAY: "3" }), 3);
  assert.equal(dailyCap({ MAX_OUTREACH_PER_DAY: "nonsense" }), 10);
});

test("only today's app sends count toward the cap", () => {
  const now = new Date(2026, 2, 10, 15);
  const at = (d) => new Date(2026, 2, d, 9).toISOString();
  const contacts = [{ sends: [{ at: at(10) }, { at: at(9) }] }, { sends: [{ at: at(10) }] }, {}];
  assert.equal(sentTodayCount(contacts, now), 2);
});

test("template SMTP values do not count as configured", () => {
  assert.equal(smtpStatus({}).configured, false);
  assert.equal(smtpStatus({ SMTP_EMAIL: "you@example.com", SMTP_APP_PASSWORD: "your-app-password" }).configured, false);
  assert.equal(smtpStatus({ SMTP_EMAIL: "you@example.com", SMTP_APP_PASSWORD: "real real real real" }).configured, false);
  assert.equal(smtpStatus(GOOD_ENV).configured, true);
});

test("compose links carry recipient, subject and body", () => {
  const u = new URL(gmailComposeUrl({ to: "a@b.co", subject: "Hi there", body: "Line1\nLine2" }));
  assert.equal(u.searchParams.get("to"), "a@b.co");
  assert.equal(u.searchParams.get("su"), "Hi there");
  assert.equal(u.searchParams.get("body"), "Line1\nLine2");
});

test("a LinkedIn note is cut to 300 characters at a sentence end when it can", () => {
  const long = "Hello there. ".repeat(40);
  const note = clampNote(long);
  assert.ok(note.length <= 300);
  assert.ok(note.endsWith("."));
  assert.equal(clampNote("Short note."), "Short note.");
});

test("contacts are stored, edited and removed", () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada Lovelace", email: "ada@acme.com", relationship: "Recruiter" });
  assert.equal(c.status, "Draft");
  assert.throws(() => lib.addContact({ jobId: "j1", name: "" }), /name/);
  assert.throws(() => lib.updateContact(c.id, { email: "nope" }), /email/);
  assert.throws(() => lib.updateContact(c.id, { status: "Ghosted" }), /status/);
  const sent = lib.updateContact(c.id, { status: "Sent" });
  assert.ok(sent.sentAt && sent.followUpDate, "marking Sent by hand sets dates");
  assert.equal(lib.listContacts().length, 1);
  assert.equal(lib.deleteContact(c.id), true);
  assert.equal(lib.listContacts().length, 0);
});

test("typing a new address clears the guess flag", () => {
  const c = lib.addContact({ jobId: "j1", name: "Bo", email: "bo@acme.com", emailIsGuess: true });
  assert.equal(lib.updateContact(c.id, { email: "bo.real@acme.com" }).emailIsGuess, false);
  lib.deleteContact(c.id);
});

test("send: nothing leaves without confirmed === true", async () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada", email: "ada@acme.com" });
  const t = recording();
  for (const confirmed of [undefined, false, "true", 1]) {
    const r = await lib.sendContact({ id: c.id, subject: "Hi", body: "Hello", confirmed, env: GOOD_ENV, transport: t });
    assert.equal(r.code, "NOT_CONFIRMED");
  }
  assert.equal(t.sent.length, 0);
  lib.deleteContact(c.id);
});

test("send: refused while SMTP is not configured", async () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada", email: "ada@acme.com" });
  const t = recording();
  const r = await lib.sendContact({ id: c.id, subject: "Hi", body: "Hello", confirmed: true, env: {}, transport: t });
  assert.equal(r.code, "NO_SMTP");
  assert.equal(t.sent.length, 0);
  lib.deleteContact(c.id);
});

test("send: a guessed address needs its own confirmation", async () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada", email: "ada@acme.com", emailIsGuess: true });
  const t = recording();
  const args = { id: c.id, subject: "Hi", body: "Hello", confirmed: true, env: GOOD_ENV, transport: t };
  assert.equal((await lib.sendContact(args)).code, "GUESS_UNCONFIRMED");
  assert.equal(t.sent.length, 0);
  assert.equal((await lib.sendContact({ ...args, confirmGuess: true })).ok, true);
  lib.deleteContact(c.id);
});

test("send: a confirmed email goes out once and the contact becomes Sent with a follow-up date", async () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada", email: "ada@acme.com" });
  const t = recording();
  const now = new Date(2026, 2, 10, 9);
  const r = await lib.sendContact({ id: c.id, subject: " Quick chat? ", body: "Hello Ada", confirmed: true, env: GOOD_ENV, transport: t, now });
  assert.equal(r.ok, true);
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, "ada@acme.com");
  assert.equal(t.sent[0].from, "me@gmail.com");
  assert.equal(t.sent[0].subject, "Quick chat?");
  assert.equal(r.contact.status, "Sent");
  assert.equal(r.contact.followUpDate, "2026-03-15");
  assert.equal(r.contact.sends.length, 1);
  lib.deleteContact(c.id);
});

test("send: the daily cap stops the next email", async () => {
  const now = new Date(2026, 2, 10, 9);
  const env = { ...GOOD_ENV, MAX_OUTREACH_PER_DAY: "2" };
  const t = recording();
  const people = ["a", "b", "c"].map((n) => lib.addContact({ jobId: "j1", name: n, email: `${n}@acme.com` }));
  const results = [];
  for (const p of people) results.push(await lib.sendContact({ id: p.id, subject: "Hi", body: "Hello", confirmed: true, env, transport: t, now }));
  assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
  assert.equal(results[2].code, "DAILY_CAP");
  assert.equal(t.sent.length, 2);
  assert.equal(lib.outreachStatus(env, now).usedToday, 2);
  people.forEach((p) => lib.deleteContact(p.id));
});

test("send: a failing transport leaves the contact unchanged", async () => {
  const c = lib.addContact({ jobId: "j1", name: "Ada", email: "ada@acme.com" });
  const r = await lib.sendContact({ id: c.id, subject: "Hi", body: "Hello", confirmed: true, env: GOOD_ENV, transport: { sendMail: async () => { throw new Error("535 bad login"); } } });
  assert.equal(r.code, "SEND_FAILED");
  assert.equal(lib.listContacts()[0].status, "Draft");
  assert.equal(lib.listContacts()[0].sends.length, 0);
  lib.deleteContact(c.id);
});
