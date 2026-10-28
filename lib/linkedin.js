// linkedin.js
// Builds LinkedIn search links for a job. These are plain search URLs you
// open yourself in the browser; nothing is scraped or automated.
// The people searches come from "linkedinSearches" in config/profile.json,
// where {company} and {role} are filled in per job. The caller passes them
// in, because this file runs both in the browser and in plain Node.

const SEPARATORS = /\s+[-–—|]\s+|[,()\[\]|/]/;
const NOISE =
  /\b(intern(ship)?|co-?op|summer|fall|winter|spring|new grads?|under ?grad(uate)?|graduate|20\d\d|i{1,3}|iv|remote|hybrid|onsite|contract|part[- ]time|full[- ]time)\b/gi;

// The part of a job title that names the role. Titles are split at commas,
// dashes and brackets; the part containing one of your role keywords wins,
// otherwise the first part. Season, year and intern words are dropped.
// "Associate, Strategic Finance" -> "Strategic Finance"
// "Summer 2027 Finance Intern (Toronto)" -> "Finance"
export function roleForSearch(title, roleKeywords = []) {
  const parts = String(title || "")
    .split(SEPARATORS)
    .map((p) => p.replace(NOISE, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const lower = roleKeywords.map((k) => k.toLowerCase());
  return (
    parts.find((p) => lower.some((k) => p.toLowerCase().includes(k))) ||
    parts[0] ||
    ""
  );
}

export function linkedinLinks(company, title, searches = [], roleKeywords = []) {
  const name = (company || "").trim();
  const role = roleForSearch(title, roleKeywords);
  const url = (type, keywords) =>
    `https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(keywords)}`;
  return [
    { label: "Company on LinkedIn", url: url("companies", name) },
    ...searches.map((s) => ({
      label: s.label,
      url: url(
        "people",
        s.keywords
          .replace("{company}", name)
          .replace("{role}", role)
          .replace(/\s+/g, " ")
          .trim(),
      ),
    })),
  ];
}
