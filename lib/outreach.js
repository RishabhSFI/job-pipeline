// outreach.js
// People you reach out to about a job, saved in data/contacts.json, and the
// one-at-a-time Gmail send. Pure helpers live in outreachCore.js (usable in
// the browser); this file touches the disk and the network.
//
// Sending is never automatic: sendContact needs confirmed === true, a
// configured SMTP account and room under the daily cap. The transport is a
// parameter so tests (and anything else) can swap in nodemailer's
// jsonTransport and never reach a real mail server.

import crypto from "crypto";
import nodemailer from "nodemailer";
import { readJson, writeJson } from "./store.js";
import { CONTACT_STATUS, followUpDateFor, sendBlocker, dailyCap, sentTodayCount, isEmail } from "./outreachCore.js";

export * from "./outreachCore.js";

const FIELDS = ["name", "title", "relationship", "email", "emailIsGuess", "linkedinUrl", "notes", "status", "followUpDate", "emailDraft", "noteDraft", "followUpDraft", "company", "jobTitle"];

export function listContacts() {
  return readJson("contacts", []);
}

const save = (contacts) => writeJson("contacts", contacts);

function pick(input) {
  const out = {};
  for (const k of FIELDS) if (input[k] !== undefined) out[k] = input[k];
  if (out.status !== undefined && !CONTACT_STATUS.includes(out.status)) throw new Error(`status must be one of: ${CONTACT_STATUS.join(", ")}`);
  if (out.email !== undefined && out.email !== "" && !isEmail(out.email)) throw new Error("That email address doesn't look valid.");
  return out;
}

export function addContact(input) {
  if (!String(input.jobId || "").trim()) throw new Error("jobId is required");
  if (!String(input.name || "").trim()) throw new Error("A contact needs a name.");
  const contact = {
    id: crypto.randomUUID(),
    jobId: input.jobId,
    status: "Draft",
    sends: [],
    createdAt: new Date().toISOString(),
    ...pick(input),
  };
  save([...listContacts(), contact]);
  return contact;
}

export function updateContact(id, patch) {
  const contacts = listContacts();
  const i = contacts.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const next = { ...contacts[i], ...pick(patch) };
  // Changing the address by hand makes it the user's own, not a guess.
  if (patch.email !== undefined && patch.emailIsGuess === undefined) next.emailIsGuess = false;
  if (patch.status === "Sent" && contacts[i].status !== "Sent") {
    next.sentAt ||= new Date().toISOString();
    next.followUpDate ||= followUpDateFor(next.sentAt);
  }
  contacts[i] = next;
  save(contacts);
  return next;
}

export function deleteContact(id) {
  const contacts = listContacts();
  const rest = contacts.filter((c) => c.id !== id);
  if (rest.length === contacts.length) return false;
  save(rest);
  return true;
}

export function makeTransport(env = process.env) {
  return nodemailer.createTransport({
    host: env.SMTP_SERVER || "smtp.gmail.com",
    port: Number(env.SMTP_PORT || 587),
    secure: false,
    auth: { user: env.SMTP_EMAIL, pass: env.SMTP_APP_PASSWORD },
  });
}

export function outreachStatus(env = process.env, now = new Date()) {
  return { cap: dailyCap(env), usedToday: sentTodayCount(listContacts(), now) };
}

// Sends one email to one contact, after every check in sendBlocker passes.
// Resolves { ok: true, contact } or { ok: false, code, error }.
export async function sendContact({ id, subject, body, kind = "email", confirmed, confirmGuess, env = process.env, transport, now = new Date() }) {
  const contacts = listContacts();
  const contact = contacts.find((c) => c.id === id);
  if (!contact) return { ok: false, code: "NOT_FOUND", error: "Contact not found." };
  const blocked = sendBlocker({ contact, subject, body, confirmed, confirmGuess, env, contacts, now });
  if (blocked) return { ok: false, ...blocked };
  try {
    await (transport || makeTransport(env)).sendMail({
      from: env.SMTP_EMAIL,
      to: contact.email,
      subject: subject.trim(),
      text: body,
    });
  } catch (err) {
    return { ok: false, code: "SEND_FAILED", error: `Gmail refused the message: ${err.message}` };
  }
  const sentAt = now.toISOString();
  const updated = updateContactRaw(id, (c) => ({
    ...c,
    status: "Sent",
    sentAt: kind === "followup" ? c.sentAt || sentAt : sentAt,
    followUpDate: followUpDateFor(sentAt),
    sends: [...(c.sends || []), { at: sentAt, kind, to: c.email, subject: subject.trim() }],
    lastEmail: { subject: subject.trim(), body },
  }));
  return { ok: true, contact: updated };
}

function updateContactRaw(id, fn) {
  const contacts = listContacts();
  const i = contacts.findIndex((c) => c.id === id);
  contacts[i] = fn(contacts[i]);
  save(contacts);
  return contacts[i];
}
