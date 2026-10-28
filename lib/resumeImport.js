// resumeImport.js
// Turns a resume PDF into the structured resume (data/resume.json) with
// Gemini, so nobody has to type it out. The model only restructures what is
// in the PDF; the prompt forbids adding anything.

import fs from "fs";
import path from "path";
import { generate } from "./ai.js";

export function importPrompt(example, trackKeys) {
  return `Convert the attached resume PDF into JSON with exactly the same shape as this example:

${JSON.stringify(example, null, 2)}

Rules:
- Copy the person's real content only. Never add, invent, embellish or drop facts, numbers, employers, dates or skills.
- One section per resume heading (education, experience, leadership, projects, skills...), in the PDF's order. Sections with dated entries use kind "entries"; a skills/interests block uses kind "skills" with groups.
- Each entry: org (company or school), location, role (title or degree), dates exactly as written, bullets.
- Bullets keep the original wording. Wrap the most important words (tools, results, numbers) in **double asterisks**, like the example.
- Give every section, entry and bullet a short unique kebab-case id.
- bullet.tracks: the keys from [${trackKeys.join(", ")}] the bullet best supports (0 to 3 of them).
- contact: phone, email and profile links from the header; add url for email (mailto:) and links.
- Reply with the JSON object only.`;
}

export async function importResumePdf(pdfPath, trackKeys) {
  const example = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "config", "resume.example.json"), "utf-8"),
  );
  delete example._comment;
  const resume = await generate({
    prompt: importPrompt(example, trackKeys),
    json: true,
    temperature: 0.1,
    files: [{ mimeType: "application/pdf", data: fs.readFileSync(pdfPath).toString("base64") }],
  });
  if (!resume?.name || !Array.isArray(resume.sections)) {
    throw new Error("The imported resume came back incomplete. Try again, or fill data/resume.json by hand.");
  }
  return resume;
}
