import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS } from "../lib/sheets.js";
import {
  BOARD_COLUMNS,
  columnOfStatus,
  statusForDrop,
  isFollowUpDue,
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
