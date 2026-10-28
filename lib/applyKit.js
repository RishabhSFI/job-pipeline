// applyKit.js
// Reads config/applyKit.json (your private details), falling back to the
// committed template when you haven't made one yet. Read fresh on every
// call, so edits apply without a restart.

import fs from "fs";
import path from "path";

export function loadApplyKit() {
  const dir = path.join(process.cwd(), "config");
  const own = path.join(dir, "applyKit.json");
  const file = fs.existsSync(own) ? own : path.join(dir, "applyKit.example.json");
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function profileValue(kit, label) {
  return kit.profile?.find((p) => p.label.toLowerCase() === label)?.value || "";
}

// The application email for one job, from the kit's emailTemplate.
// {role}, {company}, {summary}, {name} and {links} are filled in; the
// summary is the one for the job's track.
export function applicationEmail(kit, { title, company, trackKey }) {
  const name = profileValue(kit, "full name");
  const links = (kit.profile || [])
    .map((p) => p.value)
    .filter((v) => /^https?:\/\//.test(v))
    .join("\n");
  const body = (kit.emailTemplate || "")
    .replaceAll("{role}", title || "the role")
    .replaceAll("{company}", company || "your team")
    .replaceAll("{summary}", kit.summaries?.[trackKey] || Object.values(kit.summaries || {})[0] || "")
    .replaceAll("{name}", name)
    .replaceAll("{links}", links)
    .replace(/\n{3,}/g, "\n\n");
  return { subject: `Application: ${title || "Open Role"} - ${name}`, body };
}
