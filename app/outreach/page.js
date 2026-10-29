"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../jobs/jobs.module.css";
import { CONTACT_STATUS, isFollowUpDue } from "../../lib/outreachCore.js";

export default function OutreachPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await (await fetch("/api/outreach")).json());
    } catch {
      setError("Could not load contacts.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    await fetch(`/api/outreach/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }

  if (error) return <main className={s.wrap}><p className={s.error}>{error}</p></main>;
  if (!data) return <main className={s.wrap}><p className={s.note}>Loading…</p></main>;

  const { contacts, outreach } = data;
  const due = contacts.filter((c) => isFollowUpDue(c));
  return (
    <main className={s.wrap}>
      <h1 className={s.title}>Outreach</h1>
      <p className={s.sub}>
        {contacts.length} contacts. {outreach.usedToday} of {outreach.cap} emails sent today.
        {due.length > 0 && <span className={s.due}> {due.length} follow-up{due.length > 1 ? "s" : ""} due.</span>}
      </p>
      {contacts.length === 0 && (
        <p className={s.note}>
          No contacts yet. People you add from a job&apos;s Outreach section show up here, with when to follow up.{" "}
          <Link href="/">Pick a job</Link>
        </p>
      )}
      {CONTACT_STATUS.map((st) => {
        const list = contacts
          .filter((c) => c.status === st)
          .sort((a, b) => (isFollowUpDue(b) - isFollowUpDue(a)) || String(a.followUpDate || "9").localeCompare(String(b.followUpDate || "9")));
        if (!list.length) return null;
        return (
          <section key={st} className={`${s.card} ${s.group}`}>
            <h2>
              {st} <span className={s.count}>{list.length}</span>
            </h2>
            {list.map((c) => (
              <div key={c.id} className={s.listRow}>
                <div>
                  <strong>{c.name}</strong>
                  <span className={s.note}>
                    {" "}
                    {c.relationship}
                    {c.title ? `, ${c.title}` : ""}
                  </span>
                  <div className={s.note}>
                    <Link href={`/jobs/${c.jobId}`}>
                      {c.jobTitle || "Job"}
                      {c.company ? ` at ${c.company}` : ""}
                    </Link>
                    {c.sentAt && ` · sent ${c.sentAt.slice(0, 10)}`}
                  </div>
                  {c.status === "Sent" && c.followUpDate && (
                    <div className={isFollowUpDue(c) ? s.due : s.note}>
                      Follow up {c.followUpDate}
                      {isFollowUpDue(c) ? " (due)" : ""}
                    </div>
                  )}
                </div>
                <select className={s.select} style={{ width: "auto" }} value={c.status} onChange={(e) => setStatus(c.id, e.target.value)} aria-label={`Status for ${c.name}`}>
                  {CONTACT_STATUS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
