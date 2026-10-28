// closing.js
// Decides which sheet jobs have closed and which closed ones are back.
// A job closes only when it came from a listing that holds every open job
// (a company's Greenhouse, Lever or Ashby board, or Simplify's lists), that
// listing was read in full this run, and the job is no longer in it. Remote
// boards, HN and the YC page show only recent jobs, so they never close one.

import { STATUS } from "./sheets.js";
import { columnByKey } from "./board.js";
import { normalizeLink } from "./jobId.js";

// Jobs not yet applied to: the board's Saved column.
const OPEN = new Set(columnByKey("saved").statuses);

// The complete listing a saved posting belongs to, named the way fetchAll
// names them ("greenhouse:stripe", "simplify:all").
const LISTING_OF = {
  greenhouse: (posting) => posting.company,
  lever: (posting) => posting.company,
  ashby: (posting) => posting.company,
  simplify: () => "all",
};

export function listingKey(posting) {
  const listing = LISTING_OF[posting?.source]?.(posting);
  return listing ? `${posting.source}:${listing}` : null;
}

// rows: sheet rows ({ _row, Link, Status }). postingFor(link): the saved
// posting or null. seenLinks: normalized links of every job fetched this run.
// complete: Set of listing keys read in full this run.
// Returns [{ row, link, status, kind: "closed" | "reopened" }].
export function closingChanges(rows, { postingFor, seenLinks, complete }) {
  const changes = [];
  for (const row of rows) {
    if (!row.Link) continue;
    const seen = seenLinks.has(normalizeLink(row.Link));
    if (row.Status === STATUS.CLOSED && seen) {
      changes.push({ row: row._row, link: row.Link, status: STATUS.NEEDS_MANUAL, kind: "reopened" });
    } else if (OPEN.has(row.Status) && !seen) {
      const key = listingKey(postingFor(row.Link));
      if (key && complete.has(key)) {
        changes.push({ row: row._row, link: row.Link, status: STATUS.CLOSED, kind: "closed" });
      }
    }
  }
  return changes;
}
