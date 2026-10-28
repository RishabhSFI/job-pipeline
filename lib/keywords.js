// keywords.js
// Which important terms a job posting uses, and which of them your resume
// already covers. Vocabulary: config/keywords.json plus skills and each
// track's skillKeywords in config/profile.json (not job titles). Pure functions: callers pass the config
// in, so this runs in the browser and in Node.

const regexCache = new Map();
export function hasTerm(text, term) {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re.test(text);
}

export function vocabulary(profile, keywordsConfig) {
  const words = [
    ...(keywordsConfig?.terms || []),
    ...(profile?.skills || []),
    ...Object.values(profile?.tracks || {}).flatMap((t) => t.skillKeywords),
  ];
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

// Terms from the vocabulary that appear in the posting, most-mentioned first.
export function postingKeywords(description, vocab) {
  const text = String(description || "").toLowerCase();
  return vocab
    .filter((term) => hasTerm(text, term))
    .map((term) => ({ term, count: text.split(term).length - 1 }))
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length)
    .map((k) => k.term);
}

// { covered: [...], missing: [...], percent } for a resume's plain text.
export function coverage(resumeText, keywords) {
  const text = String(resumeText || "").toLowerCase();
  const covered = keywords.filter((k) => hasTerm(text, k));
  const missing = keywords.filter((k) => !hasTerm(text, k));
  return {
    covered,
    missing,
    percent: keywords.length ? Math.round((covered.length / keywords.length) * 100) : 0,
  };
}
