// studioPrompt.js
// The "Reword" prompt for one resume bullet, and the check on what comes
// back. Pure: the API route calls these around lib/ai.js.

import { plain, resumeText } from "./resumeModel.js";

export const MAX_OPTIONS = 3;
const POSTING_CHARS = 3000;

const SYSTEM = [
  "You rewrite one resume bullet so it speaks to a specific job posting.",
  "Stay truthful: use only facts already in the bullet or elsewhere in the resume.",
  "Never add numbers, percentages, dollar amounts, employers, clients, tools or results that are not already there.",
  "Work the posting's keywords in only where the existing facts honestly support them.",
  "Keep each option to one line of about the same length as the original, starting with a strong past-tense verb unless the original is in the present tense.",
  "Mark the most important words in bold with **double asterisks**, as the original does.",
].join(" ");

// { system, prompt } for generate({ json: true }).
export function rewordPrompt({ text, entry, resume, keywords = [], job = {}, description = "" }) {
  const where = [entry?.role, entry?.org].filter(Boolean).join(" at ");
  const target = [job.title, job.company].filter(Boolean).join(" at ");
  const prompt = [
    `Bullet to reword${where ? ` (from ${where})` : ""}:`,
    text,
    "",
    `Target job: ${target || "not given"}`,
    `Posting keywords to work in where truthful: ${keywords.length ? keywords.join(", ") : "none given"}`,
    "",
    "Job posting (excerpt):",
    String(description || "").slice(0, POSTING_CHARS) || "(none)",
    "",
    "The rest of the resume, the only facts you may draw on:",
    resumeText(resume),
    "",
    `Reply with JSON: {"options": ["...", "..."]} holding 2 or ${MAX_OPTIONS} different rewrites.`,
  ].join("\n");
  return { system: SYSTEM, prompt };
}

const numbers = (text) => new Set(plain(text).match(/\d+(?:[.,]\d+)*/g) || []);

// The usable options from the model's reply: one-line strings that differ
// from the original and bring in no number the original lacks.
export function cleanRewordOptions(reply, original) {
  const list = Array.isArray(reply) ? reply : reply?.options;
  if (!Array.isArray(list)) return [];
  const allowed = numbers(original);
  const seen = new Set([plain(original).trim().toLowerCase()]);
  const options = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").replace(/^[•\-*]\s+/, "").trim();
    const key = plain(text).toLowerCase();
    if (!text || seen.has(key)) continue;
    if ([...numbers(text)].some((n) => !allowed.has(n))) continue;
    seen.add(key);
    options.push(text);
  }
  return options.slice(0, MAX_OPTIONS);
}
