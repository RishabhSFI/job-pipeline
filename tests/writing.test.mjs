import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM, coverLetterPrompt, whyCompanyPrompt, outreachEmailPrompt, linkedinNotePrompt, followUpPrompt, parseEmailDraft, parseNote } from "../lib/writing.js";

const ctx = {
  job: { title: "Strategy Associate", company: "Acme", location: "Remote" },
  posting: "We build rockets. You will own pricing analysis.",
  resumeText: "Led a club budget. Excel, SQL.",
  kit: { profile: [{ label: "Full name", value: "Sam Student" }, { label: "School", value: "State U" }], summaries: { finance: "Finance student." } },
  trackKey: "finance",
};
const contact = { name: "Ada Lovelace", title: "Head of Ops", relationship: "Hiring manager", notes: "Also in the chess club" };

test("every prompt carries the posting, the resume and the company", () => {
  for (const p of [coverLetterPrompt(ctx), whyCompanyPrompt(ctx), outreachEmailPrompt(ctx, contact), linkedinNotePrompt(ctx, contact)]) {
    assert.match(p, /Acme/);
    assert.match(p, /pricing analysis/);
    assert.match(p, /Excel, SQL/);
    assert.match(p, /Finance student/);
    assert.match(p, /Sam Student/);
  }
});

test("the system prompt forbids invented experience", () => {
  assert.match(SYSTEM, /Never invent/);
});

test("outreach prompts include the person and ask for the right shape", () => {
  const email = outreachEmailPrompt(ctx, contact);
  assert.match(email, /Ada Lovelace/);
  assert.match(email, /chess club/);
  assert.match(email, /15-minute/);
  assert.match(email, /JSON/);
  assert.match(linkedinNotePrompt(ctx, contact), /300 characters/);
});

test("the follow-up prompt includes the earlier email and its date", () => {
  const p = followUpPrompt(ctx, contact, { sentOn: "2026-03-01", previous: "Hello Ada, quick question." });
  assert.match(p, /2026-03-01/);
  assert.match(p, /quick question/);
});

test("a prompt still builds with no posting text", () => {
  assert.match(coverLetterPrompt({ ...ctx, posting: "" }), /no posting text available/);
});

test("email replies are checked and the note is capped at 300 characters", () => {
  assert.deepEqual(parseEmailDraft({ subject: " Hi ", body: " Hello " }), { subject: "Hi", body: "Hello" });
  assert.throws(() => parseEmailDraft({ subject: "Hi" }), /no email text/);
  assert.ok(parseNote('"' + "word ".repeat(100) + '"').length <= 300);
});
