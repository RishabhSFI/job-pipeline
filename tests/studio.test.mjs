import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTrack,
  changedKeys,
  displayTerm,
  editResume,
  isResume,
  wordingInUse,
  draftKey,
  pageFit,
  skillTerms,
  versionName,
  visibleResume,
} from "../lib/studio.js";
import { rewordPrompt, cleanRewordOptions } from "../lib/studioPrompt.js";
import { resumeText } from "../lib/resumeModel.js";

const bullet = (id, tracks = []) => ({ id, text: `Did ${id}`, tracks });

function sample() {
  return {
    name: "Pat Example",
    contact: [],
    sections: [
      {
        id: "work",
        title: "Work",
        kind: "entries",
        entries: [
          {
            id: "acme",
            org: "Acme",
            location: "Toronto, ON",
            role: "Analyst",
            dates: "2025",
            bullets: [bullet("a1", ["ops"]), bullet("a2", ["finance"]), bullet("a3", ["finance"]), bullet("a4")],
          },
          { id: "beta", org: "Beta", location: "", role: "Intern", dates: "2024", bullets: [bullet("b1", ["ops"]), bullet("b2", ["ops"])] },
        ],
      },
      { id: "skills", title: "Skills", kind: "skills", groups: [{ id: "tools", label: "Skills", items: ["Excel"] }] },
    ],
  };
}

const bulletsOf = (resume, entryId) => resume.sections[0].entries.find((e) => e.id === entryId).bullets;
const shown = (resume, entryId) => bulletsOf(visibleResume(resume), entryId).map((b) => b.id);

test("a track preset puts suited bullets first and switches the rest off", () => {
  const tailored = applyTrack(sample(), "finance");
  assert.deepEqual(bulletsOf(tailored, "acme").map((b) => b.id), ["a2", "a3", "a4", "a1"]);
  assert.deepEqual(shown(tailored, "acme"), ["a2", "a3", "a4"]);
});

test("a track preset keeps two bullets on an entry with none suited", () => {
  const tailored = applyTrack(sample(), "finance");
  assert.deepEqual(shown(tailored, "beta"), ["b1", "b2"]);
});

test("a track preset starts from the base, so earlier edits do not carry over", () => {
  const base = sample();
  const edited = editResume(base, { type: "editBullet", sectionId: "work", entryId: "acme", bulletId: "a2", text: "Changed" });
  assert.equal(edited.sections[0].entries[0].bullets[1].text, "Changed");
  assert.equal(base.sections[0].entries[0].bullets[1].text, "Did a2");
  assert.equal(applyTrack(base, "finance").sections[0].entries[0].bullets[0].text, "Did a2");
});

test("the base resume has no changed pieces", () => {
  assert.equal(changedKeys(sample(), sample()).size, 0);
});

test("rewording, switching off and adding bullets mark those bullets", () => {
  const where = { sectionId: "work", entryId: "acme" };
  let r = editResume(sample(), { type: "editBullet", ...where, bulletId: "a1", text: "New words" });
  r = editResume(r, { type: "toggleBullet", ...where, bulletId: "a3" });
  r = editResume(r, { type: "addBullet", ...where, text: "Fresh" });
  const keys = changedKeys(sample(), r);
  assert.ok(keys.has("bullet:acme/a1"));
  assert.ok(keys.has("bullet:acme/a3"));
  assert.ok(keys.has("bullet:acme/acme-new-5"));
  assert.ok(!keys.has("bullet:acme/a2"));
  assert.ok(keys.has("entry:acme"), "adding a bullet changes the entry");
  assert.ok(!keys.has("entry:beta"));
});

test("moving or removing a bullet marks the entry, hiding an entry marks it too", () => {
  const moved = editResume(sample(), { type: "moveBullet", sectionId: "work", entryId: "beta", bulletId: "b2", by: -1 });
  assert.deepEqual(bulletsOf(moved, "beta").map((b) => b.id), ["b2", "b1"]);
  assert.deepEqual([...changedKeys(sample(), moved)], ["entry:beta"]);
  const removed = editResume(sample(), { type: "removeBullet", sectionId: "work", entryId: "acme", bulletId: "a4" });
  assert.deepEqual([...changedKeys(sample(), removed)], ["entry:acme"]);
  const hidden = editResume(sample(), { type: "toggleEntry", sectionId: "work", entryId: "beta" });
  assert.deepEqual([...changedKeys(sample(), hidden)], ["entry:beta"]);
  assert.deepEqual(visibleResume(hidden).sections[0].entries.map((e) => e.id), ["acme"]);
});

test("moving the first bullet up leaves the order alone", () => {
  const r = editResume(sample(), { type: "moveBullet", sectionId: "work", entryId: "beta", bulletId: "b1", by: -1 });
  assert.equal(changedKeys(sample(), r).size, 0);
});

test("skills are added once, case-insensitively, and removed by name", () => {
  let r = editResume(sample(), { type: "addSkill", item: "SQL" });
  r = editResume(r, { type: "addSkill", groupId: "tools", item: "excel" });
  assert.deepEqual(r.sections[1].groups[0].items, ["Excel", "SQL"]);
  assert.ok(changedKeys(sample(), r).has("group:tools"));
  r = editResume(r, { type: "removeSkill", groupId: "tools", item: "Excel" });
  assert.deepEqual(r.sections[1].groups[0].items, ["SQL"]);
});

test("hidden bullets do not count toward keyword text", () => {
  const r = editResume(sample(), { type: "toggleBullet", sectionId: "work", entryId: "acme", bulletId: "a1" });
  assert.doesNotMatch(resumeText(visibleResume(r)), /Did a1/);
  assert.match(resumeText(visibleResume(r)), /Did a2/);
});

test("the one-page check reports whole lines over", () => {
  assert.deepEqual(pageFit({ contentHeight: 900, pageHeight: 960, lineHeight: 17.5 }), { fits: true, linesOver: 0 });
  assert.deepEqual(pageFit({ contentHeight: 961, pageHeight: 960, lineHeight: 17.5 }), { fits: true, linesOver: 0 });
  assert.deepEqual(pageFit({ contentHeight: 970, pageHeight: 960, lineHeight: 17.5 }), { fits: false, linesOver: 1 });
  assert.deepEqual(pageFit({ contentHeight: 1000, pageHeight: 960, lineHeight: 17.5 }), { fits: false, linesOver: 3 });
});

test("skill keywords leave out the tracks' soft words", () => {
  const profile = { skills: ["Capital IQ"], tracks: { a: { skillKeywords: ["scrappy", "startup"] } } };
  const terms = skillTerms(profile, { terms: ["excel", "startup"] });
  assert.deepEqual([...terms].sort(), ["capital iq", "excel"]);
});

test("keywords become readable skill names", () => {
  assert.equal(displayTerm("power bi"), "Power BI");
  assert.equal(displayTerm("kpis"), "KPIs");
  assert.equal(displayTerm("sql"), "SQL");
  assert.equal(displayTerm("rlhf"), "RLHF");
  assert.equal(displayTerm("a/b testing"), "A/B Testing");
  assert.equal(displayTerm("financial modeling"), "Financial Modeling");
  assert.equal(displayTerm("fp&a"), "FP&A");
});

test("a version is named after the company and role", () => {
  assert.equal(versionName({ Company: "Ramp", "Role Title": "Strategy Associate" }), "Ramp - Strategy Associate");
  assert.equal(versionName({ Company: "Ramp" }), "Ramp");
});

test("the reword prompt carries the bullet, the posting's keywords and the resume's facts", () => {
  const resume = sample();
  const { system, prompt } = rewordPrompt({
    text: "Built a **cash flow** model",
    entry: resume.sections[0].entries[0],
    resume,
    keywords: ["fp&a", "forecasting"],
    job: { title: "Finance Associate", company: "Ramp" },
    description: "We want FP&A and forecasting experience.",
  });
  assert.match(prompt, /Built a \*\*cash flow\*\* model/);
  assert.match(prompt, /from Analyst at Acme/);
  assert.match(prompt, /Target job: Finance Associate at Ramp/);
  assert.match(prompt, /fp&a, forecasting/);
  assert.match(prompt, /We want FP&A/);
  assert.match(prompt, /Did a4/, "resume facts are included");
  assert.match(system, /Never add numbers/);
  assert.match(prompt, /"options"/);
});

test("reword options that add numbers or repeat the original are dropped", () => {
  const original = "Cut close time by **40%** across 3 teams";
  const options = cleanRewordOptions(
    {
      options: [
        "Cut close time by **40%** across 3 teams",
        "Reduced month-end close time **40%** for 3 finance teams",
        "Cut close time by **55%** across 3 teams",
        "• Streamlined **FP&A** close for 3 teams, cutting time 40%",
        "Saved $2M by cutting close time 40%",
        42,
        "",
        "Reduced month-end close time **40%** for 3 finance teams",
      ],
    },
    original,
  );
  assert.deepEqual(options, [
    "Reduced month-end close time **40%** for 3 finance teams",
    "Streamlined **FP&A** close for 3 teams, cutting time 40%",
  ]);
  assert.deepEqual(cleanRewordOptions({ nope: true }, original), []);
});

test("only resume-shaped data passes the save check", () => {
  assert.equal(isResume(sample()), true);
  assert.equal(isResume(null), false);
  assert.equal(isResume({ name: "x" }), false);
  assert.equal(isResume({ name: "x", sections: [{ id: "s", kind: "entries", entries: [{ id: "e", bullets: [{ id: "b" }] }] }] }), false);
  assert.equal(isResume({ name: "x", sections: [{ id: "s", kind: "skills", groups: [{ id: "g", items: [1] }] }] }), false);
});

const at = { sectionId: "work", entryId: "acme", bulletId: "a1" };
const a1 = (r) => r.sections[0].entries[0].bullets[0];

test("a saved wording can be chosen, and keyword text follows the wording in use", () => {
  let r = editResume(sample(), { type: "addWording", ...at, wording: { label: "Finance", text: "Built **FP&A** forecasts" } });
  assert.equal(a1(r).text, "Did a1", "saving a wording keeps the text in use");
  assert.deepEqual(a1(r).wordings, [{ id: "w1", label: "Finance", text: "Built **FP&A** forecasts" }]);
  assert.equal(wordingInUse(a1(r), "Did a1"), "base");
  r = editResume(r, { type: "chooseWording", ...at, wordingId: "w1" });
  assert.equal(wordingInUse(a1(r), "Did a1"), "w1");
  assert.match(resumeText(visibleResume(r)), /Built FP&A forecasts/);
  assert.doesNotMatch(resumeText(visibleResume(r)), /Did a1/);
  assert.ok(changedKeys(sample(), r).has("bullet:acme/a1"));
});

test("a wording is saved once, gets a default label, and can be removed", () => {
  let r = editResume(sample(), { type: "addWording", ...at, wording: { label: "", text: "Ran ops" } });
  r = editResume(r, { type: "addWording", ...at, wording: { label: "Again", text: "Ran ops" } });
  r = editResume(r, { type: "addWording", ...at, wording: { label: "x", text: "  " } });
  assert.deepEqual(a1(r).wordings, [{ id: "w1", label: "Wording 1", text: "Ran ops" }]);
  r = editResume(r, { type: "removeWording", ...at, wordingId: "w1" });
  assert.equal("wordings" in a1(r), false, "no empty list is left behind");
});

test("edited text that matches no saved wording reads as edited", () => {
  const r = editResume(sample(), { type: "editBullet", ...at, text: "Something new" });
  assert.equal(wordingInUse(a1(r), "Did a1"), "");
});

test("drafts are kept per job, else per version, else untitled", () => {
  assert.equal(draftKey({ jobId: "v6k9hn7um2", versionId: "ramp-ops" }), "job-v6k9hn7um2");
  assert.equal(draftKey({ jobId: "", versionId: "ramp-ops" }), "version-ramp-ops");
  assert.equal(draftKey({}), "untitled");
  assert.equal(draftKey({ jobId: "../etc/x" }), "job-etc-x");
});
