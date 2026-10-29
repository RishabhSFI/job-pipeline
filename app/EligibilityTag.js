"use client";

// Shows the sheet's Eligibility cell: "Not eligible: …", "Check: …" or a
// quiet "Note: …". The reasons are in the tooltip and readable by screen readers.
export default function EligibilityTag({ text, full = false }) {
  const value = String(text || "").trim();
  if (!value) return null;
  const [label, ...rest] = value.split(": ");
  const reasons = rest.join(": ");
  const kind = label === "Not eligible" ? "no" : label === "Check" ? "check" : "note";
  // Phones have no tooltips, so the main reason is always visible.
  const parts = reasons.split(" · ");
  const short =
    kind === "note" ? reasons : `${label}: ${parts[0]}${parts.length > 1 ? ` (+${parts.length - 1} more)` : ""}`;
  return (
    <span className={`eligTag ${kind}`} title={reasons} aria-label={`${label}: ${reasons}`}>
      {kind === "no" ? "✕ " : kind === "check" ? "! " : ""}
      {full ? (kind === "note" ? reasons : `${label}: ${reasons}`) : short}
    </span>
  );
}
