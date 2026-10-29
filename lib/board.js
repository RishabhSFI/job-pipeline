// board.js
// Which board column each sheet status belongs to, and which status a card
// gets when it is dropped into a column. Pure data, used by /board and tests.

// Plain strings, not an import of sheets.js: that file pulls in googleapis and
// must stay out of the browser bundle. tests/board.test.mjs checks these
// against STATUS so they cannot drift.
const STATUS = {
  NEW: "New",
  AWAITING_APPROVAL: "Awaiting Your Approval",
  APPROVED: "Approved",
  APPLIED: "Applied",
  APPLIED_AUTO: "Applied (Auto)",
  NEEDS_MANUAL: "Needs Manual Apply",
  FOLLOWUP_SENT: "Follow-up Sent",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  CLOSED: "Closed",
  NOT_ELIGIBLE: "Not Eligible",
  REJECTED: "Rejected",
  DISMISSED: "Dismissed",
  NO_RESPONSE: "No Response",
};

// "Approved" is never a drop target: setting it can email an application.
export const BOARD_COLUMNS = [
  {
    key: "saved",
    label: "Saved",
    defaultStatus: STATUS.NEEDS_MANUAL,
    statuses: [
      STATUS.NEW,
      STATUS.AWAITING_APPROVAL,
      STATUS.APPROVED,
      STATUS.NEEDS_MANUAL,
    ],
  },
  {
    key: "applied",
    label: "Applied",
    defaultStatus: STATUS.APPLIED,
    statuses: [STATUS.APPLIED, STATUS.APPLIED_AUTO, STATUS.FOLLOWUP_SENT],
  },
  {
    key: "interview",
    label: "Interview",
    defaultStatus: STATUS.INTERVIEW,
    statuses: [STATUS.INTERVIEW],
  },
  {
    key: "offer",
    label: "Offer",
    defaultStatus: STATUS.OFFER,
    statuses: [STATUS.OFFER],
  },
  {
    key: "closed",
    label: "Closed",
    defaultStatus: STATUS.REJECTED,
    statuses: [STATUS.REJECTED, STATUS.DISMISSED, STATUS.NO_RESPONSE, STATUS.CLOSED, STATUS.NOT_ELIGIBLE],
  },
];

export function columnOfStatus(status) {
  return (
    BOARD_COLUMNS.find((c) => c.statuses.includes(status)) || BOARD_COLUMNS[0]
  );
}

export function columnByKey(key) {
  return BOARD_COLUMNS.find((c) => c.key === key) || null;
}

// A card dropped on its own column keeps its exact status.
export function statusForDrop(currentStatus, columnKey) {
  const col = columnByKey(columnKey);
  if (!col) return null;
  if (col.statuses.includes(currentStatus)) return currentStatus;
  return col.defaultStatus;
}

export function isFollowUpDue(followUp, today = new Date()) {
  if (!followUp) return false;
  return followUp <= today.toISOString().slice(0, 10);
}

// How a sheet status reads on screen. The sheet keeps its stored values.
const STATUS_LABEL = {
  [STATUS.AWAITING_APPROVAL]: "Awaiting approval",
  [STATUS.NEEDS_MANUAL]: "Apply yourself",
  [STATUS.APPLIED_AUTO]: "Applied by email",
  [STATUS.FOLLOWUP_SENT]: "Follow-up sent",
  [STATUS.NOT_ELIGIBLE]: "Not eligible",
  [STATUS.NO_RESPONSE]: "No response",
};
export const statusLabel = (status) => STATUS_LABEL[status] || status || "";

// Notes the job search wrote for itself, which say nothing to the person
// reading the card. The sheet keeps them; the card hides them.
const MACHINE_NOTES = [/^Auto-approved \(score \d+\)$/, /^Flagged for manual CV review$/];
export function userNotes(notes) {
  return String(notes || "")
    .split(/\.\s+|\.$/)
    .map((s) => s.trim())
    .filter((s) => s && !MACHINE_NOTES.some((re) => re.test(s)))
    .join(". ");
}
