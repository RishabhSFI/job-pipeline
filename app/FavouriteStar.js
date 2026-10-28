"use client";

import { useState } from "react";

export const isFavourite = (job) => String(job?.Favourite || "").trim() !== "";

// A star that saves a job as a favourite. Updates at once and rolls back if
// saving fails. onChange(job, on) lets the page update its own list.
export default function FavouriteStar({ job, onChange, className = "" }) {
  const [on, setOn] = useState(isFavourite(job));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setError("");
    onChange?.(job, next);
    try {
      const res = await fetch("/api/favourite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: job._row, on: next, link: job.Link }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (err) {
      setOn(!next);
      onChange?.(job, !next);
      setError(`Couldn't save: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`favStar ${on ? "on" : ""} ${className}`}
      aria-pressed={on}
      aria-label={on ? "Remove from favourites" : "Save to favourites"}
      title={error || (on ? "Remove from favourites" : "Save to favourites")}
      onClick={toggle}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
