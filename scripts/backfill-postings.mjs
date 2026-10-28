// scripts/backfill-postings.mjs
// Saves the posting text for jobs already in your sheet, so their job pages
// have the full description. Jobs added by the daily run get this
// automatically; this is only for older rows.
//
//   node --env-file=.env.local scripts/backfill-postings.mjs

import { getAllJobs } from "../lib/sheets.js";
import { fetchAll } from "../lib/fetchers/index.js";
import { savePosting, getPosting } from "../lib/postings.js";
import { jobId, normalizeLink } from "../lib/jobId.js";

const rows = (await getAllJobs()).filter((r) => r.Link && !getPosting(jobId(r.Link)));
console.log(`${rows.length} jobs without saved posting text`);
const byLink = new Map((await fetchAll()).jobs.map((j) => [normalizeLink(j.link), j]));
let saved = 0;
for (const r of rows) {
  const job = byLink.get(normalizeLink(r.Link));
  if (!job) continue;
  savePosting(job, r["Est. Salary"]);
  saved++;
}
console.log(`Saved ${saved}. The rest are no longer listed; their job pages read the live posting instead.`);
