// scorer.js
// Picks the CV track that fits a job and computes a 0-100 match score.
// All word lists live in config/profile.json. A lightweight first pass, not
// a human read of the posting. Always read the real posting before applying.

import { PROFILE, TRACKS, DEFAULT_TRACK, resumeFileFor } from "./profile.js";

const { entry, tooSenior, maxYearsAsked } = PROFILE.seniority;
const PROTECTED_PHRASES = [
  ...entry,
  ...Object.values(TRACKS).flatMap((t) => t.titleKeywords),
].filter((w) => w.includes(" "));

// Whole-word matching: "expo" must not match "exposure".
const regexCache = new Map();
function hasTerm(text, term) {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re.test(text);
}

function textBlob(job) {
  return `${job.title || ""} ${job.description || ""}`.toLowerCase();
}

// The longest title keyword that matches, per track. Longer means more
// specific, so "ai tutor" beats the bare "finance" in "AI Tutor - Finance".
function titleMatches(title) {
  const matches = {};
  for (const [key, track] of Object.entries(TRACKS)) {
    const lengths = track.titleKeywords
      .filter((kw) => hasTerm(title, kw))
      .map((kw) => kw.length);
    if (lengths.length) matches[key] = Math.max(...lengths);
  }
  return matches;
}

export function pickCvVersion(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();

  const byTitle = Object.entries(titleMatches(title)).sort(
    (a, b) => b[1] - a[1],
  );
  const pass1Key = byTitle.length ? byTitle[0][0] : null;

  const overlap = {};
  for (const [key, track] of Object.entries(TRACKS)) {
    overlap[key] = track.skillKeywords.filter((kw) => hasTerm(blob, kw)).length;
  }
  const best = Math.max(...Object.values(overlap));
  const topKeys =
    best > 0 ? Object.keys(overlap).filter((k) => overlap[k] === best) : [];
  const pass2Key = topKeys.length
    ? topKeys.includes(DEFAULT_TRACK)
      ? DEFAULT_TRACK
      : topKeys[0]
    : null;

  const cvKey = pass1Key || pass2Key || DEFAULT_TRACK;

  // Flag for a human only when the title gave no clue AND two tracks tie for
  // the best skill match. A clear title is never flagged.
  const needsReview = !pass1Key && topKeys.length > 1;

  return { cvKey, resumeFile: resumeFileFor(cvKey), needsReview };
}

// A seniority word inside a phrase that names the role ("associate program
// manager", "chief of staff") does not count against the job.
function titleWithoutRolePhrases(title) {
  let out = title;
  for (const phrase of PROTECTED_PHRASES) {
    if (hasTerm(out, phrase)) out = out.replace(phrase, " ");
  }
  return out;
}

function asksTooManyYears(blob) {
  const re =
    /(\d+)\s*(?:\+|-\s*\d+|to\s*\d+)?\s*(?:years|yrs)[^.]{0,40}experience/g;
  for (const m of blob.matchAll(re)) {
    if (Number(m[1]) > maxYearsAsked) return true;
  }
  return false;
}

// Each scoring rule adds one reason: { points, label, minor? }. The score is
// 30 plus every reason's points, kept within 0-100. Minor reasons are left
// out of the sheet's Score Why.
const BASE_SCORE = 30;

function matchedTerms(text, terms) {
  return terms.filter((w) => hasTerm(text, w));
}

function daysSince(iso, now) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

function postedLabel(days) {
  if (days === 0) return "posted today";
  if (days === 1) return "posted 1 day ago";
  return `posted ${days} days ago`;
}

function nearYou(location) {
  const { preferred = [], points = 0 } = PROFILE.location || {};
  const loc = (location || "").toLowerCase();
  const place = preferred.find((p) => loc.includes(p.toLowerCase()));
  return place && points ? { points, label: `near you: ${place}` } : null;
}

function reasonsFor(job, now) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();
  const reasons = [];
  const add = (points, label, minor = false) => {
    if (points) reasons.push(minor ? { points, label, minor } : { points, label });
  };

  const skills = matchedTerms(blob, PROFILE.skills);
  add(Math.min(skills.length * 4, 20), `skills: ${skills.slice(0, 3).join(", ")}`);

  const tracks = Object.keys(titleMatches(title));
  if (tracks.length) {
    const best = tracks.sort(
      (a, b) => (TRACKS[b].titleBonus ?? 25) - (TRACKS[a].titleBonus ?? 25),
    )[0];
    add(TRACKS[best].titleBonus ?? 25, `${TRACKS[best].label} title`);
  }

  // Small, founder-close teams score up; big-corporation postings score down.
  const { smallTeam = [], bigCompany = [] } = PROFILE.teamSize || {};
  const small = matchedTerms(blob, smallTeam);
  add(Math.min(small.length * 5, 20), `small team: ${small.slice(0, 3).join(", ")}`);
  const big = matchedTerms(blob, bigCompany);
  if (big.length) add(-15, `big company: ${big[0]}`);

  const senior = matchedTerms(titleWithoutRolePhrases(title), tooSenior);
  const junior = matchedTerms(title, entry);
  if (senior.length) add(-45, `too senior: ${senior[0]}`);
  else if (junior.length) add(20, `entry level: ${junior[0]}`);
  else add(10, "no seniority in title");

  if (asksTooManyYears(blob)) add(-20, `asks over ${maxYearsAsked} years`);
  if ((job.description || "").length > 200) add(5, "full description", true);
  if (job.employmentType) add(5, "job type listed", true);

  const excluded = matchedTerms(title, PROFILE.excludeTitle);
  if (excluded.length) add(-60, `excluded title: ${excluded[0]}`);

  const days = daysSince(job.postedAt, now);
  if (days !== null) {
    const steps = [...(PROFILE.freshness?.steps || [])].sort((a, b) => a.days - b.days);
    const step = steps.find((s) => days < s.days);
    if (step) add(step.points, postedLabel(days));
  }

  const near = nearYou(job.location);
  if (near) add(near.points, near.label);

  // A title that fits no track can't pass on bonuses alone.
  const raw = BASE_SCORE + reasons.reduce((sum, r) => sum + r.points, 0);
  if (!tracks.length && raw > 54) add(54 - raw, "title fits none of your tracks");
  return reasons;
}

export function explainScore(job, now = Date.now()) {
  const reasons = reasonsFor(job, now);
  const total = BASE_SCORE + reasons.reduce((sum, r) => sum + r.points, 0);
  return { score: Math.max(0, Math.min(100, total)), reasons };
}

export function computeMatchScore(job, now) {
  return explainScore(job, now).score;
}

// The sheet's "Score Why": the biggest reasons, largest first.
export function scoreWhy(reasons, limit = 5) {
  return reasons
    .filter((r) => !r.minor)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, limit)
    .map((r) => `${r.label} ${r.points > 0 ? "+" : "−"}${Math.abs(r.points)}`)
    .join(" · ");
}

export function scoreAndTag(job) {
  const { cvKey, resumeFile, needsReview } = pickCvVersion(job);
  const { score, reasons } = explainScore(job);
  return {
    ...job,
    cvVersion: cvKey,
    resumeFile,
    matchScore: score,
    scoreWhy: scoreWhy(reasons),
    needsManualReview: needsReview,
  };
}

// Scores every job, keeps those at or above minimumScore, best first, and
// allows at most maxPerCompany per company so one employer can't fill the
// whole list. Jobs left out come back in later runs, since only jobs
// already in the sheet are skipped.
export function scoreAll(jobs, minimumScore = 55, maxPerCompany = 3) {
  const scored = jobs
    .map(scoreAndTag)
    .filter((j) => j.matchScore >= minimumScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  const perCompany = new Map();
  return scored.filter((j) => {
    const key = (j.company || "unknown").toLowerCase();
    const count = perCompany.get(key) || 0;
    if (count >= maxPerCompany) return false;
    perCompany.set(key, count + 1);
    return true;
  });
}
