import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  cleanFilters,
  eligibilityKind,
  facetCounts,
  failingSources,
  inPostedWindow,
  locationMatches,
  parseJobDate,
  scoreReasons,
  timeAgo,
} from "../lib/jobFilters.js";
import { linkedinLinks, schoolFromKit } from "../lib/linkedin.js";

import fs from "node:fs";
const { regions } = JSON.parse(fs.readFileSync("config/countries.json", "utf-8"));
const now = new Date("2026-10-28T15:00:00");

test("posted windows use Posted Date and fall back to Date Found", () => {
  const today = { "Posted Date": "2026-10-28" };
  const twoDays = { "Posted Date": "2026-10-26" };
  const fallback = { "Posted Date": "", "Date Found": "2026-10-28" };
  const noDates = {};
  assert.ok(inPostedWindow(today, "24h", now));
  assert.ok(!inPostedWindow(twoDays, "24h", now));
  assert.ok(inPostedWindow(twoDays, "48h", now));
  assert.ok(inPostedWindow(fallback, "24h", now));
  assert.ok(!inPostedWindow(noDates, "7d", now));
  assert.ok(inPostedWindow(noDates, "any", now));
  assert.ok(!inPostedWindow({ "Posted Date": "2026-10-10" }, "7d", now));
});

test("unreadable dates are null", () => {
  assert.equal(parseJobDate("sometime"), null);
  assert.equal(parseJobDate(""), null);
});

test("location filter reads the Country/Remote text", () => {
  const at = (where) => ({ "Country/Remote": where });
  assert.ok(locationMatches(at("Toronto, ON"), "canada", regions));
  assert.ok(!locationMatches(at("Toronto, ON"), "us", regions));
  assert.ok(locationMatches(at("New York, NY"), "us", regions));
  assert.ok(locationMatches(at("Remote, US"), "us", regions));
  assert.ok(locationMatches(at("Remote - Canada"), "remote", regions));
  assert.ok(!locationMatches(at("Austin, TX"), "remote", regions));
  assert.ok(locationMatches(at(""), "all", regions));
});

test("filters combine, with search over role and company", () => {
  const jobs = [
    { "Role Title": "Finance Intern", Company: "Ramp", "Job Type": "Internship", "CV Version Used": "finance" },
    { "Role Title": "Chief of Staff", Company: "Acme", "Job Type": "Full-time", "CV Version Used": "startup" },
  ];
  assert.equal(applyFilters(jobs, { type: "Internship" }, { regions }).length, 1);
  assert.equal(applyFilters(jobs, { track: "startup" })[0].Company, "Acme");
  assert.equal(applyFilters(jobs, { search: "ramp" }).length, 1);
  assert.equal(applyFilters(jobs, { search: "staff", type: "Internship" }).length, 0);
  assert.equal(applyFilters(jobs, {}).length, 2);
});

test("saved filters with unknown values fall back to the defaults", () => {
  const cleaned = cleanFilters({ type: "Weird", track: "gone", posted: "7d", search: 5 }, ["startup"]);
  assert.deepEqual(cleaned, { ...DEFAULT_FILTERS, posted: "7d" });
  assert.equal(cleanFilters(null).type, "all");
});

test("score reasons split on the separator and may be blank", () => {
  assert.deepEqual(scoreReasons({ "Score Why": "Startup title +30 · entry level +20" }), [
    "Startup title +30",
    "entry level +20",
  ]);
  assert.deepEqual(scoreReasons({}), []);
});

test("timeAgo and failing sources", () => {
  assert.equal(timeAgo("2026-10-28T13:00:00", now), "2h ago");
  assert.equal(timeAgo("junk", now), "");
  assert.equal(failingSources([{ name: "a", ok: true }, { name: "b", ok: false }]).length, 1);
});

test("school is the text before the first comma of the School entry", () => {
  const kit = [{ label: "School", value: "University of Waterloo, BBA, 2027" }];
  assert.equal(schoolFromKit(kit), "University of Waterloo");
  assert.equal(schoolFromKit([{ label: "School", value: "EDIT ME: school, degree" }]), "");
  assert.equal(schoolFromKit([]), "");
  assert.equal(schoolFromKit(undefined), "");
});

test("a {school} search is skipped without a school and filled with one", () => {
  const searches = [
    { label: "Alumni", keywords: "{company} {school}" },
    { label: "Recruiters", keywords: "{company} recruiter" },
  ];
  const without = linkedinLinks("Ramp", "Analyst", searches);
  assert.deepEqual(without.map((l) => l.label), ["Company on LinkedIn", "Recruiters"]);
  const withSchool = linkedinLinks("Ramp", "Analyst", searches, [], "Western University");
  assert.equal(withSchool.length, 3);
  assert.match(withSchool[1].url, /keywords=Ramp%20Western%20University$/);
});

test("newest sort puts real posted dates first, then found-only dates, then unknown", async () => {
  const { sortJobs } = await import("../lib/jobFilters.js");
  const jobs = [
    { "Role Title": "old", "Posted Date": "2026-10-01", "Match Score": "90" },
    { "Role Title": "none", "Posted Date": "", "Date Found": "", "Match Score": "99" },
    { "Role Title": "new", "Posted Date": "2026-10-27", "Match Score": "60" },
    { "Role Title": "found", "Posted Date": "", "Date Found": "2026-10-20", "Match Score": "70" },
  ];
  assert.deepEqual(sortJobs(jobs, "newest").map((j) => j["Role Title"]), ["new", "old", "found", "none"]);
  assert.deepEqual(sortJobs(jobs, "match").map((j) => j["Role Title"]), ["none", "old", "found", "new"]);
});

test("posted labels count whole days and say when only the found date is known", async () => {
  const { postedLabel } = await import("../lib/jobFilters.js");
  const now = new Date(2026, 9, 28, 15);
  assert.equal(postedLabel({ "Posted Date": "2026-10-28" }, now), "Posted today");
  assert.equal(postedLabel({ "Posted Date": "2026-10-27" }, now), "Posted yesterday");
  assert.equal(postedLabel({ "Posted Date": "2026-10-21" }, now), "Posted 7 days ago");
  assert.equal(postedLabel({ "Posted Date": "", "Date Found": "2026-10-26" }, now), "Found 2 days ago");
  assert.equal(postedLabel({}, now), "");
});

const pool = [
  { Company: "Uline", "Role Title": "Operations Analyst Intern", "Country/Remote": "Pleasant Prairie, WI", Status: "Needs Manual Apply", Eligibility: "Note: US job, needs a TN visa" },
  { Company: "Signet", "Role Title": "Business Analyst - Sourcing", "Country/Remote": "Akron, OH / Irving, TX", Status: "Awaiting Your Approval", Eligibility: "" },
  { Company: "Uline", "Role Title": "Senior Buyer", "Country/Remote": "Toronto, ON", Status: "Applied", Eligibility: "Check: Asks for 3+ years of experience", Favourite: "★" },
  { Company: "Amgen", "Role Title": "MBA Intern", "Country/Remote": "Remote", Status: "Not Eligible", Eligibility: "Not eligible: For graduate students" },
];
const titles = (list) => list.map((j) => j["Role Title"]);

test("several companies, places and statuses can be picked at once", () => {
  assert.deepEqual(titles(applyFilters(pool, { companies: ["Uline", "Amgen"] })), ["Operations Analyst Intern", "Senior Buyer", "MBA Intern"]);
  assert.deepEqual(titles(applyFilters(pool, { places: ["Irving, TX", "Remote"] })), ["Business Analyst - Sourcing", "MBA Intern"]);
  assert.deepEqual(titles(applyFilters(pool, { statuses: ["Applied", "Not Eligible"] })), ["Senior Buyer", "MBA Intern"]);
});

test("title words narrow by any included word and drop any excluded one", () => {
  assert.deepEqual(titles(applyFilters(pool, { include: "analyst, buyer" })), ["Operations Analyst Intern", "Business Analyst - Sourcing", "Senior Buyer"]);
  assert.deepEqual(titles(applyFilters(pool, { exclude: "senior, mba" })), ["Operations Analyst Intern", "Business Analyst - Sourcing"]);
});

test("eligibility groups come from the Eligibility cell", () => {
  assert.deepEqual(pool.map(eligibilityKind), ["tn", "ok", "check", "no"]);
  assert.deepEqual(titles(applyFilters(pool, { eligibility: ["ok", "tn"] })), ["Operations Analyst Intern", "Business Analyst - Sourcing"]);
  assert.deepEqual(titles(applyFilters(pool, { favourites: true })), ["Senior Buyer"]);
});

test("each option's count ignores its own filter but respects the others", () => {
  const counts = facetCounts(pool, { ...DEFAULT_FILTERS, companies: ["Uline"], eligibility: ["ok", "tn", "check"] }, "companies");
  assert.deepEqual(counts, [{ value: "Uline", count: 2 }, { value: "Signet", count: 1 }]);
  const places = facetCounts(pool, { ...DEFAULT_FILTERS, companies: ["Signet"] }, "places");
  assert.deepEqual(places, [{ value: "Akron, OH", count: 1 }, { value: "Irving, TX", count: 1 }]);
});

test("a picked option stays listed when nothing matches it any more", () => {
  const counts = facetCounts(pool, { ...DEFAULT_FILTERS, companies: ["Gone Inc"], statuses: ["Applied"] }, "companies");
  assert.deepEqual(counts.find((c) => c.value === "Gone Inc"), { value: "Gone Inc", count: 0 });
});

test("saved filters with junk in them come back clean", () => {
  const f = cleanFilters({ companies: ["Uline", 4, "x".repeat(200)], eligibility: ["ok", "bogus"], favourites: "yes" });
  assert.deepEqual(f.companies, ["Uline"]);
  assert.deepEqual(f.eligibility, ["ok"]);
  assert.equal(f.favourites, false);
  assert.equal(activeFilterCount(f), 2);
});
