// jobType.js
// Internship or full-time, and whether an internship's term has already
// started. Terms are "Summer 2027" style, from Simplify or the job title.
// Seasons start: Winter in January, Spring in April, Summer in May, Fall in
// September, so a term counts as started from the first of that month.

const SEASON_START_MONTH = { winter: 0, spring: 3, summer: 4, fall: 8 };
const TERM_RE = /\b(winter|spring|summer|fall)\s+(20\d\d)\b/gi;
const INTERN_RE = /\b(intern|interns|internship|co-?op|summer (analyst|associate)|placement student)\b/i;

export function termsOf(job) {
  const listed = (job.terms || []).filter(Boolean);
  if (listed.length) return listed;
  return [...(job.title || "").matchAll(TERM_RE)].map((m) => m[0]);
}

export function jobTypeOf(job) {
  if (job.jobType) return job.jobType;
  const text = `${job.title || ""} ${job.employmentType || ""}`;
  return INTERN_RE.test(text) ? "Internship" : "Full-time";
}

// The term's first day, or null for "N/A" and other text that isn't a term.
export function termStart(term) {
  const m = String(term).match(/^\s*(winter|spring|summer|fall)\s+(20\d\d)\s*$/i);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[2]), SEASON_START_MONTH[m[1].toLowerCase()], 1));
}

// True for an internship whose every term has already begun. A job with no
// terms, or any term that is open-ended or still ahead, is kept.
export function internshipAlreadyStarted(job, today = new Date()) {
  if (jobTypeOf(job) !== "Internship") return false;
  const starts = termsOf(job).map(termStart);
  if (!starts.length || starts.includes(null)) return false;
  return starts.every((start) => start <= today);
}
