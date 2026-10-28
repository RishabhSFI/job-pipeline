// digest.js
// The search runs every few hours, but the digest email goes out once a day:
// on the first run at or after DIGEST_HOUR (local time, default 8). Jobs
// that need you are queued from every run in between, so none are missed.
// data/digest.json = { lastSent: "YYYY-MM-DD" (local date),
//   pending: { needsManualApply: [job], autoApplied: [job] } }

import { readJson, writeJson } from "./store.js";

export function localDate(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function digestDue(lastSent, now, hour) {
  return lastSent !== localDate(now) && now.getHours() >= hour;
}

export function digestHour(env = process.env) {
  const hour = String(env.DIGEST_HOUR ?? "").trim() ? Number(env.DIGEST_HOUR) : NaN;
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8;
}

function load() {
  const state = readJson("digest", {});
  return { lastSent: state.lastSent, pending: { needsManualApply: [], autoApplied: [], ...state.pending } };
}

// Only what the email shows, from a sheet row or a fetched job.
function digestEntry(job) {
  return {
    title: job["Role Title"] || job.title || "",
    company: job.Company || job.company || "",
    location: job["Country/Remote"] || job.location || "",
    matchScore: job["Match Score"] ?? job.matchScore ?? "",
    cvVersion: job["CV Version Used"] || job.cvVersion || "",
    employmentType: job["Employment Type"] || job.employmentType || "",
    link: job.Link || job.link || "",
  };
}

// Adds jobs to the next digest, once per link.
export function queueForDigest({ needsManualApply = [], autoApplied = [] }) {
  const state = load();
  const add = (list, jobs) => {
    const links = new Set(list.map((j) => j.link));
    for (const entry of jobs.map(digestEntry)) {
      if (!links.has(entry.link)) list.push(entry);
      links.add(entry.link);
    }
  };
  add(state.pending.needsManualApply, needsManualApply);
  add(state.pending.autoApplied, autoApplied);
  writeJson("digest", state);
}

export function pendingDigest() {
  return load().pending;
}

export function isDigestDue(now = new Date()) {
  return digestDue(load().lastSent, now, digestHour());
}

export function markDigestSent(now = new Date()) {
  writeJson("digest", { lastSent: localDate(now), pending: { needsManualApply: [], autoApplied: [] } });
}
