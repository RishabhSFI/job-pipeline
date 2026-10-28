// index.js
// Runs every source fetcher and returns one combined list. Each fetcher is
// isolated: if one source fails (API down, format changed), the others
// still run. Failures are recorded, not thrown, so a run never dies partway
// through because of one broken source.

import { fetchRemotive } from "./remotive.js";
import { fetchWeWorkRemotely } from "./weworkremotely.js";
import { fetchHimalayas } from "./himalayas.js";
import { fetchRemoteOK } from "./remoteok.js";
import { fetchGreenhouse } from "./greenhouse.js";
import { fetchLever } from "./lever.js";
import { fetchAshby } from "./ashby.js";
import { fetchBambooHR } from "./bamboohr.js";
import { fetchYCombinator } from "./ycombinator.js";
import { fetchHNHiring } from "./hnhiring.js";
import { fetchSimplify } from "./simplify.js";
import { fetchEmailAlerts } from "./emailAlerts.js";

const ALL_FETCHERS = {
  remotive: fetchRemotive,
  weworkremotely: fetchWeWorkRemotely,
  himalayas: fetchHimalayas,
  remoteok: fetchRemoteOK,
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  bamboohr: fetchBambooHR,
  ycombinator: fetchYCombinator,
  hnhiring: fetchHNHiring,
  simplify: fetchSimplify,
  emailalerts: fetchEmailAlerts,
};

// Fetchers return a list of jobs, or { jobs, complete, failed } when they read
// listings that hold every open job (see fetchBoards in base.js).
//
// Returns { jobs, sources: [{ name, ok, count, error? }], complete } where
// complete is a Set of "source:listing" keys, e.g. "greenhouse:stripe" or
// "simplify:all", read in full this run.
export async function fetchAll() {
  const jobs = [];
  const sources = [];
  const complete = new Set();
  for (const [name, fetchFn] of Object.entries(ALL_FETCHERS)) {
    try {
      const result = await fetchFn();
      const found = Array.isArray(result) ? result : result.jobs;
      const failed = Array.isArray(result) ? [] : result.failed || [];
      for (const key of Array.isArray(result) ? [] : result.complete || []) {
        complete.add(`${name}:${key}`);
      }
      console.log(`[fetchers] ${name}: ${found.length} jobs`);
      jobs.push(...found);
      sources.push({
        name,
        ok: !(failed.length && !found.length),
        count: found.length,
        ...(failed.length ? { error: `could not read ${failed.join(", ")}` } : {}),
      });
    } catch (err) {
      console.warn(`[fetchers] ${name} FAILED: ${err.message}`);
      sources.push({ name, ok: false, count: 0, error: err.message });
    }
  }
  return { jobs, sources, complete };
}
