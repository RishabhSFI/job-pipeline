import { test } from "node:test";
import assert from "node:assert/strict";
import { closingChanges } from "../lib/closing.js";

const postings = {
  "gh/1": { source: "greenhouse", company: "stripe" },
  "gh/2": { source: "greenhouse", company: "brex" },
  "sim/1": { source: "simplify", company: "Acme" },
  "rem/1": { source: "remotive", company: "Acme" },
};
const run = (rows, seen, complete) =>
  closingChanges(rows, {
    postingFor: (link) => postings[link] || null,
    seenLinks: new Set(seen),
    complete: new Set(complete),
  }).map((c) => `${c.link} ${c.kind} -> ${c.status}`);

const row = (Link, Status = "Awaiting Your Approval", _row = 2) => ({ _row, Link, Status });

test("an open job gone from a board read in full is closed", () => {
  assert.deepEqual(run([row("gh/1")], [], ["greenhouse:stripe"]), ["gh/1 closed -> Closed"]);
  assert.deepEqual(run([row("sim/1", "Needs Manual Apply")], [], ["simplify:all"]), ["sim/1 closed -> Closed"]);
});

test("a job still listed stays open, links compared loosely", () => {
  assert.deepEqual(run([row("gh/1")], ["gh/1"], ["greenhouse:stripe"]), []);
  assert.deepEqual(run([row("https://X.com/a?x=1")], ["https://x.com/a"], []), []);
});

test("a board that failed or was not read never closes its jobs", () => {
  assert.deepEqual(run([row("gh/2")], [], ["greenhouse:stripe"]), []);
  assert.deepEqual(run([row("sim/1")], [], []), []);
});

test("sources that only list recent jobs never close anything", () => {
  assert.deepEqual(run([row("rem/1")], [], ["remotive:all", "greenhouse:stripe"]), []);
});

test("jobs with no saved posting are left alone", () => {
  assert.deepEqual(run([row("unknown")], [], ["greenhouse:stripe"]), []);
});

test("jobs you applied to or are interviewing for are never closed", () => {
  for (const status of ["Applied", "Applied (Auto)", "Interview", "Offer", "Rejected"]) {
    assert.deepEqual(run([row("gh/1", status)], [], ["greenhouse:stripe"]), [], status);
  }
});

test("a closed job that shows up again is reopened as Needs Manual Apply", () => {
  assert.deepEqual(run([row("gh/1", "Closed")], ["gh/1"], ["greenhouse:stripe"]), [
    "gh/1 reopened -> Needs Manual Apply",
  ]);
  assert.deepEqual(run([row("gh/1", "Closed")], [], ["greenhouse:stripe"]), []);
});
