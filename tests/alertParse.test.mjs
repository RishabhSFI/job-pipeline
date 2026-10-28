import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  parseLinkedInAlert,
  parseIndeedAlert,
  parseAlertEmail,
  normalizeLinkedInLink,
  normalizeIndeedLink,
} from "../lib/alertParse.js";

const fixture = (name) =>
  fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8");

test("a LinkedIn alert with several jobs yields one job per block", () => {
  const jobs = parseLinkedInAlert(fixture("linkedin-alert.txt"));
  assert.deepEqual(
    jobs.map((j) => [j.title, j.company, j.location]),
    [
      ["Operations Analyst", "Northwind Labs", "Toronto, ON"],
      ["Business Operations Associate (New Grad)", "Acme Robotics Inc.", "Toronto, Ontario, Canada (Hybrid)"],
    ],
  );
});

test("LinkedIn links lose their tracking and use the public job URL", () => {
  const jobs = parseLinkedInAlert(fixture("linkedin-alert.txt"));
  assert.deepEqual(
    jobs.map((j) => j.link),
    ["https://www.linkedin.com/jobs/view/3912345678/", "https://www.linkedin.com/jobs/view/3912399999/"],
  );
  assert.equal(
    normalizeLinkedInLink("https://www.linkedin.com/comm/jobs/view/42424242/?trackingId=x"),
    "https://www.linkedin.com/jobs/view/42424242/",
  );
});

test("the same job twice in one email is returned once", () => {
  const jobs = parseLinkedInAlert(fixture("linkedin-alert.txt"));
  assert.equal(jobs.filter((j) => j.title === "Operations Analyst").length, 1);
});

test("header, footer, badge and search-link lines never become jobs", () => {
  const text = fixture("linkedin-alert.txt");
  const jobs = parseLinkedInAlert(text);
  const all = JSON.stringify(jobs);
  for (const junk of ["Actively recruiting", "alumni", "Unsubscribe", "See all jobs", "New jobs"]) {
    assert.ok(!all.includes(junk), junk);
  }
  assert.deepEqual(parseLinkedInAlert("nothing here\nView job: not a link"), []);
  assert.deepEqual(parseLinkedInAlert(""), []);
});

test("a View job link wrapped onto the next line still parses", () => {
  const text = "Analyst\nAcme\nOttawa, ON\nView job:\nhttps://www.linkedin.com/comm/jobs/view/1234567/?t=1\n";
  assert.equal(parseLinkedInAlert(text)[0].link, "https://www.linkedin.com/jobs/view/1234567/");
});

test("an Indeed alert gives title, company, location and a clean link", () => {
  const jobs = parseIndeedAlert(fixture("indeed-alert.txt"));
  assert.deepEqual(jobs, [
    {
      title: "Junior Business Analyst",
      company: "Maple Finance",
      location: "Toronto, ON",
      link: "https://ca.indeed.com/viewjob?jk=1a2b3c4d5e6f7a8b",
    },
    {
      title: "Operations Coordinator",
      company: "Harbour Logistics",
      location: "Remote",
      link: "https://ca.indeed.com/viewjob?jk=ffeeddccbbaa9988",
    },
  ]);
  assert.equal(normalizeIndeedLink("https://ca.indeed.com/rc/clk?jk=abc&from=x"), "https://ca.indeed.com/viewjob?jk=abc");
});

test("the sender decides which parser and source label apply", () => {
  const li = parseAlertEmail({ from: "jobalerts-noreply@linkedin.com", text: fixture("linkedin-alert.txt") });
  assert.equal(li.source, "linkedin-alert");
  assert.equal(li.jobs.length, 2);
  const ind = parseAlertEmail({ from: "alert@indeed.com", text: fixture("indeed-alert.txt") });
  assert.equal(ind.source, "indeed-alert");
  assert.deepEqual(parseAlertEmail({ from: "friend@example.com", text: "hi" }), { source: "", jobs: [] });
});
