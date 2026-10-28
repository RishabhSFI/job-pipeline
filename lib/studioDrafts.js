// studioDrafts.js
// Unsaved Resume Studio work, autosaved per job (server only).
//   data/studio-drafts/<key>.json  { key, savedAt, jobId, versionId, savedAs, track, description, resume }
// key comes from draftKey() in lib/studio.js.

import { readJson, writeJson, removeJson } from "./store.js";

export const isDraftKey = (key) => /^[a-z0-9-]{1,80}$/.test(String(key));

export const getDraft = (key) => readJson(`studio-drafts/${key}`);

export function saveDraft(key, { jobId = "", versionId = "", savedAs = "", track = "", description = "", resume }) {
  return writeJson(`studio-drafts/${key}`, {
    key,
    savedAt: new Date().toISOString(),
    jobId: String(jobId),
    versionId: String(versionId),
    savedAs: String(savedAs),
    track: String(track),
    description: String(description),
    resume,
  });
}

export const deleteDraft = (key) => removeJson(`studio-drafts/${key}`);
