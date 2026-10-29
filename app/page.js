"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  applyFilters,
  cleanFilters,
  sortJobs,
  SORTS,
  postedLabel,
  DEFAULT_FILTERS,
  scoreReasons,
} from "../lib/jobFilters.js";
import profile from "../config/profile.json";
import countries from "../config/countries.json";
import XSearches from "./XSearches.js";
import FetchStatus from "./FetchStatus.js";
import FavouriteStar, { isFavourite } from "./FavouriteStar.js";
import EligibilityTag from "./EligibilityTag.js";
import { statusLabel } from "../lib/board.js";

// Only outcomes get a colour. Everything else is plain text.
const STATUS_TONE = {
  Applied: "good",
  "Applied (Auto)": "good",
  Interview: "good",
  Offer: "good",
  Rejected: "bad",
};

const CV_LABEL = Object.fromEntries(
  Object.entries(profile.tracks).map(([key, t]) => [key, `${t.label} resume`]),
);
const DEFAULT_CV_KEY =
  Object.keys(profile.tracks).find((k) => profile.tracks[k].isDefault) ||
  Object.keys(profile.tracks)[0];

const FILTERS_KEY = "jobFilters";
const TRACK_KEYS = Object.keys(profile.tracks);

const TABS = [
  { key: "all", label: "All", match: (s) => !["Closed", "Not Eligible", "Dismissed"].includes(s) },
  { key: "favourites", label: "★ Favourites", match: (s, job) => isFavourite(job) },
  {
    key: "awaiting",
    label: "Awaiting approval",
    match: (s) => s === "Awaiting Your Approval",
  },
  {
    key: "manual",
    label: "Apply yourself",
    match: (s) => s === "Needs Manual Apply",
  },
  { key: "applied", label: "Applied", match: (s) => s.startsWith("Applied") },
  { key: "interview", label: "Interview", match: (s) => s === "Interview" },
  { key: "offer", label: "Offer", match: (s) => s === "Offer" },
  { key: "rejected", label: "Rejected", match: (s) => s === "Rejected" },
  { key: "dismissed", label: "Dismissed", match: (s) => s === "Dismissed" },
  { key: "closed", label: "Closed", match: (s) => s === "Closed" },
  { key: "noteligible", label: "Not eligible", match: (s) => s === "Not Eligible" },
];

const KIT_STATUSES = [
  "Awaiting Your Approval",
  "Needs Manual Apply",
  "Approved",
];
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// The address an email-apply job will be sent to, or null for web-form jobs.
function applyEmailOf(job) {
  const method = (job["Submission Method"] || "").trim().toLowerCase();
  if (method !== "email") return null;
  const match = (job.Notes || "").match(EMAIL_RE);
  return match ? match[0] : null;
}

// The match score. Click, tap, Enter or Space opens the reasons behind it.
function ScoreTag({ job }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const reasons = scoreReasons(job);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span className="scoreWrap" ref={ref}>
      <button
        type="button"
        className="scoreTag scoreBtn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        Match {job["Match Score"]}
      </button>
      {open && (
        <div className="scorePopover" role="dialog" aria-label="Why this score">
          <div className="popTitle">Why this score</div>
          {reasons.length ? (
            <ul>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p>No reasons saved. Jobs found from now on show them.</p>
          )}
        </div>
      )}
    </span>
  );
}

function KitPanel({ job, kit, copied, onCopy }) {
  const cvKey = job["CV Version Used"] || DEFAULT_CV_KEY;
  const summary = kit.summaries ? kit.summaries[cvKey] : null;
  const summaryKey = `${job._row}-summary`;

  return (
    <div className="kitPanel">
      <div className="kitTitle">Your details</div>
      <div className="kitChips">
        {kit.profile.map((f) => {
          const key = `${job._row}-p-${f.label}`;
          return (
            <button
              key={key}
              className="chip"
              onClick={() => onCopy(f.value, key)}
            >
              {copied === key ? "Copied" : `Copy ${f.label}`}
            </button>
          );
        })}
      </div>

      <div className="kitTitle">Saved answers</div>
      {kit.answers.map((a) => {
        const key = `${job._row}-a-${a.label}`;
        const needsEdit = a.value.startsWith("EDIT ME");
        return (
          <div className="answerRow" key={key}>
            <div className={needsEdit ? "answerText needsEdit" : "answerText"}>
              <span className="answerLabel">{a.label}</span>
              <span>{a.value}</span>
            </div>
            <button className="actionBtn" onClick={() => onCopy(a.value, key)}>
              {copied === key ? "Copied" : "Copy"}
            </button>
          </div>
        );
      })}

      {summary && (
        <>
          <div className="kitTitle">
            Short summary ({CV_LABEL[cvKey] || "resume"})
          </div>
          <div className="answerRow">
            <div className="answerText">
              <span>{summary}</span>
            </div>
            <button
              className="actionBtn"
              onClick={() => onCopy(summary, summaryKey)}
            >
              {copied === summaryKey ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      <div className="kitLinks">
        <a className="actionBtn primary" href={`/api/resume?cv=${cvKey}`}>
          Download {CV_LABEL[cvKey] || "resume"}
        </a>
        <a
          className="actionBtn"
          href={job.Link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open application
        </a>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [busyRow, setBusyRow] = useState(null);
  const [kit, setKit] = useState(null);
  const [openKit, setOpenKit] = useState(null);
  const [copied, setCopied] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.success) setJobs(data.jobs || []);
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
    setLoading(false);
  }

  async function loadKit() {
    try {
      const res = await fetch("/api/kit");
      const data = await res.json();
      if (data.success) setKit(data.kit);
    } catch (err) {
      console.error("Failed to load apply kit", err);
    }
  }

  useEffect(() => {
    loadJobs();
    loadKit();
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || "null");
      setFilters(cleanFilters(saved, TRACK_KEYS));
    } catch {
      // storage unavailable or unreadable: start from the defaults
    }
    setFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // private window or blocked storage: filters just won't be remembered
    }
  }, [filters, filtersLoaded]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch (err) {
      window.alert("Could not copy. Select the text and copy it by hand.");
    }
  }

  async function updateStatus(row, status) {
    setBusyRow(row);
    let data = null;
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, status }),
      });
      data = await res.json();
      if (!res.ok) window.alert(data.error || "Could not update the job.");
      await loadJobs();
    } catch (err) {
      console.error("Failed to update status", err);
    }
    setBusyRow(null);
    return data;
  }

  // Approve sends the application right away for email jobs, so confirm first.
  async function approve(job) {
    const email = applyEmailOf(job);
    if (
      email &&
      !window.confirm(
        `Email your application to ${email}? It goes out right away, with your resume attached, and can't be undone.`,
      )
    ) {
      return;
    }
    const data = await updateStatus(job._row, "Approved");
    if (email && data && data.sent === false) {
      window.alert(
        "The email didn't send. The job stays Approved and the next run tries again. Check the email settings in .env.local.",
      );
    }
  }

  async function clearAll() {
    if (
      !window.confirm("Delete every job row from the sheet? The header stays.")
    )
      return;
    const res = await fetch("/api/clear", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || "Could not clear the sheet.");
      return;
    }
    await loadJobs();
  }

  const counts = useMemo(() => {
    const c = {};
    for (const tab of TABS) {
      c[tab.key] = jobs.filter((j) => tab.match(j.Status || "", j)).length;
    }
    return c;
  }, [jobs]);

  const inTab = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab) || TABS[0];
    return jobs.filter((j) => tab.match(j.Status || "", j));
  }, [jobs, activeTab]);

  const visible = useMemo(() => {
    return sortJobs(
      applyFilters(inTab, filters, { regions: countries.regions }),
      filters.sort,
    );
  }, [inTab, filters]);

  return (
    <div className="wrap">
      <div className="pageHead">
        <h1 className="pageTitle">Jobs</h1>
        <div className="headActions">
          <FetchStatus onDone={loadJobs} />
          <button className="ghostBtn" onClick={loadJobs}>
            Reload sheet
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.filter((t) => t.key === "all" || t.key === activeTab || counts[t.key]).map((t) => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {counts[t.key] ? <span className="tabCount">{counts[t.key]}</span> : null}
          </button>
        ))}
        <button
          className={`tab ${activeTab === "x" ? "active" : ""}`}
          onClick={() => setActiveTab("x")}
        >
          X
        </button>
      </div>

      {activeTab !== "x" && (
        <div className="filterBar">
          <select
            aria-label="Job type"
            value={filters.type}
            onChange={(e) => setFilter("type", e.target.value)}
          >
            <option value="all">All types</option>
            <option value="Internship">Internship</option>
            <option value="Full-time">Full-time</option>
          </select>
          <select
            aria-label="Posted"
            value={filters.posted}
            onChange={(e) => setFilter("posted", e.target.value)}
          >
            <option value="any">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="48h">Last 48 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
          <select
            aria-label="Location"
            value={filters.location}
            onChange={(e) => setFilter("location", e.target.value)}
          >
            <option value="all">Anywhere</option>
            <option value="canada">Canada</option>
            <option value="us">US</option>
            <option value="remote">Remote</option>
          </select>
          <select
            aria-label="Track"
            value={filters.track}
            onChange={(e) => setFilter("track", e.target.value)}
          >
            <option value="all">All tracks</option>
            {TRACK_KEYS.map((k) => (
              <option key={k} value={k}>
                {profile.tracks[k].label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => setFilter("sort", e.target.value)}
          >
            {Object.entries(SORTS).map(([key, label]) => (
              <option key={key} value={key}>
                Sort: {label}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Search role or company"
            placeholder="Search role or company"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
        </div>
      )}
      {activeTab !== "x" && (!loading || jobs.length > 0) && (
        <div className="matchLine">
          {visible.length === inTab.length
            ? `${visible.length} ${visible.length === 1 ? "job" : "jobs"}`
            : `${visible.length} of ${inTab.length} jobs match`}
          {filtersActive && (
            <button
              type="button"
              className="linkBtn"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {activeTab === "x" ? (
        <XSearches />
      ) : loading && jobs.length === 0 ? (
        <div className="loading">Loading jobs...</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          {filtersActive
            ? "No jobs match these filters."
            : "Nothing here yet. The next search adds new matches."}
        </div>
      ) : (
        <div className="panel">
          {visible.map((job) => {
            const applyEmail = applyEmailOf(job);
            const kitOpen = openKit === job._row;
            return (
              <div
                className={`jobRow ${job.Status === "Closed" ? "closed" : ""}`}
                key={job._row}
              >
                <div className="jobMain">
                  <p className="jobTitle">
                    <FavouriteStar
                      job={job}
                      onChange={(j, on) =>
                        setJobs((list) =>
                          list.map((x) =>
                            x._row === j._row ? { ...x, Favourite: on ? "★" : "" } : x,
                          ),
                        )
                      }
                    />
                    {job.id ? (
                      <Link href={`/jobs/${job.id}`}>
                        {job["Role Title"] || "Untitled role"}
                      </Link>
                    ) : (
                      job["Role Title"] || "Untitled role"
                    )}
                    {job.Link && (
                      <a
                        className="postingLink"
                        href={job.Link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Posting ↗
                      </a>
                    )}
                  </p>
                  <div className="jobCompany">
                    <span className="company">
                      {job.Company || "Unknown company"}
                    </span>
                    {job["Country/Remote"] && (
                      <span className="location">{job["Country/Remote"]}</span>
                    )}
                    {job["Employment Type"] &&
                      !["Not specified", "N/A"].includes(job["Employment Type"]) && (
                        <span className="location">
                          {job["Employment Type"]}
                        </span>
                      )}
                  </div>
                  <div className="jobMetaLine">
                    {job["Match Score"] && (
                      <ScoreTag job={job} />
                    )}
                    <EligibilityTag text={job.Eligibility} />
                    {postedLabel(job) && (
                      <span className="cvTag">{postedLabel(job)}</span>
                    )}
                    {job["Est. Salary"] &&
                      job["Est. Salary"] !== "Not listed" && (
                        <span className="salaryTag">{job["Est. Salary"]}</span>
                      )}
                    {job["CV Version Used"] && (
                      <span className="cvTag">
                        {CV_LABEL[job["CV Version Used"]] ||
                          job["CV Version Used"]}
                      </span>
                    )}
                    <span className={`statusText ${STATUS_TONE[job.Status] || ""}`}>
                      {statusLabel(job.Status)}
                    </span>
                  </div>
                  {applyEmail && (
                    <div className="applyEmail">
                      Applies by email to {applyEmail}
                    </div>
                  )}
                  {kitOpen && kit && (
                    <KitPanel
                      job={job}
                      kit={kit}
                      copied={copied}
                      onCopy={copy}
                    />
                  )}
                </div>
                <div className="jobActions">
                  {job.Status === "Awaiting Your Approval" && (
                    <>
                      <button
                        className="actionBtn primary"
                        disabled={busyRow === job._row}
                        onClick={() => approve(job)}
                      >
                        {applyEmail ? "Email application" : "Approve"}
                      </button>
                      <button
                        className="actionBtn"
                        disabled={busyRow === job._row}
                        onClick={() => updateStatus(job._row, "Dismissed")}
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {job.Status === "Needs Manual Apply" && (
                    <button
                      className="actionBtn primary"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Applied")}
                    >
                      Mark applied
                    </button>
                  )}
                  {(job.Status === "Applied" ||
                    job.Status === "Applied (Auto)") && (
                    <button
                      className="actionBtn"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Interview")}
                    >
                      Got an interview
                    </button>
                  )}
                  {(job.Status === "Applied" ||
                    job.Status === "Applied (Auto)" ||
                    job.Status === "Interview") && (
                    <button
                      className="actionBtn"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Offer")}
                    >
                      Got an offer
                    </button>
                  )}
                  {KIT_STATUSES.includes(job.Status) && (
                    <button
                      className="actionBtn"
                      onClick={() => setOpenKit(kitOpen ? null : job._row)}
                    >
                      {kitOpen ? "Hide kit" : "Apply kit"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {activeTab !== "x" && jobs.length > 0 && (
        <div className="pageFoot">
          <button className="linkBtn danger" onClick={clearAll}>
            Delete every job from the sheet
          </button>
        </div>
      )}
    </div>
  );
}
