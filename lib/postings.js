// postings.js
// The full text of each job posting, saved when the daily run adds the job,
// so the job page, keyword match and AI writing can use it later.
// data/postings/<jobId>.json = { id, link, title, company, location,
//   description, source, salary, postedAt, jobType, savedAt }

import { readJson, writeJson } from "./store.js";
import { jobId } from "./jobId.js";
import { safeGet } from "./fetchers/base.js";

export function stripHtml(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function savePosting(job, salary = "") {
  const id = jobId(job.link);
  return writeJson(`postings/${id}`, {
    id,
    link: job.link || "",
    title: job.title || "",
    company: job.company || "",
    location: job.location || "",
    description: stripHtml(job.description),
    source: job.source || "",
    salary,
    postedAt: job.postedAt || "",
    jobType: job.jobType || "",
    savedAt: new Date().toISOString(),
  });
}

export function getPosting(id) {
  return readJson(`postings/${id}`);
}

// For jobs added before postings were saved: read the job page itself.
// Many sites render text server-side; ones that don't give a short result.
export async function fetchPostingText(link) {
  const res = await safeGet(link);
  if (!res) return "";
  const html = await res.text();
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
  return stripHtml(main).slice(0, 20000);
}
