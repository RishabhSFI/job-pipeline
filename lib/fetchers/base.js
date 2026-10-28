// base.js
// Shared job shape and a safe fetch wrapper every source fetcher uses.

export function makeJob(fields) {
  const job = {
    title: "",
    company: "",
    location: "",
    employmentType: "",
    link: "",
    description: "",
    source: "",
    postedAt: "",
    ...fields,
  };
  // Keep memory small on the VPS: very long descriptions are cut at 12,000
  // characters, which still covers the text the filters and scorer read.
  job.description = String(job.description || "").slice(0, 12000);
  return job;
}

// An ISO date from what a source gives: an ISO string, or a Unix time in
// seconds or milliseconds. "" when there is none or it can't be read.
export function toIso(value) {
  if (value === null || value === undefined || value === "") return "";
  let ms = value;
  if (typeof value === "number") ms = value < 1e12 ? value * 1000 : value;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

const AGO_UNIT_MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

// "3 days", "about 1 month", "an hour" (time since posting) to a rough ISO date.
export function agoToIso(text, now = Date.now()) {
  const m = String(text || "").toLowerCase().match(/(\d+|an?)\s+(minute|hour|day|week|month|year)s?/);
  if (!m) return "";
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  return new Date(now - n * AGO_UNIT_MS[m[2]]).toISOString();
}

// Company job boards (Greenhouse, Lever, Ashby) list every open job a company
// has. Their fetchers return { jobs, complete, failed }: complete names each
// board read in full this run (slugs), failed the ones that could not be read.
// A board that answers with no jobs at all is not counted as complete, so an
// empty or glitched answer never closes jobs.
export async function fetchBoards(slugs, url, toJobs, params = {}) {
  const jobs = [];
  const complete = [];
  const failed = [];
  for (const slug of slugs) {
    const res = await safeGet(url(slug), params);
    let found = null;
    try {
      found = res ? toJobs(await res.json(), slug) : null;
    } catch (err) {
      console.warn(`[fetchers] ${url(slug)} unreadable: ${err.message}`);
    }
    if (!found) {
      failed.push(slug);
      continue;
    }
    jobs.push(...found);
    if (found.length) complete.push(slug);
  }
  return { jobs, complete, failed };
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; job-pipeline-bot/1.0; personal use)",
};

export async function safeGet(url, params = {}) {
  try {
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const res = await fetch(fullUrl, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`[fetchers] ${url} returned status ${res.status}`);
      return null;
    }
    return res;
  } catch (err) {
    console.warn(`[fetchers] request to ${url} failed: ${err.message}`);
    return null;
  }
}
