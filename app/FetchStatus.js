"use client";

import { useEffect, useRef, useState } from "react";
import { failingSources, timeAgo } from "../lib/jobFilters.js";

// "Fetch now", when the last search ran, and which sources had a problem.
export default function FetchStatus({ onDone }) {
  const [runs, setRuns] = useState([]);
  const [sources, setSources] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [, setTick] = useState(0);
  const box = useRef(null);

  async function loadRuns() {
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      setRuns(data.runs || []);
      setSources(data.sources || []);
    } catch (err) {
      console.error("Failed to load runs", err);
    }
    setLoaded(true);
  }

  useEffect(() => {
    loadRuns();
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!listOpen) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !box.current?.contains(e.target)) {
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [listOpen]);

  async function fetchNow() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/fetch", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setMessage(data.error || "The search failed. See the server log.");
      } else {
        const added = data.run?.added ?? data.added;
        setMessage(typeof added === "number" ? `Added ${added} new` : "Done");
      }
    } catch {
      setMessage("Could not reach the server.");
    }
    await loadRuns();
    if (onDone) await onDone();
    setBusy(false);
  }

  const failing = failingSources(sources);
  const last = runs[0];

  return (
    <div className="fetchBox" ref={box}>
      <div className="fetchInfo">
        {loaded && (
          <span>
            {last ? `Last fetched ${timeAgo(last.at)}` : "Not fetched yet"}
          </span>
        )}
        {failing.length > 0 && (
          <button
            type="button"
            className="linkBtn warn"
            aria-expanded={listOpen}
            onClick={() => setListOpen((o) => !o)}
          >
            {failing.length === 1 ? "1 source had a problem" : `${failing.length} sources had a problem`}
          </button>
        )}
      </div>
      <button className="ghostBtn primaryGhost" disabled={busy} onClick={fetchNow}>
        {busy ? "Searching… about a minute" : "Fetch now"}
      </button>
      {message && !busy && (
        <div className="fetchMessage" role="status">
          {message}
        </div>
      )}
      {listOpen && (
        <div className="sourcePanel" role="dialog" aria-label="Source problems">
          {failing.map((s) => {
            const ok = runsLastOk(runs, s.name);
            return (
              <div className="sourceRow" key={s.name}>
                <strong>{s.name}</strong>
                <span>{ok ? `Last worked ${timeAgo(ok)}` : "Has not worked yet"}</span>
                <span className="sourceError">{s.error || "No error message"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function runsLastOk(runs, name) {
  for (const run of runs) {
    if ((run.sources || []).some((s) => s.name === name && s.ok)) return run.at;
  }
  return "";
}
