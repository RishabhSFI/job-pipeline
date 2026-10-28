// simplify.js
// Simplify's public internship and new-grad lists, published on GitHub.
// Each job keeps its Simplify id so lib/salary.js can look up Simplify's
// salary for it. The files are large (about 13 MB each), so only active
// listings are kept, minus search.simplifySkipCategories in config/profile.json.
// When both lists are read, they hold every open listing, so complete is
// ["all"] and a job missing from them has closed.

import { safeGet, makeJob, toIso } from "./base.js";
import { PROFILE } from "../profile.js";

const LISTS = [
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    jobType: "Internship",
  },
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    jobType: "Full-time",
  },
];

const SKIP_CATEGORIES = new Set(PROFILE.search?.simplifySkipCategories || []);

export async function fetchSimplify() {
  const jobs = [];
  const failed = [];
  for (const { url, jobType } of LISTS) {
    const res = await safeGet(url);
    if (!res) {
      failed.push(url);
      continue;
    }
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
          postedAt: toIso(l.date_posted),
          jobType,
          terms: l.terms || [],
        }),
      );
    }
  }
  return { jobs, complete: failed.length ? [] : ["all"], failed };
}
