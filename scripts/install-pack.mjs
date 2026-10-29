// scripts/install-pack.mjs
// Installs a "profile pack": someone's ready-made setup (their tracks and
// keywords, apply kit, structured resume, resume PDF), usually a zip a friend
// prepared for them. Checks every file before copying, and backs up anything
// it replaces to data/backups/<time>/.
//
//   npm run install-pack -- ~/Downloads/friends-pack.zip
//   npm run install-pack -- path/to/pack-folder
//
// What goes where (by file name inside the pack):
//   profile.json      -> config/profile.json
//   applyKit.json     -> config/applyKit.json
//   resume.json       -> data/resume.json      (Resume Studio)
//   companies.json    -> config/companies.json (optional)
//   xSearches.json    -> config/xSearches.json (optional)
//   keywords.json     -> config/keywords.json  (optional)
//   *.pdf             -> resumes/<the file name profile.json expects>
//   anything else     -> data/pack/ (notes, LaTeX source, debriefs)

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { isResume } from "../lib/studio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = {
  "profile.json": "config/profile.json",
  "applyKit.json": "config/applyKit.json",
  "resume.json": "data/resume.json",
  "companies.json": "config/companies.json",
  "xSearches.json": "config/xSearches.json",
  "keywords.json": "config/keywords.json",
};

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// Problems with a file, as plain sentences (empty = fine).
export function checkPackFile(name, data, others = {}) {
  const problems = [];
  const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (name === "profile.json") {
    const tracks = data?.tracks;
    if (!tracks || typeof tracks !== "object" || !Object.keys(tracks).length) problems.push("has no tracks");
    for (const [key, t] of Object.entries(tracks || {})) {
      if (!t?.label) problems.push(`track ${key} has no label`);
      if (!isList(t?.titleKeywords) || !t.titleKeywords.length) problems.push(`track ${key} has no titleKeywords`);
      if (!isList(t?.skillKeywords)) problems.push(`track ${key} has no skillKeywords list`);
      if (t?.resume && !data.resumes?.[t.resume]) problems.push(`track ${key} points at resume "${t.resume}", which isn't in resumes`);
    }
    if (!data?.resumes || !Object.keys(data.resumes).length) problems.push("has no resumes");
    if (!data?.seniority?.tooSenior) problems.push("has no seniority section");
  }
  if (name === "applyKit.json") {
    if (!Array.isArray(data?.profile)) problems.push("has no profile list");
    if (typeof data?.summaries !== "object") problems.push("has no summaries");
    const tracks = Object.keys(others.profile?.tracks || {});
    for (const t of tracks) if (!data?.summaries?.[t]) problems.push(`has no summary for track ${t}`);
  }
  if (name === "resume.json" && !isResume(data)) problems.push("isn't in Resume Studio's format");
  if (name === "companies.json" && !["greenhouse", "lever", "ashby"].some((k) => Array.isArray(data?.[k]))) {
    problems.push("has no greenhouse, lever or ashby lists");
  }
  return problems;
}

function unpack(source) {
  if (fs.statSync(source).isDirectory()) return source;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-"));
  // tar reads zip files on macOS and on Windows 10+.
  const run = spawnSync("tar", ["-xf", source, "-C", dir], { stdio: "pipe" });
  if (run.status !== 0) fail(`Couldn't open ${source}: ${String(run.stderr).trim()}`);
  // A zip of a folder has everything one level down.
  const entries = fs.readdirSync(dir).filter((f) => !f.startsWith(".") && f !== "__MACOSX");
  return entries.length === 1 && fs.statSync(path.join(dir, entries[0])).isDirectory() ? path.join(dir, entries[0]) : dir;
}

function main() {
  const source = process.argv[2];
  if (!source) fail("Give the pack to install: npm run install-pack -- ~/Downloads/your-pack.zip");
  if (!fs.existsSync(source)) fail(`Can't find ${source}`);
  const dir = unpack(path.resolve(source));
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith(".") && fs.statSync(path.join(dir, f)).isFile());

  const json = {};
  for (const f of files.filter((f) => DEST[f])) {
    try {
      json[f] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch (err) {
      fail(`${f} isn't valid JSON: ${err.message}`);
    }
  }
  const profile = json["profile.json"] || JSON.parse(fs.readFileSync(path.join(ROOT, "config/profile.json"), "utf-8"));
  const problems = Object.entries(json).flatMap(([f, data]) =>
    checkPackFile(f, data, { profile }).map((p) => `${f} ${p}`),
  );
  if (problems.length) fail(`Not installed; fix these first:\n  - ${problems.join("\n  - ")}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(ROOT, "data", "backups", stamp);
  const copy = (from, rel) => {
    const to = path.join(ROOT, rel);
    if (fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(path.join(backup, rel)), { recursive: true });
      fs.copyFileSync(to, path.join(backup, rel));
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`✓ ${path.basename(from)} -> ${rel}`);
  };

  for (const f of Object.keys(json)) copy(path.join(dir, f), DEST[f]);
  const resumeName = Object.values(profile.resumes || {})[0];
  const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length && resumeName) copy(path.join(dir, pdfs[0]), path.join("resumes", resumeName));
  for (const f of files.filter((f) => !DEST[f] && !f.toLowerCase().endsWith(".pdf"))) copy(path.join(dir, f), path.join("data", "pack", f));

  if (fs.existsSync(backup)) console.log(`\nYour previous files are backed up in data/backups/${stamp}/`);
  const editMe = ["config/applyKit.json", "data/resume.json"]
    .map((rel) => [rel, (fs.readFileSync(path.join(ROOT, rel), "utf-8").match(/EDIT ME|REPLACE-ME/g) || []).length])
    .filter(([, n]) => n);
  for (const [rel, n] of editMe) console.log(`! ${rel} still has ${n} EDIT ME line(s) to fill in`);
  if (resumeName && !fs.existsSync(path.join(ROOT, "resumes", resumeName))) {
    console.log(`! Save the resume PDF as resumes/${resumeName} (npm run setup asks for it)`);
  }
  console.log("\nNext: npm run setup (connects Google and runs the first search), then npm run doctor.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
