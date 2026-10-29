import { test } from "node:test";
import assert from "node:assert/strict";
import { requirementsPrompt, tidyRequirements } from "../lib/requirements.js";

test("the prompt carries the posting, the candidate's facts and resume", () => {
  const p = requirementsPrompt(
    { job: { title: "Analyst", company: "Acme" }, posting: "Must know SQL.", resumeText: "Excel, Power BI" },
    { workIn: ["Canada"], graduation: "2027-05" },
  );
  assert.match(p, /Must know SQL/);
  assert.match(p, /"graduation": "2027-05"/);
  assert.match(p, /Excel, Power BI/);
});

test("replies are tidied: bad items dropped, missing must-haves first", () => {
  const out = tidyRequirements({
    summary: "Mostly fits.",
    requirements: [
      { requirement: "Excel", mustHave: true, status: "meets", why: "On resume" },
      { requirement: "", status: "missing" },
      { requirement: "SQL", mustHave: true, status: "missing", why: "Not on resume" },
      { requirement: "Python", mustHave: false, status: "weird" },
    ],
  });
  assert.deepEqual(out.requirements.map((r) => [r.requirement, r.status]), [["SQL", "missing"], ["Excel", "meets"], ["Python", "unclear"]]);
  assert.equal(out.verdict, "some gaps");
  assert.deepEqual(tidyRequirements(null), { verdict: "likely eligible", summary: "", requirements: [] });
});
