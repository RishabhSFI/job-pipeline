import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatchScore, explainScore, scoreWhy, pickCvVersion, scoreAll } from "../lib/scorer.js";
import { resumeFileFor, trackLabel, DEFAULT_TRACK, PROFILE } from "../lib/profile.js";

const description =
  "Build financial models in Excel and support valuation and cash flow forecasting for the team. ".repeat(
    3,
  );
const job = (title, extra = {}) => ({
  title,
  description,
  employmentType: "Internship",
  ...extra,
});
const MINIMUM = 55;

test("entry-level finance, ops and AI-training roles pass the minimum score", () => {
  for (const title of [
    "Financial Analyst Intern",
    "FP&A Analyst, New Grad",
    "Business Operations Associate",
    "AI Trainer - Finance",
    "AI Tutor - Finance",
    "Investment Banking Summer Analyst 2027",
    "Associate Program Manager",
    "Chief of Staff Intern",
  ]) {
    assert.ok(computeMatchScore(job(title)) >= MINIMUM, title);
  }
});

test("a bare title with an empty description still passes", () => {
  assert.ok(
    computeMatchScore({ title: "Financial Analyst Intern" }) >= MINIMUM,
  );
});

test("senior, excluded and unrelated roles fall below the minimum", () => {
  for (const title of [
    "Senior Software Engineer",
    "VP Finance",
    "Director of FP&A",
    "Senior Financial Analyst",
    "Finance Manager",
    "Associate Director, Strategy",
    "Account Executive",
    "Registered Nurse",
    "Marketing Analyst Intern",
    "Warehouse Associate",
  ]) {
    assert.ok(computeMatchScore(job(title)) < MINIMUM, title);
  }
});

test("a posting that wants more than 3 years of experience scores lower", () => {
  const plain = job("Financial Analyst", { employmentType: "" });
  const demanding = {
    ...plain,
    description: plain.description + " Requires 6+ years of experience.",
  };
  assert.ok(computeMatchScore(demanding) < computeMatchScore(plain));
  const modest = {
    ...plain,
    description: plain.description + " Requires 1-2 years of experience.",
  };
  assert.equal(computeMatchScore(modest), computeMatchScore(plain));
});

test("the title decides the track and the CV file follows from it", () => {
  const cases = {
    "Financial Analyst Intern": "finance",
    "Business Operations Associate": "operations",
    "AI Trainer - Finance": "ai_training",
    "AI Tutor - Finance": "ai_training",
  };
  for (const [title, track] of Object.entries(cases)) {
    const picked = pickCvVersion(job(title));
    assert.equal(picked.cvKey, track, title);
    assert.equal(picked.resumeFile, resumeFileFor(track), title);
    assert.equal(picked.needsReview, false, title);
  }
});

test("an unknown track falls back to the default CV, and labels are readable", () => {
  assert.equal(resumeFileFor("nope"), resumeFileFor(DEFAULT_TRACK));
  assert.equal(trackLabel("ai_training"), "AI Training");
});

test("words must match whole: 'strategy' inside another word does not count", () => {
  assert.ok(
    computeMatchScore({ title: "Antistrategyx Intern", description: "" }) <
      MINIMUM,
  );
});

test("one company cannot fill the list: at most 3 per company", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    job("Financial Analyst Intern", { company: "acme", link: "l" + i }),
  );
  assert.equal(scoreAll(many, MINIMUM).length, 3);
});

test("results come back best match first", () => {
  const list = [
    job("AI Trainer - Finance", { company: "a" }),
    job("Financial Analyst Intern", { company: "b" }),
  ];
  const scores = scoreAll(list, MINIMUM).map((j) => j.matchScore);
  assert.deepEqual(
    scores,
    [...scores].sort((x, y) => y - x),
  );
});

test("startup generalist roles outrank plain finance roles", () => {
  const generalist = computeMatchScore({ title: "Founder's Associate", description: "" });
  const finance = computeMatchScore({ title: "Financial Analyst", description: "" });
  assert.ok(generalist > finance, `${generalist} vs ${finance}`);
  assert.equal(pickCvVersion({ title: "Chief of Staff", description: "" }).cvKey, "startup");
});

test("small-team postings score above big-company postings for the same title", () => {
  const title = "Business Operations Associate";
  const small = computeMatchScore({
    title,
    description: "Join a small team at an early-stage, Series A startup and work directly with the founders.",
  });
  const big = computeMatchScore({
    title,
    description: "Join a Fortune 500 multinational with 100,000 employees worldwide.",
  });
  assert.ok(small > big, `${small} vs ${big}`);
});

const NOW = Date.parse("2026-10-28T12:00:00Z");
const labels = (j) => explainScore(j, NOW).reasons.map((r) => r.label);

test("every point of the score has a plain-English reason", () => {
  const j = {
    title: "Founder's Associate Intern",
    description: "Small team, Y Combinator backed. Build models in Excel.",
  };
  const { score, reasons } = explainScore(j, NOW);
  assert.equal(score, 30 + reasons.reduce((s, r) => s + r.points, 0));
  assert.ok(labels(j).includes("Startup Generalist title"));
  assert.ok(labels(j).includes("entry level: intern"));
  assert.ok(labels(j).some((l) => l.startsWith("small team: small team, y combinator")));
  assert.equal(computeMatchScore(j, NOW), score);
});

test("senior and excluded titles say why they lost points", () => {
  const senior = explainScore({ title: "Senior Financial Analyst" }, NOW).reasons;
  assert.deepEqual(senior.find((r) => r.label === "too senior: senior"), { points: -45, label: "too senior: senior" });
  assert.ok(labels({ title: "Software Engineer, Strategy" }).includes("excluded title: engineer"));
});

test("a title that fits no track is capped, and the cap is a reason", () => {
  const j = { title: "Intern", description: "Small team early-stage seed series a startup. ".repeat(10), employmentType: "x" };
  const { score, reasons } = explainScore(j, NOW);
  assert.equal(score, 54);
  assert.ok(reasons.some((r) => r.label === "title fits none of your tracks" && r.points < 0));
});

test("fresh postings score higher, older ones get nothing", () => {
  const base = { title: "Financial Analyst Intern", description: "" };
  const ago = (days) => ({ ...base, postedAt: new Date(NOW - days * 86_400_000).toISOString() });
  const plain = computeMatchScore(base, NOW);
  assert.ok(computeMatchScore(ago(1), NOW) > computeMatchScore(ago(5), NOW));
  assert.ok(computeMatchScore(ago(5), NOW) > plain);
  assert.equal(computeMatchScore(ago(30), NOW), plain);
  assert.equal(computeMatchScore({ ...base, postedAt: "" }, NOW), plain);
  assert.ok(labels(ago(1)).includes("posted 1 day ago"));
});

test("a job in a preferred place scores higher, and nothing changes when none are set", () => {
  const j = { title: "Financial Analyst Intern", location: "Toronto, ON, Canada" };
  const before = computeMatchScore(j, NOW);
  const saved = PROFILE.location;
  PROFILE.location = { preferred: ["Toronto"], points: 8 };
  try {
    assert.equal(computeMatchScore(j, NOW), Math.min(100, before + 8));
    assert.ok(labels(j).includes("near you: Toronto"));
  } finally {
    PROFILE.location = saved;
  }
});

test("Score Why lists the biggest reasons, signed, biggest first", () => {
  const why = scoreWhy([
    { points: 5, label: "full description", minor: true },
    { points: 4, label: "posted 3 days ago" },
    { points: 30, label: "Startup Generalist title" },
    { points: -45, label: "too senior: senior" },
  ]);
  assert.equal(why, "too senior: senior −45 · Startup Generalist title +30 · posted 3 days ago +4");
});
