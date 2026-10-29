// writing.js
// Builds the prompts for AI drafts and checks the replies. Pure: callers
// pass in the posting, resume text and apply kit, and send the prompt to
// lib/ai.js themselves.

import { clampNote, NOTE_LIMIT } from "./outreachCore.js";

export const SYSTEM = [
  "You write job-application text for a student, in their voice (first person).",
  "Use only facts present in the resume and apply kit given. Never invent experience, employers, numbers, tools, results or connections.",
  "Be concise, concrete and specific to the company and role. Plain words, no clichés, no buzzwords, no flattery, no long dashes.",
  "Return only the requested text, with no preamble or commentary.",
].join(" ");

const clip = (s, n) => String(s || "").trim().slice(0, n);

function context({ job, posting, resumeText, kit, trackKey }) {
  const profile = Object.fromEntries((kit?.profile || []).map((p) => [p.label, p.value]));
  const summary = kit?.summaries?.[trackKey] || "";
  return [
    `ROLE: ${job.title || ""} at ${job.company || ""}${job.location ? ` (${job.location})` : ""}`,
    `POSTING:\n${clip(posting, 6000) || "(no posting text available)"}`,
    `RESUME:\n${clip(resumeText, 5000)}`,
    summary && `PROFESSIONAL SUMMARY:\n${summary}`,
    profile["Full name"] && `NAME: ${profile["Full name"]}`,
    profile.School && `SCHOOL: ${profile.School}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function coverLetterPrompt(ctx) {
  return `${context(ctx)}\n\nWrite a cover letter for this role, 180 to 250 words, three short paragraphs: why this company and role, the two or three most relevant things from the resume, and a direct close. Address it to the hiring team. Sign off with the name.`;
}

// Base-letter mode: the AI writes only the "why this firm" sentence.
export function whyFirmSentencePrompt(ctx) {
  return `${context(ctx)}\n\nWrite ONE sentence, at most 35 words, in first person, on why this specific company and role appeal to the candidate, based only on the posting and the resume. Return only that sentence.`;
}

// Fills a base cover letter's placeholders: {company} {role} {why} {summary} {name}.
export function fillBaseLetter(base, { company, role, why, summary, name }) {
  return String(base)
    .replaceAll("{company}", company || "your team")
    .replaceAll("{role}", role || "the role")
    .replaceAll("{why}", String(why || "").trim())
    .replaceAll("{summary}", summary || "")
    .replaceAll("{name}", name || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function whyCompanyPrompt(ctx) {
  return `${context(ctx)}\n\nAnswer the application question "Why do you want to work here?" in 90 to 130 words. Name something specific about this company or role taken from the posting, and tie it to one real thing from the resume. No filler opening.`;
}

const personLine = (c) =>
  [`NAME: ${c.name}`, c.title && `THEIR ROLE: ${c.title}`, c.relationship && `RELATIONSHIP TO THE JOB: ${c.relationship}`, c.notes && `NOTES ABOUT THEM: ${c.notes}`].filter(Boolean).join("\n");

export function outreachEmailPrompt(ctx, contact) {
  return `${context(ctx)}\n\nPERSON TO EMAIL:\n${personLine(contact)}\n\nWrite a short, personal cold email (under 120 words) to this person about the role above. Ask for a 15-minute chat or, if they are not the right person, a pointer or referral. Mention the role by name and exactly one genuine connection point taken from the resume or the notes. Do not claim to know them. Reply as JSON: {"subject": "...", "body": "..."}. The body starts with a greeting using their first name and ends with the sender's name.`;
}

export function linkedinNotePrompt(ctx, contact) {
  return `${context(ctx)}\n\nPERSON TO CONNECT WITH:\n${personLine(contact)}\n\nWrite a LinkedIn connection request note of at most ${NOTE_LIMIT} characters, counting spaces. Friendly, specific, mentions the role or company and one real connection point, and asks for nothing big. Return only the note.`;
}

export function followUpPrompt(ctx, contact, { sentOn, previous }) {
  return `${context(ctx)}\n\nPERSON:\n${personLine(contact)}\n\nEARLIER EMAIL (sent ${sentOn}, no reply yet):\n${clip(previous, 1500)}\n\nWrite a brief, polite follow-up (under 70 words) that makes it easy to answer in one line. No guilt, no pressure. Reply as JSON: {"subject": "...", "body": "..."}. The subject starts with "Re: " plus the earlier subject if there was one.`;
}

// A usable { subject, body } from an AI JSON reply, or throws.
export function parseEmailDraft(reply) {
  const subject = String(reply?.subject || "").trim();
  const body = String(reply?.body || "").trim();
  if (!body) throw Object.assign(new Error("The AI reply had no email text. Try again."), { code: "BAD_JSON" });
  return { subject, body };
}

export const parseNote = (text) => clampNote(String(text || "").replace(/^["“]|["”]$/g, ""));
