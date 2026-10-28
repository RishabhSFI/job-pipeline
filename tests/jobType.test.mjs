import { test } from "node:test";
import assert from "node:assert/strict";
import { jobTypeOf, internshipAlreadyStarted } from "../lib/jobType.js";

const OCT_28_2026 = new Date("2026-10-28T12:00:00Z");
const started = (job) => internshipAlreadyStarted(job, OCT_28_2026);

test("internships are told apart from full-time jobs by title and type", () => {
  assert.equal(jobTypeOf({ title: "Finance Intern" }), "Internship");
  assert.equal(jobTypeOf({ title: "Investment Banking Summer Analyst" }), "Internship");
  assert.equal(jobTypeOf({ title: "Strategy Co-op (8 months)" }), "Internship");
  assert.equal(jobTypeOf({ title: "Analyst", employmentType: "Internship" }), "Internship");
  assert.equal(jobTypeOf({ title: "Financial Analyst" }), "Full-time");
  assert.equal(jobTypeOf({ title: "International Analyst" }), "Full-time");
  assert.equal(jobTypeOf({ title: "Analyst", jobType: "Internship" }), "Internship");
});

test("an internship whose only terms have started is skipped", () => {
  const intern = (terms) => ({ title: "Finance Intern", terms });
  assert.equal(started(intern(["Summer 2026"])), true);
  assert.equal(started(intern(["Fall 2026"])), true);
  assert.equal(started(intern(["Summer 2026", "Fall 2026"])), true);
  assert.equal(started(intern(["Fall 2026", "Winter 2027"])), false);
  assert.equal(started(intern(["Summer 2027"])), false);
  assert.equal(started(intern(["N/A"])), false);
  assert.equal(started(intern([])), false);
});

test("terms in the title count when the source lists none", () => {
  assert.equal(started({ title: "Summer 2026 Finance Intern" }), true);
  assert.equal(started({ title: "Summer 2027 Finance Intern" }), false);
});

test("terms start on the first of their month, so the cutoff moves with the date", () => {
  const job = { title: "Intern", terms: ["Winter 2027"] };
  assert.equal(internshipAlreadyStarted(job, new Date("2026-12-31T12:00:00Z")), false);
  assert.equal(internshipAlreadyStarted(job, new Date("2027-01-01T12:00:00Z")), true);
});

test("full-time jobs are never skipped for their term", () => {
  assert.equal(started({ title: "Analyst, Summer 2026 start", jobType: "Full-time" }), false);
});
