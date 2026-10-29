"use client";

import { useEffect, useState } from "react";
import s from "../jobs.module.css";
import { api } from "./ui.js";
import EligibilityTag from "../../EligibilityTag.js";

const MARK = { meets: "✓", missing: "✕", unclear: "?" };
const COLOR = { meets: "var(--status-applied)", missing: "var(--status-rejected)", unclear: "var(--status-manual)" };

// "Can I take this job?": the automatic eligibility verdict, plus an AI read
// of every requirement in the posting against your facts and resume.
export default function Requirements({ id, eligibility, aiAvailable }) {
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/jobs/${id}/requirements`).then((r) => r.check && setCheck(r.check));
  }, [id]);

  async function run() {
    setBusy(true);
    setError("");
    const r = await api(`/api/jobs/${id}/requirements`, "POST");
    setBusy(false);
    if (r.ok) setCheck(r.check);
    else setError(r.error || "The check didn't work. Try again.");
  }

  return (
    <section className={s.card}>
      <h2>Can you take this job?</h2>
      {eligibility ? (
        <p className={s.note}>
          <EligibilityTag text={eligibility} full />
        </p>
      ) : (
        <p className={s.note}>Nothing in this posting conflicts with your eligibility facts.</p>
      )}
      <p className={s.note}>
        The automatic check reads work authorization, graduation, degree, experience, languages and
        certifications. The AI check reads every requirement in the posting against your resume.
      </p>
      <button className={s.ghost} disabled={busy || !aiAvailable} onClick={run}>
        {busy ? "Checking…" : check ? "Check again with AI" : "Check requirements with AI"}
      </button>
      {!aiAvailable && <p className={s.note}>Add a free Gemini key (npm run setup) to use the AI check.</p>}
      {error && <p className={s.note} style={{ color: "var(--status-rejected)" }}>{error}</p>}
      {check && (
        <div style={{ marginTop: 12 }}>
          <p>
            <b style={{ textTransform: "capitalize" }}>{check.verdict}.</b> {check.summary}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {check.requirements.map((r, i) => (
              <li key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <span aria-label={r.status} style={{ color: COLOR[r.status], fontWeight: 700, width: 14 }}>
                  {MARK[r.status]}
                </span>
                <span>
                  <b>{r.requirement}</b>
                  {!r.mustHave && <span className={s.note}> (nice to have)</span>}
                  <br />
                  <span className={s.note}>{r.why}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={s.note}>Checked {new Date(check.checkedAt).toLocaleString()}. The AI can misread a posting, so read it too.</p>
        </div>
      )}
    </section>
  );
}
