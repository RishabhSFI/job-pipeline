// ycombinator.js
// YC's public job board (ycombinator.com/jobs). Every company on it is a
// small YC startup. The page embeds its listings as JSON in a data-page
// attribute, so no login or API key is needed.

import { safeGet, makeJob } from "./base.js";

const ROLES = ["operations", "finance"];

function decodeAttr(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// YC writes locations as "City, Region, CC / Remote (US)". Keep only the
// parts in the US or Canada, so "Barcelona, CT, ES" is not read as Connecticut.
function northAmericanLocation(location) {
  const parts = location.split("/").map((s) => s.trim());
  return parts
    .filter((part) => {
      if (/^remote/i.test(part)) return /\b(US|CA|Canada|Global|Worldwide)\b/i.test(part) || part === "Remote";
      const country = part.split(",").pop().trim();
      return country === "US" || country === "CA";
    })
    .join(" / ");
}

export async function fetchYCombinator() {
  const jobs = [];
  for (const role of ROLES) {
    const res = await safeGet(`https://www.ycombinator.com/jobs/role/${role}`);
    if (!res) continue;
    const match = (await res.text()).match(/data-page="([^"]*)"/);
    if (!match) continue;
    const postings = JSON.parse(decodeAttr(match[1])).props?.jobPostings || [];
    for (const p of postings) {
      const location = northAmericanLocation(p.location || "");
      if (!location) continue;
      jobs.push(
        makeJob({
          title: p.title || "",
          company: p.companyName || "",
          location,
          employmentType: p.type || "",
          link: `https://www.ycombinator.com${p.url || ""}`,
          description: [
            `Y Combinator ${p.companyBatchName || ""} startup: ${p.companyOneLiner || ""}.`,
            `Experience: ${p.minExperience || "not stated"}.`,
            p.salaryRange ? `Salary: ${p.salaryRange}.` : "",
            p.visa ? `Visa: ${p.visa}.` : "",
          ].join(" "),
          source: "ycombinator",
          salary: p.salaryRange || "",
        }),
      );
    }
  }
  return jobs;
}
