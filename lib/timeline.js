// timeline.js
// What happened to each job and when: found, status changes, closed,
// reopened. data/timeline/<jobId>.json = [{ at, kind, detail }], oldest first.
// kind: "found" | "status" | "closed" | "reopened" | "note"

import { readJson, writeJson } from "./store.js";

export function logEvent(id, kind, detail = "", at = new Date()) {
  const events = readJson(`timeline/${id}`, []);
  events.push({ at: at.toISOString(), kind, detail });
  writeJson(`timeline/${id}`, events);
  return events;
}

export function getTimeline(id) {
  return readJson(`timeline/${id}`, []);
}
