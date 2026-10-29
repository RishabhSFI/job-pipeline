import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { checkPackFile } from "../scripts/install-pack.mjs";

const profile = JSON.parse(fs.readFileSync(new URL("../config/profile.json", import.meta.url)));

test("the app's own profile and template files pass the pack checks", () => {
  assert.deepEqual(checkPackFile("profile.json", profile), []);
  const resume = JSON.parse(fs.readFileSync(new URL("../config/resume.example.json", import.meta.url)));
  assert.deepEqual(checkPackFile("resume.json", resume), []);
});

test("broken pack files are reported in plain words", () => {
  assert.match(checkPackFile("profile.json", { tracks: {} }).join(), /no tracks/);
  assert.match(
    checkPackFile("profile.json", { tracks: { pe: { label: "PE", titleKeywords: ["pe"], skillKeywords: [], resume: "x" } }, resumes: { main: "a.pdf" }, seniority: { tooSenior: [] } }).join(),
    /points at resume "x"/,
  );
  assert.match(checkPackFile("applyKit.json", { profile: [], summaries: {} }, { profile: { tracks: { pe: {} } } }).join(), /no summary for track pe/);
  assert.match(checkPackFile("resume.json", { name: "A" }).join(), /Resume Studio/);
});
