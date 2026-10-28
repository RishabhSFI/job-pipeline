// jobFilters.js
// Pure helpers behind the dashboard's filters. They run in the browser, so
// nothing here touches the disk. Jobs are sheet rows keyed by column name.

// `regions` is config/countries.json's "regions" map. The page imports the
// file and passes it in, so these helpers also load in plain Node.

export const POSTED_WINDOWS = {
  any: null,
  "24h": 1,
  "48h": 2,
  "7d": 7,
};

export const DEFAULT_FILTERS = {
  type: "all",
  posted: "any",
  location: "all",
  track: "all",
  search: "",
  sort: "match",
};

export const SORTS = { match: "Best match", newest: "Newest posted" };

const DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A Date for a sheet cell, or null. A date with no time counts as the end of
// that day, so "posted today" is never older than a day.
export function parseJobDate(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const ms = Date.parse(DATE_ONLY.test(s) ? `${s}T23:59:59` : s);
  return Number.isNaN(ms) ? null : new Date(ms);
}

// When the job went up: Posted Date, or Date Found when that is blank.
export function postedAt(job) {
  return parseJobDate(job["Posted Date"]) || parseJobDate(job["Date Found"]);
}

export function inPostedWindow(job, windowKey, now = new Date()) {
  const days = POSTED_WINDOWS[windowKey];
  if (days == null) return true;
  const at = postedAt(job);
  return at !== null && now - at <= days * DAY;
}

function hasWord(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

const REGION_OF = { canada: "Canada", us: "United States" };
const US_ALIASES = ["us", "usa", "u.s.", "u.s.a.", "united states of america"];
const REMOTE_WORDS = ["remote", "worldwide", "anywhere", "distributed", "global"];

function namesRegion(location, regionKey, regions) {
  const region = regions[REGION_OF[regionKey]];
  const lower = location.toLowerCase();
  const codes = [...location.matchAll(/,\s*([A-Z]{2})(?![A-Za-z])/g)].map(
    (m) => m[1],
  );
  const terms = [
    REGION_OF[regionKey].toLowerCase(),
    ...(regionKey === "us" ? US_ALIASES : ["canadian"]),
    ...region.names,
    ...region.cities,
  ];
  return (
    terms.some((t) => hasWord(lower, t)) ||
    codes.some((c) => region.codes.includes(c))
  );
}

export function locationMatches(job, locationKey, regions) {
  if (locationKey === "all") return true;
  const where = String(job["Country/Remote"] || "");
  if (locationKey === "remote") {
    const lower = where.toLowerCase();
    return REMOTE_WORDS.some((w) => lower.includes(w));
  }
  return namesRegion(where, locationKey, regions);
}

export function typeMatches(job, typeKey) {
  return typeKey === "all" || (job["Job Type"] || "") === typeKey;
}

export function trackMatches(job, trackKey) {
  return trackKey === "all" || job["CV Version Used"] === trackKey;
}

export function searchMatches(job, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return `${job["Role Title"] || ""} ${job.Company || ""}`
    .toLowerCase()
    .includes(needle);
}

export function applyFilters(jobs, filters, { now = new Date(), regions } = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  return jobs.filter(
    (j) =>
      typeMatches(j, f.type) &&
      inPostedWindow(j, f.posted, now) &&
      locationMatches(j, f.location, regions) &&
      trackMatches(j, f.track) &&
      searchMatches(j, f.search),
  );
}

// Keeps only values the page knows, so stale or hand-edited localStorage
// can never put the filters in a state with no way back.
export function cleanFilters(saved, trackKeys = []) {
  const s = saved && typeof saved === "object" ? saved : {};
  const pick = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;
  return {
    type: pick(s.type, ["all", "Internship", "Full-time"], "all"),
    posted: pick(s.posted, Object.keys(POSTED_WINDOWS), "any"),
    location: pick(s.location, ["all", "canada", "us", "remote"], "all"),
    track: pick(s.track, ["all", ...trackKeys], "all"),
    search: typeof s.search === "string" ? s.search.slice(0, 100) : "",
    sort: pick(s.sort, Object.keys(SORTS), "match"),
  };
}

// "match": highest score first, newer first on ties.
// "newest": jobs with a real posted date first, most recent first; then jobs
// known only by the day they were found (they may be much older); then jobs
// with no date. Higher score first on ties.
export function sortJobs(jobs, sort = "match") {
  const score = (j) => Number(j["Match Score"] || 0);
  const time = (j) => postedAt(j)?.getTime() ?? -Infinity;
  const rank = (j) => (parseJobDate(j["Posted Date"]) ? 2 : postedAt(j) ? 1 : 0);
  const byScore = (a, b) => score(b) - score(a);
  const byTime = (a, b) => rank(b) - rank(a) || time(b) - time(a);
  return [...jobs].sort(
    sort === "newest"
      ? (a, b) => byTime(a, b) || byScore(a, b)
      : (a, b) => byScore(a, b) || byTime(a, b),
  );
}

// "Startup title +30 · entry level +20" -> ["Startup title +30", "entry level +20"]
export function scoreReasons(job) {
  return String(job["Score Why"] || "")
    .split(/\s*[·•|;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// "2h ago", "3 days ago", or "" for a missing or unreadable time.
// "Posted today", "Posted 3 days ago", or "Found …" when only Date Found is known.
export function postedLabel(job, now = new Date()) {
  const posted = String(job["Posted Date"] || "").slice(0, 10);
  const day = posted || String(job["Date Found"] || "").slice(0, 10);
  if (!DATE_ONLY.test(day)) return "";
  const [y, m, d] = day.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / DAY,
  );
  const verb = posted ? "Posted" : "Found";
  if (days <= 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  return `${verb} ${days} days ago`;
}

export function timeAgo(iso, now = new Date()) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// Sources whose newest result failed.
export function failingSources(sources = []) {
  return sources.filter((s) => s && s.ok === false);
}
