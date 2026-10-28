import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// lib/store.js keeps data/ under the working directory: use a temp one so
// the test never touches your real data.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "digest-test-")));
const { digestDue, digestHour, localDate, queueForDigest, pendingDigest, markDigestSent, isDigestDue } =
  await import("../lib/digest.js");

const at = (day, hour) => new Date(2026, 9, day, hour, 30);

test("the digest goes out on the first run at or after the digest hour", () => {
  assert.equal(digestDue(undefined, at(28, 4), 8), false);
  assert.equal(digestDue(undefined, at(28, 8), 8), true);
  assert.equal(digestDue("2026-10-27", at(28, 12), 8), true);
});

test("only once a day, then again the next day", () => {
  const sent = localDate(at(28, 8));
  assert.equal(digestDue(sent, at(28, 12), 8), false);
  assert.equal(digestDue(sent, at(28, 23), 8), false);
  assert.equal(digestDue(sent, at(29, 4), 8), false);
  assert.equal(digestDue(sent, at(29, 8), 8), true);
});

test("DIGEST_HOUR is read, and bad values fall back to 8", () => {
  assert.equal(digestHour({ DIGEST_HOUR: "18" }), 18);
  assert.equal(digestHour({ DIGEST_HOUR: "0" }), 0);
  assert.equal(digestHour({}), 8);
  assert.equal(digestHour({ DIGEST_HOUR: "" }), 8);
  assert.equal(digestHour({ DIGEST_HOUR: "25" }), 8);
  assert.equal(digestHour({ DIGEST_HOUR: "soon" }), 8);
});

test("jobs queued by every run wait for the one digest, then clear", () => {
  queueForDigest({ needsManualApply: [{ title: "Analyst", company: "Acme", link: "a" }] });
  queueForDigest({
    needsManualApply: [{ "Role Title": "Analyst", Company: "Acme", Link: "a" }],
    autoApplied: [{ title: "Ops", company: "Beta", link: "b" }],
  });
  const pending = pendingDigest();
  assert.deepEqual(pending.needsManualApply.map((j) => j.link), ["a"]);
  assert.deepEqual(pending.autoApplied.map((j) => j.company), ["Beta"]);

  const morning = at(28, 9);
  assert.equal(isDigestDue(morning), true);
  markDigestSent(morning);
  assert.equal(isDigestDue(at(28, 13)), false);
  assert.deepEqual(pendingDigest(), { needsManualApply: [], autoApplied: [] });
});
