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
  // Pick-several filters. An empty list means "any".
  companies: [],
  places: [],
  eligibility: [],
  statuses: [],
  include: "",
  exclude: "",
  favourites: false,
};

// The eligibility groups a job can fall in, read from its Eligibility cell.
export const ELIGIBILITY_KINDS = {
  ok: "No issues",
  tn: "US job, needs a visa",
  check: "Check",
  no: "Not eligible",
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

// "Akron, OH / Irving, TX" -> ["Akron, OH", "Irving, TX"]
export function placesOf(job) {
  return String(job["Country/Remote"] || "")
    .split(/\s*(?:\/|;|\|)\s*/)
    .map((p) => p.trim())
    .filter((p) => p && p !== "N/A");
}

export function eligibilityKind(job) {
  const cell = String(job.Eligibility || "").trim();
  if (cell.startsWith("Not eligible")) return "no";
  if (cell.startsWith("Check")) return "check";
  if (/visa/i.test(cell)) return "tn";
  return "ok";
}

// "analyst, associate" -> ["analyst", "associate"]
const words = (text) =>
  String(text || "")
    .toLowerCase()
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

// One test per filter, so counts can leave one filter out (see facetCounts).
const TESTS = {
  type: (j, f) => typeMatches(j, f.type),
  posted: (j, f, c) => inPostedWindow(j, f.posted, c.now),
  location: (j, f, c) => locationMatches(j, f.location, c.regions),
  track: (j, f) => trackMatches(j, f.track),
  search: (j, f) => searchMatches(j, f.search),
  companies: (j, f) => !f.companies.length || f.companies.includes(j.Company || ""),
  places: (j, f) => !f.places.length || placesOf(j).some((p) => f.places.includes(p)),
  eligibility: (j, f) => !f.eligibility.length || f.eligibility.includes(eligibilityKind(j)),
  statuses: (j, f) => !f.statuses.length || f.statuses.includes(j.Status || ""),
  include: (j, f) => {
    const want = words(f.include);
    const title = String(j["Role Title"] || "").toLowerCase();
    return !want.length || want.some((w) => title.includes(w));
  },
  exclude: (j, f) => {
    const title = String(j["Role Title"] || "").toLowerCase();
    return !words(f.exclude).some((w) => title.includes(w));
  },
  favourites: (j, f) => !f.favourites || String(j.Favourite || "").trim() !== "",
};

export function applyFilters(jobs, filters, { now = new Date(), regions, skip } = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const ctx = { now, regions };
  const tests = Object.entries(TESTS).filter(([key]) => key !== skip);
  return jobs.filter((j) => tests.every(([, test]) => test(j, f, ctx)));
}

// The options for one pick-several filter, each with how many jobs it would
// show given every other filter: [{ value, count }], most jobs first.
// Picked values stay listed even when their count drops to 0.
export function facetCounts(jobs, filters, key, ctx = {}) {
  const valuesOf = {
    companies: (j) => [j.Company || ""],
    places: placesOf,
    eligibility: (j) => [eligibilityKind(j)],
    statuses: (j) => [j.Status || ""],
  }[key];
  const counts = new Map();
  for (const j of applyFilters(jobs, filters, { ...ctx, skip: key })) {
    for (const v of new Set(valuesOf(j))) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  for (const v of filters[key] || []) if (!counts.has(v)) counts.set(v, 0);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// How many filters differ from the defaults, ignoring sort and the search box.
export function activeFilterCount(filters) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  return Object.keys(TESTS).filter(
    (k) => k !== "search" && JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k]),
  ).length;
}

// Keeps only values the page knows, so stale or hand-edited localStorage
// can never put the filters in a state with no way back.
export function cleanFilters(saved, trackKeys = []) {
  const s = saved && typeof saved === "object" ? saved : {};
  const pick = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;
  const text = (v) => (typeof v === "string" ? v.slice(0, 100) : "");
  const list = (v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length <= 100).slice(0, 50) : [];
  return {
    type: pick(s.type, ["all", "Internship", "Full-time"], "all"),
    posted: pick(s.posted, Object.keys(POSTED_WINDOWS), "any"),
    location: pick(s.location, ["all", "canada", "us", "remote"], "all"),
    track: pick(s.track, ["all", ...trackKeys], "all"),
    search: text(s.search),
    sort: pick(s.sort, Object.keys(SORTS), "match"),
    companies: list(s.companies),
    places: list(s.places),
    eligibility: list(s.eligibility).filter((k) => k in ELIGIBILITY_KINDS),
    statuses: list(s.statuses),
    include: text(s.include),
    exclude: text(s.exclude),
    favourites: s.favourites === true,
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
