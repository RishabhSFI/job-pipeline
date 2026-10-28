// resume.js
// Your base resume and the tailored versions saved per job (server only).
//   data/resume.json             base resume (see lib/resumeModel.js for the shape)
//   data/versions/<id>.json      { id, savedAs, jobId, track, updatedAt, resume }

import fs from "fs";
import path from "path";
import { readJson, writeJson, listJson, removeJson } from "./store.js";

const EXAMPLE = path.join(process.cwd(), "config", "resume.example.json");

export function loadBaseResume() {
  return readJson("resume") || JSON.parse(fs.readFileSync(EXAMPLE, "utf-8"));
}

export function saveBaseResume(resume) {
  return writeJson("resume", resume);
}

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "version";

export function listVersions() {
  return listJson("versions")
    .map(({ resume, ...meta }) => meta)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getVersion(id) {
  return readJson(`versions/${slug(id)}`);
}

export function saveVersion({ id, savedAs, jobId = "", track = "", resume }) {
  const key = slug(id || savedAs);
  return writeJson(`versions/${key}`, {
    id: key,
    savedAs: savedAs || key,
    jobId,
    track,
    updatedAt: new Date().toISOString(),
    resume,
  });
}

export function deleteVersion(id) {
  removeJson(`versions/${slug(id)}`);
}
