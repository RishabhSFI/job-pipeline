"use client";

import { useState } from "react";
import s from "../jobs.module.css";
import { api, CopyButton } from "./ui.js";

const KINDS = [
  { key: "cover", title: "Cover letter", button: "Draft cover letter" },
  { key: "why", title: "Why do you want to work here?", button: "Draft an answer" },
];

function Draft({ id, kind, initial }) {
  const [text, setText] = useState(initial?.text || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(true);

  async function generate() {
    if (text && !saved && !confirm("Replace your edits with a new draft?")) return;
    setBusy(true);
    setErr("");
    const r = await api(`/api/jobs/${id}/write`, "POST", { kind: kind.key });
    setBusy(false);
    if (r.ok) {
      setText(r.text);
      setSaved(true);
    } else setErr(r.error || "The draft failed. Try again.");
  }
  async function save() {
    const r = await api(`/api/jobs/${id}/drafts`, "PUT", { [kind.key]: text });
    if (r.success) setSaved(true);
    else setErr(r.error);
  }

  return (
    <div>
      <h3>{kind.title}</h3>
      <div className={s.row} style={{ marginTop: 0 }}>
        <button className={s.btn} disabled={busy} onClick={generate}>
          {busy ? "Writing…" : text ? "Regenerate" : kind.button}
        </button>
        <CopyButton text={text} />
        {!saved && (
          <button className={s.ghost} onClick={save}>
            Save edits
          </button>
        )}
      </div>
      {err && <p className={s.error}>{err}</p>}
      {(text || busy) && (
        <textarea
          className={s.textarea}
          style={{ marginTop: 8 }}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
      )}
    </div>
  );
}

export default function Writing({ id, drafts, aiAvailable }) {
  return (
    <section className={s.card}>
      <h2>AI writing</h2>
      <p className={s.note}>
        Drafts use this posting, your resume and your apply kit, and only use facts from them. Each click uses one of your free Gemini requests.
        {!aiAvailable && (
          <>
            {" "}
            AI isn&apos;t set up yet. Get a free key at{" "}
            <a href="https://aistudio.google.com" target="_blank" rel="noreferrer">
              aistudio.google.com
            </a>{" "}
            and add GEMINI_API_KEY to .env.local.
          </>
        )}
      </p>
      {KINDS.map((k) => (
        <Draft key={k.key} id={id} kind={k} initial={drafts?.[k.key]} />
      ))}
    </section>
  );
}
