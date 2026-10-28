// fetchLock.js
// One search at a time, whether started by the schedule or the dashboard. An in-memory flag covers this
// server process; data/fetch.lock (with a timestamp) covers a second process
// or a restart mid-run. A lock older than 15 minutes is treated as dead.

import fs from "fs";
import path from "path";
import { DATA_DIR } from "./store.js";

export const STALE_MS = 15 * 60_000;
const FILE = path.join(DATA_DIR, "fetch.lock");
let running = false;
let startedAt = 0;

function lockedByFile(now) {
  try {
    const { at } = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return now - Number(at) < STALE_MS;
  } catch {
    return false;
  }
}

// True when the caller now holds the lock.
export function acquireFetchLock(now = Date.now()) {
  if (running && now - startedAt < STALE_MS) return false;
  if (lockedByFile(now)) return false;
  running = true;
  startedAt = now;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ at: now }));
  return true;
}

export function releaseFetchLock() {
  running = false;
  fs.rmSync(FILE, { force: true });
}
