// remotive.js
// Remotive public API, no key required. https://remotive.com/api/remote-jobs

import { safeGet, makeJob } from "./base.js";
import { PROFILE } from "../profile.js";

const API_URL = "https://remotive.com/api/remote-jobs";

// Both lists come from search in config/profile.json.
const CATEGORIES = PROFILE.search?.remotiveCategories || [];
const SEARCH_TERMS = PROFILE.search?.terms || [];

export async function fetchRemotive() {
  const jobs = [];
  const seen = new Set();

  const queries = [
    ...CATEGORIES.map((category) => ({ category })),
    ...SEARCH_TERMS.map((search) => ({ search })),
  ];
  for (const query of queries) {
    const res = await safeGet(API_URL, query);
    if (!res) continue;
    const data = await res.json();
    for (const item of data.jobs || []) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      jobs.push(makeJob({
        title: item.title || "",
        company: item.company_name || "",
        location: item.candidate_required_location || "Worldwide",
        employmentType: item.job_type || "",
        link: item.url || "",
        description: item.description || "",
        source: "remotive",
      }));
    }
  }
  return jobs;
}
