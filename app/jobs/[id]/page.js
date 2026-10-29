"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../jobs.module.css";
import Writing from "./Writing.js";
import Outreach from "./Outreach.js";
import { api, CopyButton } from "./ui.js";
import FavouriteStar from "../../FavouriteStar.js";
import Requirements from "./Requirements.js";

const STATUS_COLOR = {
  "Awaiting Your Approval": "var(--status-awaiting)",
  Approved: "var(--status-approved)",
  Applied: "var(--status-applied)",
  "Applied (Auto)": "var(--status-applied)",
  "Needs Manual Apply": "var(--status-manual)",
  Interview: "var(--status-interview)",
  Offer: "var(--status-applied)",
  Rejected: "var(--status-rejected)",
};

function host(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function KitRows({ rows }) {
  return (
    <div className={s.kv}>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}
function Row({ label, value }) {
  return (
    <>
      <span>{label}</span>
      <span>{value}</span>
      <CopyButton text={value} />
    </>
  );
}

export default function JobPage({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusErr, setStatusErr] = useState("");

  useEffect(() => {
    api(`/api/jobs/${id}`).then((r) => (r.success ? setData(r) : setError(r.error || "Could not load this job.")));
  }, [id]);

  if (error)
    return (
      <main className={s.wrap}>
        <Link href="/" className={s.back}>
          Back to jobs
        </Link>
        <p className={s.error}>{error}</p>
      </main>
    );
  if (!data)
    return (
      <main className={s.wrap}>
        <p className={s.note}>Loading…</p>
      </main>
    );

  const { job, posting, match, kit, track, linkedin, drafts, contacts, domain, outreach, aiAvailable } = data;
  const status = job.Status || "New";

  async function setStatus(next) {
    setBusy(true);
    setStatusErr("");
    const r = await api(`/api/jobs/${id}`, "POST", { status: next });
    setBusy(false);
    if (r.success) {
      setData({ ...data, job: { ...job, Status: next } });
      setAsking(false);
    } else setStatusErr(r.error);
  }

  const kitProfile = (kit.profile || []).filter((p) => p.value);
  const kitAnswers = (kit.answers || []).filter((p) => p.value);
  const summary = kit.summaries?.[track.key];

  return (
    <main className={s.wrap}>
      <Link href="/" className={s.back}>
        Back to jobs
      </Link>
      <h1 className={s.title}>
        <FavouriteStar job={job} />
        {job["Role Title"]}
      </h1>
      <p className={s.sub}>{job.Company}</p>
      <div className={s.meta}>
        <span className={s.pill} style={{ background: STATUS_COLOR[status] }}>
          {status}
        </span>
        {job["Country/Remote"] && <span>{job["Country/Remote"]}</span>}
        {(job["Est. Salary"] || posting.salary) && <span><b>{job["Est. Salary"] || posting.salary}</b></span>}
        <span>
          Match <span className={s.score}>{job["Match Score"]}</span>
        </span>
        {track.label && <span>{track.label} CV</span>}
        {job["Posted Date"] ? <span>Posted {job["Posted Date"]}</span> : job["Date Found"] && <span>Found {job["Date Found"]}</span>}
        {job.Link && (
          <a href={job.Link} target="_blank" rel="noreferrer">
            {host(job.Link)}
          </a>
        )}
      </div>

      <section className={s.card}>
        <div className={s.actions}>
          <a
            className={s.btn}
            href={job.Link}
            target="_blank"
            rel="noreferrer"
            onClick={() => setAsking(true)}
          >
            Open application
          </a>
          <Link className={s.ghost} href={`/studio?job=${id}`}>
            Tailor resume
          </Link>
          {["Interview", "Offer", "Rejected"].map((st) => (
            <button key={st} className={s.ghost} disabled={busy || status === st} onClick={() => setStatus(st)}>
              {st === "Rejected" ? "Rejected" : `Mark ${st.toLowerCase()}`}
            </button>
          ))}
        </div>
        {asking && (
          <div className={s.prompt}>
            <span>Did you apply?</span>
            <button className={s.btn} disabled={busy} onClick={() => setStatus("Applied")}>
              Mark applied
            </button>
            <button className={s.ghost} onClick={() => setAsking(false)}>
              Not yet
            </button>
            <span className={s.note}>Sets a follow-up 7 days out.</span>
          </div>
        )}
        {statusErr && <p className={s.error}>{statusErr}</p>}
      </section>

      <section className={s.card}>
        <h2>Posting</h2>
        {posting.text ? (
          <>
            {posting.live && <p className={s.note}>This job has no saved copy of the posting, so this text comes from the posting page now and may be cut off.</p>}
            <div className={s.posting}>{posting.text}</div>
          </>
        ) : (
          <p className={s.note}>No posting text saved. Open the application link to read it.</p>
        )}
      </section>

      <section className={s.card}>
        <h2>
          Keyword match <span className={s.count}>{match.percent}%</span>
        </h2>
        <p className={s.note}>
          Posting keywords checked against {match.resume.source === "version" ? `your saved resume version "${match.resume.label}" for this job` : "your base resume (no tailored version saved for this job)"}.
        </p>
        {match.covered.length + match.missing.length === 0 ? (
          <p className={s.note}>No known keywords found in the posting text.</p>
        ) : (
          <>
            <h3>Covered ({match.covered.length})</h3>
            <div className={s.chips}>
              {match.covered.map((k) => (
                <span key={k} className={`${s.chip} ${s.covered}`}>
                  {k}
                </span>
              ))}
            </div>
            <h3>Missing ({match.missing.length})</h3>
            <div className={s.chips}>
              {match.missing.map((k) => (
                <span key={k} className={`${s.chip} ${s.missing}`}>
                  {k}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className={s.card}>
        <h2>Apply kit</h2>
        <KitRows rows={kitProfile} />
        {summary && (
          <>
            <h3>Summary for the {track.label || track.key} track</h3>
            <div className={s.kv}>
              <Row label="Summary" value={summary} />
            </div>
          </>
        )}
        {kitAnswers.length > 0 && (
          <>
            <h3>Answers</h3>
            <KitRows rows={kitAnswers} />
          </>
        )}
        <div className={s.row}>
          <a className={s.ghost} href={`/api/resume?cv=${encodeURIComponent(track.key || "")}`}>
            Download resume PDF
          </a>
        </div>
      </section>

      <Requirements id={id} eligibility={job.Eligibility} aiAvailable={aiAvailable} />
      <Writing id={id} drafts={drafts} aiAvailable={aiAvailable} />
      <Outreach jobId={id} job={job} initialContacts={contacts} linkedin={linkedin} domain={domain} outreach={outreach} aiAvailable={aiAvailable} />
    </main>
  );
}
