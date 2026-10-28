// himalayas.js
// Public jobs search API, no key required. https://himalayas.app/jobs/api
// Search returns 20 jobs per query. Queries are search.terms in config/profile.json.

import { safeGet, makeJob } from "./base.js";
import { PROFILE } from "../profile.js";

const SEARCH_URL = "https://himalayas.app/jobs/api/search";
const QUERIES = PROFILE.search?.terms || [];

export async function fetchHimalayas() {
  const jobs = [];
  const seen = new Set();
  for (const q of QUERIES) {
    const res = await safeGet(SEARCH_URL, { q });
    if (!res) continue;

    const data = await res.json();
    for (const item of data.jobs || []) {
      const link = item.applicationLink || item.guid || "";
      if (seen.has(link)) continue;
      seen.add(link);
      const locations = item.locationRestrictions || [];
      jobs.push(makeJob({
        title: item.title || "",
        company: item.companyName || "",
        location: locations.length ? locations.join(", ") : "Worldwide",
        employmentType: item.employmentType || "",
        link,
        description: item.description || item.excerpt || "",
        source: "himalayas",
      }));
    }
  }
  return jobs;
}
