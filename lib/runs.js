// runs.js
// A log of every job search run and how each source did, for the
// dashboard's "last fetched" line and source health.
// data/runs.json = { runs: [Run] } newest first, at most 100 kept.
// Run: { at, trigger: "schedule" | "dashboard" | "manual", ms, ok, error?,
//        sources: [{ name, ok, count, error? }], added, closed }

import { readJson, writeJson } from "./store.js";

const KEEP = 100;

export function recordRun(run) {
  const log = readJson("runs", { runs: [] });
  log.runs = [run, ...log.runs].slice(0, KEEP);
  writeJson("runs", log);
  return run;
}

export function recentRuns(limit = 10) {
  return readJson("runs", { runs: [] }).runs.slice(0, limit);
}

// The newest result per source name, across recent runs.
export function sourceHealth() {
  const latest = new Map();
  for (const run of recentRuns(KEEP)) {
    for (const s of run.sources || []) {
      if (!latest.has(s.name)) latest.set(s.name, { ...s, at: run.at });
    }
  }
  return [...latest.values()];
}
