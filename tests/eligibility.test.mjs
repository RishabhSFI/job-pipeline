import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEligibility, eligibilityCell, yearsAsked, graduationYears } from "../lib/eligibility.js";
import { eligibilityChanges } from "../lib/eligibilityRun.js";

const canadian = {
  workIn: ["Canada"],
  tnEligible: true,
  graduation: "2027-05",
  degree: "Bachelor's",
  languages: ["English"],
  certifications: [],
  maxYearsExperience: 2,
};
const job = (title, extra = {}) => ({ title, description: "", location: "Toronto, ON", ...extra });

test("a Canadian job with nothing special is eligible", () => {
  assert.deepEqual(checkEligibility(job("Financial Analyst"), canadian), { verdict: "ok", reasons: [], notes: [] });
});

test("US citizenship or clearance rules a Canadian out", () => {
  const r = checkEligibility(job("Analyst", { location: "New York, NY", description: "Must be a U.S. citizen." }), canadian);
  assert.equal(r.verdict, "no");
  assert.match(r.reasons[0], /US citizenship/);
  assert.equal(
    checkEligibility(job("Analyst", { location: "Arlington, VA", sponsorship: "U.S. Citizenship is Required" }), canadian).verdict,
    "no",
  );
  assert.equal(checkEligibility(job("Analyst", { location: "Austin, TX", description: "Active Secret clearance required." }), canadian).verdict, "no");
});

test("a US job without sponsorship is flagged for a TN check, not hidden", () => {
  const r = checkEligibility(
    job("Strategy Associate", { location: "San Francisco, CA", description: "We are unable to sponsor visas for this role." }),
    canadian,
  );
  assert.equal(r.verdict, "check");
  assert.match(r.reasons[0], /TN visa/);
  assert.equal(checkEligibility(job("Ops Analyst", { location: "Remote (US)" }), canadian).verdict, "no");
});

test("a US job that says nothing about visas is fine, with a quiet note", () => {
  const r = checkEligibility(job("Strategy Associate", { location: "New York, NY" }), canadian);
  assert.equal(r.verdict, "ok");
  assert.equal(eligibilityCell(r), "Note: US job, needs a TN visa");
});

test("jobs open to Canada are not affected by US rules", () => {
  assert.equal(checkEligibility(job("Analyst", { location: "Toronto, ON or New York, NY" }), canadian).verdict, "ok");
  assert.equal(checkEligibility(job("Analyst", { location: "Remote" }), canadian).verdict, "ok");
});

test("internships after graduation are out; ones around it are a check", () => {
  assert.equal(checkEligibility(job("Finance Intern - Fall 2027", { jobType: "Internship" }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Finance Intern", { jobType: "Internship", terms: ["Summer 2027"] }), canadian).verdict, "check");
  assert.equal(checkEligibility(job("Finance Intern", { jobType: "Internship", terms: ["Winter 2027"] }), canadian).verdict, "ok");
});

test("new grad roles for an earlier class are out", () => {
  const r = checkEligibility(job("Analyst, New Grad", { description: "Open to the Class of 2026." }), canadian);
  assert.equal(r.verdict, "no");
  assert.equal(checkEligibility(job("Analyst, New Grad", { description: "For 2027 graduates." }), canadian).verdict, "ok");
});

test("graduate degrees, years, languages and certifications", () => {
  assert.equal(checkEligibility(job("Analyst", { degrees: ["Master's", "PhD"] }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("MBA Intern - Finance & Strategy", { jobType: "Internship" }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Analyst", { degrees: ["Bachelor's", "Master's"] }), canadian).verdict, "ok");
  assert.equal(checkEligibility(job("Analyst", { description: "An MBA is required." }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Analyst", { description: "3+ years of experience in finance." }), canadian).verdict, "check");
  assert.equal(checkEligibility(job("Analyst", { description: "7+ years of relevant experience." }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Data Annotation Specialist - German Writer"), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Analyst", { description: "Fluency in French is required." }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Analyst", { description: "Bilingual in French is an asset." }), canadian).verdict, "check");
  assert.equal(checkEligibility(job("Accountant", { description: "CPA designation required." }), canadian).verdict, "no");
  assert.equal(checkEligibility(job("Associate", { description: "Series 7 required within 90 days of hire." }), canadian).verdict, "check");
});

test("without any facts set, nothing is ruled out on authorization", () => {
  assert.equal(checkEligibility(job("Analyst", { location: "New York, NY", description: "Must be a U.S. citizen." }), {}).verdict, "ok");
});

test("helpers read years and graduation classes", () => {
  assert.equal(yearsAsked("Requires 2-4 years of professional experience and 5+ years experience with Excel"), 5);
  assert.equal(yearsAsked("We were founded 10 years ago."), 0);
  assert.deepEqual(graduationYears("Class of 2026 and 2027 graduates welcome"), [2026, 2027]);
  assert.equal(eligibilityCell({ verdict: "check", reasons: ["a", "b"] }), "Check: a · b");
  assert.equal(eligibilityCell({ verdict: "ok", reasons: [] }), "");
});

test("re-checking the sheet hides open jobs you can't take and brings back ones you now can", async () => {
  const { eligibilityChanges } = await import("../lib/eligibilityRun.js");
  const rows = [
    { _row: 2, Link: "a", Status: "Needs Manual Apply", "Role Title": "Analyst", "Country/Remote": "New York, NY" },
    { _row: 3, Link: "b", Status: "Applied", "Role Title": "Analyst", "Country/Remote": "New York, NY" },
    { _row: 4, Link: "c", Status: "Not Eligible", "Role Title": "Analyst", "Country/Remote": "Toronto, ON", Eligibility: "Not eligible: old" },
  ];
  const postings = { a: { description: "Must be a U.S. citizen." }, b: { description: "Must be a U.S. citizen." }, c: { description: "" } };
  const { cells, statuses } = eligibilityChanges(rows, { postingFor: (l) => postings[l], facts: canadian });
  assert.deepEqual(statuses.map((s) => [s.row, s.status]), [[2, "Not Eligible"], [4, "Awaiting Your Approval"]]);
  assert.deepEqual(cells.map((c) => c.row), [2, 4]);
  assert.equal(cells[1].value, "");
});

test("a re-check never touches a job you dismissed", () => {
  const rows = [{ _row: 2, Link: "https://x.test/1", Status: "Dismissed", "Role Title": "MBA Intern" }];
  const out = eligibilityChanges(rows, { postingFor: () => null, facts: { workIn: ["Canada"], graduation: "2027-05" } });
  assert.deepEqual(out, { cells: [], statuses: [] });
});
