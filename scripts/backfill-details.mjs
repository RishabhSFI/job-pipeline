// scripts/backfill-details.mjs
// Fills Posted Date, Job Type and Score Why (and refreshes Match Score) for
// rows added before those columns existed. Jobs still listed somewhere get
// their real posted date; the rest are scored from their saved posting text.
//
//   node --env-file=.env.local scripts/backfill-details.mjs

import { getAllJobs, updateFieldMany } from "../lib/sheets.js";
import { fetchAll } from "../lib/fetchers/index.js";
import { getPosting } from "../lib/postings.js";
import { jobId, normalizeLink } from "../lib/jobId.js";
import { jobTypeOf } from "../lib/jobType.js";
import { scoreAndTag } from "../lib/scorer.js";

const rows = (await getAllJobs()).filter(
  (r) => r.Link && (!r["Posted Date"] || !r["Job Type"] || !r["Score Why"]),
);
console.log(`${rows.length} rows missing details`);

const { jobs } = await fetchAll();
const live = new Map(jobs.map((j) => [normalizeLink(j.link), j]));

const updates = { "Posted Date": [], "Job Type": [], "Score Why": [], "Match Score": [] };
let fromLive = 0;
for (const r of rows) {
  const found = live.get(normalizeLink(r.Link));
  const saved = getPosting(jobId(r.Link));
  const job = found || (saved && { ...saved, postedAt: "" });
  if (!job) continue;
  if (found) fromLive++;
  const tagged = scoreAndTag({ ...job, jobType: jobTypeOf(job) });
  const posted = (job.postedAt || "").slice(0, 10);
  if (!r["Posted Date"] && posted) updates["Posted Date"].push({ row: r._row, value: posted });
  if (!r["Job Type"]) updates["Job Type"].push({ row: r._row, value: jobTypeOf(job) });
  if (!r["Score Why"]) {
    updates["Score Why"].push({ row: r._row, value: tagged.scoreWhy });
    updates["Match Score"].push({ row: r._row, value: tagged.matchScore });
  }
}
for (const [column, list] of Object.entries(updates)) await updateFieldMany(column, list);
console.log(
  `Matched ${fromLive} to live listings. Filled: posted date ${updates["Posted Date"].length}, ` +
    `job type ${updates["Job Type"].length}, score reasons ${updates["Score Why"].length}.`,
);
