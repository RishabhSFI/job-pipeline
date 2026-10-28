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

// Small, founder-close teams score up; big-corporation postings score down.
function teamSizeAdjustment(blob) {
  const { smallTeam = [], bigCompany = [] } = PROFILE.teamSize || {};
  const smallHits = smallTeam.filter((w) => hasTerm(blob, w)).length;
  let points = Math.min(smallHits * 5, 20);
  if (bigCompany.some((w) => hasTerm(blob, w))) points -= 15;
  return points;
}

export function computeMatchScore(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();
  let score = 30;

  const skillHits = PROFILE.skills.filter((kw) => hasTerm(blob, kw)).length;
  score += Math.min(skillHits * 4, 20);

  const matchedTracks = Object.keys(titleMatches(title));
  const hasTrackMatch = matchedTracks.length > 0;
  if (hasTrackMatch) {
    score += Math.max(...matchedTracks.map((k) => TRACKS[k].titleBonus ?? 25));
  }

  score += teamSizeAdjustment(blob);

  const seniorTitle = titleWithoutRolePhrases(title);
  if (tooSenior.some((w) => hasTerm(seniorTitle, w))) {
    score -= 45;
  } else if (entry.some((w) => hasTerm(title, w))) {
    score += 20;
  } else {
    score += 10;
  }

  if (asksTooManyYears(blob)) score -= 20;

  if ((job.description || "").length > 200) score += 5;
  if (job.employmentType) score += 5;

  if (PROFILE.excludeTitle.some((w) => hasTerm(title, w))) score -= 60;

  // A title that fits no track can't pass on bonuses alone.
  if (!hasTrackMatch) score = Math.min(score, 54);

  return Math.max(0, Math.min(100, score));
}

export function scoreAndTag(job) {
  const { cvKey, resumeFile, needsReview } = pickCvVersion(job);
  return {
    ...job,
    cvVersion: cvKey,
    resumeFile,
    matchScore: computeMatchScore(job),
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
