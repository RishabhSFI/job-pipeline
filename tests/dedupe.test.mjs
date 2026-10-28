import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeJobs, normalizeCompany, locationsOverlap } from "../lib/dedupe.js";

const links = (jobs) => jobs.map((j) => j.link).sort();

test("known links, repeats and jobs with no link are dropped", () => {
  const out = dedupeJobs(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    [{ link: "a" }],
  );
  assert.deepEqual(links(out), ["b", "c"]);
});

test("links differing only by query string or case are the same job", () => {
  const out = dedupeJobs([{ link: "https://x.com/Job/1?src=a" }, { link: "https://x.com/job/1/" }]);
  assert.equal(out.length, 1);
});

test("the same job from two sources is kept once, from the company's own board", () => {
  const board = { link: "gh/1", company: "scaleai", title: "Strategy & Ops Intern", location: "San Francisco, CA", source: "greenhouse", description: "short" };
  const simplify = { link: "simplify/1", company: "Scale AI, Inc.", title: "Strategy & Ops Intern", location: "San Francisco, CA", source: "simplify", description: "a much longer description ".repeat(20) };
  assert.deepEqual(links(dedupeJobs([simplify, board])), ["gh/1"]);
});

test("between two other sources, the richer description wins", () => {
  const thin = { link: "a", company: "Acme", title: "Analyst", source: "remotive", description: "x" };
  const rich = { link: "b", company: "ACME", title: "analyst", source: "himalayas", description: "x".repeat(500) };
  assert.deepEqual(links(dedupeJobs([thin, rich])), ["b"]);
});

test("the same title in different cities is two jobs", () => {
  const job = (link, location) => ({ link, company: "Stripe", title: "Finance Intern", location, source: "greenhouse" });
  assert.equal(dedupeJobs([job("1", "Toronto, ON"), job("2", "New York, NY")]).length, 2);
  assert.equal(dedupeJobs([job("1", "Toronto, ON"), job("2", "")]).length, 1);
});

test("a job already in the sheet under another link is not added again", () => {
  const sheet = [{ link: "old", company: "Ramp", title: "Founder's Associate", location: "New York, NY" }];
  const out = dedupeJobs([{ link: "new", company: "ramp", title: "Founder’s Associate", location: "New York, NY, United States", source: "ashby" }], sheet);
  assert.equal(out.length, 0);
});

test("company names lose punctuation, spacing and legal suffixes", () => {
  assert.equal(normalizeCompany("Scale AI, Inc."), "scaleai");
  assert.equal(normalizeCompany("Neo Financial Technologies Ltd"), "neofinancialtechnologies");
  assert.ok(locationsOverlap("Toronto, ON / Remote", "Toronto, Ontario, Canada"));
  assert.ok(!locationsOverlap("Toronto, ON", "Austin, TX"));
});
