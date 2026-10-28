// dedupe.js
// Keeps each job once. The same job often comes from two sources (a
// company's own board and Simplify, say) under different links, and may
// already be in the sheet under another link. Two jobs are the same when
// their links match, or their company and title match and their locations
// overlap (a missing location overlaps anything). Of the copies, the one
// from the company's own board wins, then the one with the longest description.

import { normalizeLink } from "./jobId.js";

const OWN_BOARDS = new Set(["greenhouse", "lever", "ashby", "bamboohr"]);
const COMPANY_SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b\.?/g;

function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// "Scale AI, Inc." and the board slug "scaleai" both become "scaleai".
export function normalizeCompany(name) {
  return plain(name).replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]/g, "");
}

// "Finance Intern (Summer 2027)" and "Finance Intern - Summer 2027" match.
export function normalizeTitle(title) {
  return plain(title).replace(/[^a-z0-9]+/g, " ").trim();
}

// The place names in a location: "Toronto, ON / New York, NY" -> toronto, new york.
function places(location) {
  return plain(location)
    .split(/[/;|]| or /)
    .map((part) => part.split(",")[0].replace(/[^a-z0-9]+/g, " ").trim())
    .filter((p) => p.length >= 2);
}

export function locationsOverlap(a, b) {
  const pa = places(a);
  const pb = places(b);
  if (!pa.length || !pb.length) return true;
  const textA = plain(a);
  const textB = plain(b);
  return pa.some((p) => textB.includes(p)) || pb.some((p) => textA.includes(p));
}

function preference(job) {
  return (OWN_BOARDS.has(job.source) ? 1e6 : 0) + String(job.description || "").length;
}

// A set of jobs seen so far, answering "is this one already here?".
function seenJobs() {
  const links = new Set();
  const byKey = new Map();
  // Without both a company and a title, only the link can match.
  const keyOf = (job) => {
    const company = normalizeCompany(job.company);
    const title = normalizeTitle(job.title);
    return company && title ? `${company}|${title}` : null;
  };
  return {
    has(job) {
      if (links.has(normalizeLink(job.link))) return true;
      return (byKey.get(keyOf(job)) || []).some((loc) => locationsOverlap(loc, job.location));
    },
    add(job) {
      if (job.link) links.add(normalizeLink(job.link));
      const key = keyOf(job);
      if (key) byKey.set(key, [...(byKey.get(key) || []), job.location || ""]);
    },
  };
}

// jobs: fetched jobs. existing: jobs already in the sheet, as
// { link, company, title, location }. Returns the new jobs to keep.
export function dedupeJobs(jobs, existing = []) {
  const seen = seenJobs();
  for (const job of existing) seen.add(job);
  const kept = [];
  const best = jobs
    .filter((j) => j.link)
    .map((job, i) => ({ job, i }))
    .sort((a, b) => preference(b.job) - preference(a.job) || a.i - b.i);
  for (const { job } of best) {
    if (seen.has(job)) continue;
    seen.add(job);
    kept.push(job);
  }
  return kept;
}
