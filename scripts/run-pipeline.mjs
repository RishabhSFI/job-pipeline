// scripts/run-pipeline.mjs
// Runs the job search directly with Node. No web server and no build, so
// it is light enough for the VPS. The scheduled job runs this with
// --scheduled, so the run log can tell scheduled runs from yours.
//
//   node --env-file=.env.local scripts/run-pipeline.mjs [--scheduled]
//
// Exit code 0 = finished, 1 = the run failed (the reason is printed).

import { runPipeline } from "../lib/pipeline.js";
import { acquireFetchLock, releaseFetchLock } from "../lib/fetchLock.js";

const started = new Date();
console.log(`[${started.toISOString()}] pipeline starting`);

// One search at a time, shared with the dashboard's Fetch now button, so
// two runs never add the same jobs.
if (!acquireFetchLock()) {
  console.log("Another search is already running; skipping this one.");
  process.exit(0);
}
const trigger = process.argv.includes("--scheduled") ? "schedule" : "manual";
let result;
try {
  result = await runPipeline({ trigger });
} finally {
  releaseFetchLock();
}

console.log(
  `[${new Date().toISOString()}] pipeline ${result.success ? "finished" : "FAILED"}`,
);
if (!result.success) console.error(result.error);

process.exit(result.success ? 0 : 1);
