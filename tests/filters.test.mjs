import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocationEligible,
  isLocationRestricted,
  isRemoteJob,
  filterJobs,
  deduplicate,
} from "../lib/filters.js";

test("Canada and the US are accepted by country, province, state or city", () => {
  for (const place of [
    "Toronto, ON",
    "Vancouver, British Columbia",
    "London, ON",
    "Montreal, QC, Canada",
    "New York, NY",
    "San Francisco",
    "Austin, Texas",
    "SF Bay Area",
    "Denver",
    "Remote - USA",
    "Remote - Canada",
    "United States",
  ]) {
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("other countries are rejected, including look-alike state codes", () => {
  for (const place of [
    "London, UK",
    "Berlin",
    "Berlin, Germany",
    "Berlin, DE",
    "Mumbai, IN",
    "Lagos, Nigeria",
    "Sydney, Australia",
    "Tbilisi, Georgia",
  ]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote and worldwide jobs are accepted, and so is a blank location", () => {
  for (const place of ["Remote", "Worldwide", "Anywhere", "Remote, Global", ""]) {
    assert.equal(isLocationEligible(place).ok, true, place || "(blank)");
  }
});

test("remote jobs limited to a region outside Canada and the US are rejected", () => {
  for (const place of [
    "Remote - Europe",
    "Remote, EMEA",
    "Remote - UK",
    "Remote, APAC",
    "Remote - LATAM",
    "Remote - India",
  ]) {
    assert.equal(isLocationRestricted(place), true, place);
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("a location that also names Canada or the US is not restricted", () => {
  for (const place of [
    "Remote",
    "Remote - North America",
    "Remote - US or Europe",
    "Remote - New Mexico",
    "Toronto, ON; London, UK",
  ]) {
    assert.equal(isLocationRestricted(place), false, place);
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("lowercase 'in', 'or' and 'me' after a comma are words, not state codes", () => {
  for (const place of ["Remote, in Europe", "Paris, or Lyon", "Rome, me"]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({
      source: "himalayas",
      location: "United States",
      title: "Dev",
    }),
    true,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "Berlin, Germany",
      title: "Dev",
      description: "",
    }),
    false,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "",
      title: "Dev",
      description: "This is a fully remote role.",
    }),
    true,
  );
});

test("filterJobs keeps North American and open jobs and drops the rest", () => {
  const out = filterJobs([
    { source: "ashby", title: "Analyst", location: "Toronto, ON" },
    { source: "ashby", title: "Analyst", location: "Berlin, Germany" },
    { source: "ashby", title: "Analyst", location: "Remote, EMEA" },
    { source: "ashby", title: "Analyst", location: "Remote" },
  ]);
  assert.deepEqual(
    out.map((j) => j.location),
    ["Toronto, ON", "Remote"],
  );
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});
