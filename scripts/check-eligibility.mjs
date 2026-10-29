// scripts/check-eligibility.mjs
// Re-checks every open job in your sheet against the eligibility facts in
// config/applyKit.json, hiding ones you can't take and bringing back ones
// you now can. The job search does this on every run; use this right after
// editing your facts.
//
//   node --env-file=.env.local scripts/check-eligibility.mjs

import { getAllJobs } from "../lib/sheets.js";
import { recheckEligibility } from "../lib/pipeline.js";
import { loadApplyKit } from "../lib/applyKit.js";

const facts = loadApplyKit().eligibility || {};
if (!facts.workIn?.length && !facts.graduation) {
  console.log("No eligibility facts yet: fill in \"eligibility\" in config/applyKit.json first.");
  process.exit(1);
}
const rows = await getAllJobs();
const { hidden, unhidden } = await recheckEligibility(rows, facts);
const flagged = rows.filter((r) => String(r.Eligibility || "").startsWith("Check")).length;
console.log(`Hidden ${hidden} jobs you can't take, brought back ${unhidden}.`);
console.log(`Run again after the next search to see "Check" warnings counted (${flagged} before this run).`);
