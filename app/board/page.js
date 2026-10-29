"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import profile from "../../config/profile.json";
import {
  BOARD_COLUMNS,
  columnOfStatus,
  statusForDrop,
  isFollowUpDue,
  statusLabel,
  userNotes,
} from "../../lib/board.js";
import styles from "./board.module.css";
import FavouriteStar from "../FavouriteStar.js";

const TRACKS = Object.entries(profile.tracks).map(([key, t]) => ({
  key,
  label: t.label,
}));
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

function Card({ job, today, dragging, onDragStart, onDragEnd, onMove, onSaveNotes }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const col = columnOfStatus(job.Status);
  const salary = job["Est. Salary"];
  const followUp = job["Follow-up Date"];
  const due = isFollowUpDue(followUp, today);
  const notes = job.Notes || "";
  const hasEmail = EMAIL_RE.test(notes);

  function startEdit() {
    setDraft(notes);
    setEditing(true);
  }

  async function save() {
    if (
      hasEmail &&
      !EMAIL_RE.test(draft) &&
      !window.confirm(
        "These notes hold the address used to email this application. Remove it?",
      )
    ) {
      return;
    }
    setSaving(true);
    const ok = await onSaveNotes(job, draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <div
      className={`${styles.card} ${dragging ? styles.dragging : ""}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(job._row));
        onDragStart(job._row);
      }}
      onDragEnd={onDragEnd}
    >
      <div className={styles.cardTitle}>
        <FavouriteStar job={job} />
        {job.id ? (
          <Link href={`/jobs/${job.id}`}>{job["Role Title"] || "Untitled role"}</Link>
        ) : (
          job["Role Title"] || "Untitled role"
        )}
      </div>
      <div className={styles.company}>{job.Company || "Unknown company"}</div>
      <div className={styles.tags}>
        {job["Match Score"] && (
          <span className={styles.score}>Match {job["Match Score"]}</span>
        )}
        {salary && salary !== "Not listed" && (
          <span className={styles.salary}>{salary}</span>
        )}
        <span className={styles.status}>{statusLabel(job.Status)}</span>
      </div>
      {followUp && (
        <div className={due ? styles.followDue : styles.follow}>
          {due ? "Follow up due " : "Follow up "}
          {followUp}
        </div>
      )}

      {editing ? (
        <div className={styles.notesEdit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={5000}
            aria-label="Notes"
            autoFocus
          />
          <div className={styles.row}>
            <button className={styles.primary} disabled={saving} onClick={save}>
              {saving ? "Saving" : "Save"}
            </button>
            <button disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={styles.notesBtn} onClick={startEdit}>
          {userNotes(notes) ? <span className={styles.notesText}>{userNotes(notes)}</span> : "Add notes"}
        </button>
      )}

      <div className={styles.cardFoot}>
        <label className={styles.moveLabel}>
          <span className={styles.srOnly}>Move {job["Role Title"]} to</span>
          <select
            value=""
            onChange={(e) => e.target.value && onMove(job, e.target.value)}
          >
            <option value="">Move to…</option>
            {BOARD_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.links}>
          {job.Link && (
            <a href={job.Link} target="_blank" rel="noopener noreferrer">
              Posting ↗
            </a>
          )}
        </span>
      </div>
    </div>
  );
}

export default function Board() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState("");
  const [dragRow, setDragRow] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const today = useRef(new Date()).current;

  async function load(quiet) {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Could not load jobs.");
      setJobs(data.jobs || []);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(false);
  }, []);

  function patchJob(row, patch) {
    setJobs((list) => list.map((j) => (j._row === row ? { ...j, ...patch } : j)));
  }

  async function moveTo(job, columnKey) {
    const status = statusForDrop(job.Status, columnKey);
    if (!status || status === job.Status) return;
    const previous = job.Status;
    setError("");
    patchJob(job._row, { Status: status });
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: job._row, status }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "The server refused the move.");
      }
      load(true);
    } catch (err) {
      patchJob(job._row, { Status: previous });
      setError(
        `Could not move "${job["Role Title"] || "job"}" to ${status}: ${err.message}`,
      );
    }
  }

  async function saveNotes(job, text) {
    const previous = job.Notes || "";
    setError("");
    patchJob(job._row, { Notes: text });
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: job._row, notes: text }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "The server refused the notes.");
      }
      return true;
    } catch (err) {
      patchJob(job._row, { Notes: previous });
      setError(`Could not save notes: ${err.message}`);
      return false;
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      // Not-eligible jobs aren't part of the pipeline. The Jobs list keeps them.
      if (j.Status === "Not Eligible") return false;
      if (track && j["CV Version Used"] !== track) return false;
      if (!q) return true;
      return `${j["Role Title"]} ${j.Company}`.toLowerCase().includes(q);
    });
  }, [jobs, search, track]);

  const byColumn = useMemo(() => {
    const map = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, []]));
    for (const j of filtered) map[columnOfStatus(j.Status || "").key].push(j);
    for (const list of Object.values(map)) {
      list.sort(
        (a, b) => Number(b["Match Score"] || 0) - Number(a["Match Score"] || 0),
      );
    }
    return map;
  }, [filtered]);

  function onDrop(e, columnKey) {
    e.preventDefault();
    const row = Number(e.dataTransfer.getData("text/plain")) || dragRow;
    setOverCol(null);
    setDragRow(null);
    const job = jobs.find((j) => j._row === row);
    if (job) moveTo(job, columnKey);
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Pipeline board</h1>
        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Search role or company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search role or company"
          />
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            aria-label="Filter by track"
          >
            <option value="">All tracks</option>
            {TRACKS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button onClick={() => load(false)}>Reload sheet</button>
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {loadError && <div className={styles.error}>{loadError}</div>}

      {loading ? (
        <div className={styles.empty}>Loading jobs...</div>
      ) : (
        <div className={styles.board}>
          {BOARD_COLUMNS.map((c) => (
            <section
              key={c.key}
              className={`${styles.column} ${overCol === c.key ? styles.over : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overCol !== c.key) setOverCol(c.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
              }}
              onDrop={(e) => onDrop(e, c.key)}
              aria-label={c.label}
            >
              <header className={styles.colHead}>
                <span>{c.label}</span>
                <span className={styles.count}>{byColumn[c.key].length}</span>
              </header>
              <div className={styles.cards}>
                {byColumn[c.key].map((job) => (
                  <Card
                    key={job._row}
                    job={job}
                    today={today}
                    dragging={dragRow === job._row}
                    onDragStart={setDragRow}
                    onDragEnd={() => {
                      setDragRow(null);
                      setOverCol(null);
                    }}
                    onMove={moveTo}
                    onSaveNotes={saveNotes}
                  />
                ))}
                {byColumn[c.key].length === 0 && (
                  <div className={styles.emptyCol}>No jobs here yet</div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
