// simplify.js
// Simplify's public internship and new-grad lists, published on GitHub.
// Each job keeps its Simplify id so lib/salary.js can look up Simplify's
// salary for it. The files are large (about 13 MB each), so only active,
// non-engineering roles are kept.

import { safeGet, makeJob } from "./base.js";

const LISTS = [
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
];

const SKIP_CATEGORIES = new Set(["Hardware", "Hardware Engineering"]);

export async function fetchSimplify() {
  const jobs = [];
  for (const url of LISTS) {
    const res = await safeGet(url);
    if (!res) continue;
    const listings = await res.json();
    for (const l of listings) {
      if (!l.active || !l.is_visible || SKIP_CATEGORIES.has(l.category)) continue;
      jobs.push(
        makeJob({
          title: l.title || "",
          company: l.company_name || "",
          location: (l.locations || []).join(" / "),
          employmentType: (l.terms || []).join(", "),
          link: l.url || "",
          description: `Listed on Simplify: ${(l.terms || []).join(", ")} ${l.category || ""}.`,
          source: "simplify",
          simplifyId: l.id,
        }),
      );
    }
  }
  return jobs;
}
