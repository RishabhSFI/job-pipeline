import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS } from "../lib/sheets.js";
import {
  BOARD_COLUMNS,
  columnOfStatus,
  statusForDrop,
  isFollowUpDue,
  statusLabel,
  userNotes,
} from "../lib/board.js";

test("every STATUS lands in exactly one column", () => {
  for (const status of Object.values(STATUS)) {
    const hits = BOARD_COLUMNS.filter((c) => c.statuses.includes(status));
    assert.equal(hits.length, 1, `${status} is in ${hits.length} columns`);
  }
  const listed = BOARD_COLUMNS.flatMap((c) => c.statuses);
  assert.deepEqual(new Set(listed), new Set(Object.values(STATUS)));
});

test("no column default is Approved, and each default is in its own column", () => {
  for (const c of BOARD_COLUMNS) {
    assert.notEqual(c.defaultStatus, STATUS.APPROVED);
    assert.ok(c.statuses.includes(c.defaultStatus), c.key);
  }
});

test("dropping into a column gives its default status", () => {
  assert.equal(statusForDrop("Applied", "saved"), "Needs Manual Apply");
  assert.equal(statusForDrop("Needs Manual Apply", "applied"), "Applied");
  assert.equal(statusForDrop("Applied", "interview"), "Interview");
  assert.equal(statusForDrop("Interview", "offer"), "Offer");
  assert.equal(statusForDrop("Offer", "closed"), "Rejected");
});

test("dropping into the same column keeps the exact status", () => {
  assert.equal(statusForDrop("Applied (Auto)", "applied"), "Applied (Auto)");
  assert.equal(statusForDrop("Approved", "saved"), "Approved");
  assert.equal(statusForDrop("No Response", "closed"), "No Response");
});

test("unknown column returns null; unknown status falls into Saved", () => {
  assert.equal(statusForDrop("Applied", "nope"), null);
  assert.equal(columnOfStatus("").key, "saved");
});

test("follow-up is due today or earlier only", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  assert.equal(isFollowUpDue("2026-10-28", now), true);
  assert.equal(isFollowUpDue("2026-10-01", now), true);
  assert.equal(isFollowUpDue("2026-10-29", now), false);
  assert.equal(isFollowUpDue("", now), false);
});

test("dismissed jobs sit in Closed and stay put when dropped there", () => {
  assert.equal(columnOfStatus("Dismissed").key, "closed");
  assert.equal(statusForDrop("Dismissed", "closed"), "Dismissed");
});

test("statuses read in sentence case on screen", () => {
  assert.equal(statusLabel("Needs Manual Apply"), "Apply yourself");
  assert.equal(statusLabel("Awaiting Your Approval"), "Awaiting approval");
  assert.equal(statusLabel("Interview"), "Interview");
  assert.equal(statusLabel(""), "");
});

test("cards hide the search's own notes and keep yours", () => {
  assert.equal(userNotes("Auto-approved (score 100)"), "");
  assert.equal(userNotes("Auto-approved (score 88). Apply by email: a@b.co"), "Apply by email: a@b.co");
  assert.equal(userNotes("Met Sam at the info session"), "Met Sam at the info session");
  assert.equal(userNotes(""), "");
});
