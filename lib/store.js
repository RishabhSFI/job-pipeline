// store.js
// Private local storage for things that don't belong in the Google Sheet:
// your structured resume, saved resume versions, job posting text and
// outreach contacts. Everything lives under data/, which is gitignored.

import fs from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data");

function fileFor(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!file.startsWith(DATA_DIR + path.sep)) throw new Error(`Bad store name: ${name}`);
  return file;
}

export function readJson(name, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), "utf-8"));
  } catch {
    return fallback;
  }
}

// Writes to a temp file first, so a crash never leaves half a file.
export function writeJson(name, data) {
  const file = fileFor(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return data;
}

export function listJson(dir) {
  try {
    return fs
      .readdirSync(path.join(DATA_DIR, dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson(`${dir}/${f.slice(0, -5)}`))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function removeJson(name) {
  fs.rmSync(fileFor(name), { force: true });
}
