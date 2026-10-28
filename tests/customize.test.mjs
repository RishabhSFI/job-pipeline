import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedinLinks, roleForSearch } from "../lib/linkedin.js";
import { applicationEmail } from "../lib/applyKit.js";

test("job titles are trimmed to the role for people searches", () => {
  assert.equal(roleForSearch("Summer 2027 Finance Intern (Toronto)"), "Finance");
  assert.equal(roleForSearch("Strategic Finance, AI & Business Partnership"), "Strategic Finance");
  assert.equal(roleForSearch("Financial Analyst II"), "Financial Analyst");
  assert.equal(roleForSearch("Chief of Staff"), "Chief of Staff");
});

test("the part of the title that matches a role keyword is used", () => {
  const keywords = ["strategic finance", "finance"];
  assert.equal(roleForSearch("Associate, Strategic Finance", keywords), "Strategic Finance");
  assert.equal(roleForSearch("Undergrad Intern – Finance (Summer 2027)", keywords), "Finance");
});

test("LinkedIn links come from the configured searches", () => {
  const links = linkedinLinks("Ramp", "Strategic Finance, GTM", [
    { label: "People in this role", keywords: "{company} {role}" },
  ]);
  assert.deepEqual(links.map((l) => l.label), ["Company on LinkedIn", "People in this role"]);
  assert.match(links[1].url, /keywords=Ramp%20Strategic%20Finance$/);
  assert.doesNotMatch(links.map((l) => l.url).join(" "), /engineer/);
});

test("the application email uses the kit, not a built-in pitch", () => {
  const kit = {
    profile: [
      { label: "Full name", value: "Sam Lee" },
      { label: "LinkedIn", value: "https://linkedin.com/in/sam" },
      { label: "Phone", value: "555" },
    ],
    summaries: { ops: "I run operations.", finance: "I model cash flow." },
    emailTemplate: "Role: {role} at {company}\n{summary}\n{name}\n{links}",
  };
  const { subject, body } = applicationEmail(kit, {
    title: "Ops Associate",
    company: "Acme",
    trackKey: "finance",
  });
  assert.equal(subject, "Application: Ops Associate - Sam Lee");
  assert.equal(body, "Role: Ops Associate at Acme\nI model cash flow.\nSam Lee\nhttps://linkedin.com/in/sam");
});
