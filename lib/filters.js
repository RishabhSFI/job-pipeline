// filters.js
// Keeps jobs in Canada or the US (config/countries.json) and remote jobs with
// no foreign region named.

import { loadJson } from "./loadJson.js";

const countriesConfig = loadJson(import.meta.url, "../config/countries.json");

const REGIONS = countriesConfig.regions;
const FOREIGN_REGIONS = countriesConfig.foreign_regions || [];

const REMOTE_SIGNALS = [
  "remote",
  "worldwide",
  "anywhere",
  "global",
  "distributed",
];

// Phrases in a description that make clear the job is remote.
const REMOTE_TEXT =
  /\b(fully remote|100% remote|remote[- ]first|remote[- ]friendly|work from anywhere|work remotely|remote position|remote role|this is a remote)\b/i;

// These boards only list remote jobs, so every job from them is remote even
// when its location text is just a country name.
const REMOTE_ONLY_SOURCES = [
  "remotive",
  "weworkremotely",
  "himalayas",
  "remoteok",
];

// Set REQUIRE_REMOTE=true in .env.local to drop jobs that don't look remote
// (on-site office jobs from company career pages). Off by default.
const REQUIRE_REMOTE = process.env.REQUIRE_REMOTE === "true";

// Abbreviations real postings use, mapped to the country names in countries.json.
const SYNONYMS = {
  us: "united states",
  "u.s.": "united states",
  usa: "united states",
  "u.s.a.": "united states",
  "united states of america": "united states",
  "north america": "united states",
  canadian: "canada",
};

function hasWord(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

function stripAccents(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Two-letter codes written after a comma, uppercase only: "Toronto, ON".
// Lowercase ", in" / ", or" / ", me" are ordinary words, not state codes.
function codesAfterComma(location) {
  return [...location.matchAll(/,\s*([A-Z]{2})(?![A-Za-z])/g)].map((m) => m[1]);
}

// The eligible country a location names (directly, or through a province,
// state or major city), or null.
function extractNamedCountry(location) {
  const loc = stripAccents(location).toLowerCase();
  const codes = codesAfterComma(stripAccents(location));
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    if (hasWord(loc, alias)) return canonical;
  }
  for (const [country, region] of Object.entries(REGIONS)) {
    const name = country.toLowerCase();
    if (
      hasWord(loc, name) ||
      region.names.some((n) => hasWord(loc, n)) ||
      region.cities.some((c) => hasWord(loc, c)) ||
      codes.some((c) => region.codes.includes(c))
    ) {
      return name;
    }
  }
  return null;
}

function looksRemoteWorldwide(location) {
  const loc = location.toLowerCase();
  return REMOTE_SIGNALS.some((signal) => loc.includes(signal));
}

export function isLocationEligible(location) {
  if (!location || location.trim() === "") {
    return {
      ok: true,
      reason: "No location specified, treated as open/remote",
    };
  }
  const namedCountry = extractNamedCountry(location);
  if (namedCountry) {
    return {
      ok: true,
      reason: `Located in '${namedCountry}', which is on the eligible list`,
    };
  }
  if (isLocationRestricted(location)) {
    return {
      ok: false,
      reason: `Location '${location}' is limited to a region outside Canada and the US`,
    };
  }
  if (looksRemoteWorldwide(location)) {
    return {
      ok: true,
      reason: "Remote/worldwide, no region named",
    };
  }
  return {
    ok: false,
    reason: `Location '${location}' is not in Canada or the US and isn't remote/worldwide`,
  };
}

// True if the job is clearly remote: it came from a remote-only board, the
// location or title says so, or the description says so.
export function isRemoteJob(job) {
  if (REMOTE_ONLY_SOURCES.includes(job.source)) return true;
  const loc = (job.location || "").toLowerCase();
  const title = (job.title || "").toLowerCase();
  if (REMOTE_SIGNALS.some((s) => loc.includes(s) || title.includes(s)))
    return true;
  return REMOTE_TEXT.test((job.description || "").slice(0, 4000));
}

// True when a location names a region or country outside Canada and the US
// ("Remote - Europe", "Remote, EMEA", "Berlin, Germany") and does not also
// name Canada or the US.
export function isLocationRestricted(location) {
  const loc = stripAccents(location || "").toLowerCase();
  if (!loc || extractNamedCountry(location)) return false;
  return FOREIGN_REGIONS.some((r) => hasWord(loc, r));
}

export function filterJobs(jobs) {
  const passed = [];
  for (const job of jobs) {
    if (REQUIRE_REMOTE && !isRemoteJob(job)) continue;
    const { ok, reason } = isLocationEligible(job.location || "");
    if (ok) passed.push({ ...job, eligibilityReason: reason });
  }
  return passed;
}
