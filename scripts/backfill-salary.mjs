// scripts/backfill-salary.mjs
// Fills the Est. Salary column for rows already in the sheet that say
// "Not listed" or are blank. Re-fetches every source once to get each job's
// posting text, then uses the same lookup as the daily run.
//
//   node --env-file=.env.local scripts/backfill-salary.mjs
//   ... --all   redoes every row, not just the missing ones

import { getAllJobs, setSalaries } from "../lib/sheets.js";
import { fetchAllJobs } from "../lib/fetchers/index.js";
import { resolveSalary, simplifyIdMap, normalizeLink } from "../lib/salary.js";

const all = process.argv.includes("--all");
const rows = (await getAllJobs()).filter(
  (r) => all || !r["Est. Salary"] || r["Est. Salary"] === "Not listed",
);
console.log(`${rows.length} rows to check`);

const raw = await fetchAllJobs();
const byLink = new Map(raw.map((j) => [normalizeLink(j.link), j]));
const simplifyIds = simplifyIdMap(raw);

const updates = [];
for (const r of rows) {
  const job = byLink.get(normalizeLink(r.Link)) || { link: r.Link };
  const value = await resolveSalary(job, simplifyIds);
  if (value !== "Not listed") updates.push({ row: r._row, value });
}
await setSalaries(updates);
console.log(`Filled ${updates.length} of ${rows.length}`);
