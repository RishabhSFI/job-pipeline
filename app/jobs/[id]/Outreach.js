"use client";

import { useState } from "react";
import s from "../jobs.module.css";
import { api, CopyButton } from "./ui.js";
import { guessEmails, gmailComposeUrl, mailtoUrl, isFollowUpDue, CONTACT_STATUS, RELATIONSHIPS, NOTE_LIMIT } from "../../../lib/outreachCore.js";

const BLANK = { name: "", title: "", relationship: "Recruiter", email: "", emailIsGuess: false, linkedinUrl: "", notes: "" };

function Guesses({ name, domain, onPick }) {
  const [d, setD] = useState(domain || "");
  const list = guessEmails(name, d);
  return (
    <div>
      <div className={s.row}>
        <span className={s.note}>Company email domain</span>
        <input className={s.input} style={{ maxWidth: 200 }} value={d} onChange={(e) => setD(e.target.value)} placeholder="company.com" />
      </div>
      {list.length > 0 && (
        <>
          <p className={s.warn}>These are guesses from common email formats. Check one before you send to it.</p>
          <div className={s.guess}>
            {list.map((g) => (
              <button key={g.email} type="button" className={s.ghost} onClick={() => onPick(g.email)} title={g.pattern}>
                Use {g.email}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SendDialog({ contact, draft, kind, outreach, onClose, onSent }) {
  const [subject, setSubject] = useState(draft.subject || "");
  const [body, setBody] = useState(draft.body || "");
  const [guessOk, setGuessOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const left = outreach.cap - outreach.usedToday;

  async function send() {
    setBusy(true);
    const r = await api(`/api/outreach/${contact.id}/send`, "POST", { subject, body, kind, confirmed: true, confirmGuess: guessOk });
    setBusy(false);
    if (r.ok) onSent(r.contact);
    else setErr(r.error);
  }
  return (
    <div className={s.overlay} role="dialog" aria-modal="true">
      <div className={s.dialog}>
        <h2 style={{ marginTop: 0 }}>Send this email?</h2>
        <p className={s.note}>It goes out from your Gmail right away, to this one person. {left} of {outreach.cap} sends left today.</p>
        <p><b>To:</b> {contact.name} &lt;{contact.email}&gt;</p>
        {contact.emailIsGuess && (
          <p className={s.warn}>
            <label>
              <input type="checkbox" checked={guessOk} onChange={(e) => setGuessOk(e.target.checked)} /> This address is an unverified guess. I want to send to it anyway.
            </label>
          </p>
        )}
        <input className={s.input} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
        <textarea className={s.textarea} style={{ marginTop: 8 }} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Body" />
        {err && <p className={s.error}>{err}</p>}
        <div className={s.row}>
          <button className={s.btn} disabled={busy || (contact.emailIsGuess && !guessOk)} onClick={send}>
            {busy ? "Sending…" : "Send now"}
          </button>
          <button className={s.ghost} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailBlock({ contact, field, kind, title, draftLabel, outreach, patch, ai, canDraft }) {
  const draft = contact[field] || { subject: "", body: "" };
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState(false);
  const noEmail = !contact.email;
  const url = { to: contact.email || "", subject: d.subject, body: d.body };

  async function generate() {
    setBusy(true);
    setErr("");
    const r = await api(`/api/outreach/${contact.id}/draft`, "POST", { kind });
    setBusy(false);
    if (r.ok) {
      setD(r.contact[field]);
      patch(r.contact);
    } else setErr(r.error);
  }
  const save = () => api(`/api/outreach/${contact.id}`, "PATCH", { [field]: d }).then((r) => r.success && patch(r.contact));

  return (
    <div>
      <h3>{title}</h3>
      <div className={s.row} style={{ marginTop: 0 }}>
        <button className={s.ghost} disabled={busy || !canDraft} onClick={generate}>
          {busy ? "Writing…" : d.body ? "Regenerate" : draftLabel}
        </button>
        {!ai && <span className={s.note}>AI needs a Gemini key (aistudio.google.com).</span>}
      </div>
      {err && <p className={s.error}>{err}</p>}
      {(d.body || d.subject) && (
        <>
          <input className={s.input} style={{ marginTop: 8 }} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} onBlur={save} placeholder="Subject" />
          <textarea className={s.textarea} style={{ marginTop: 8, minHeight: 130 }} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} onBlur={save} />
          <div className={s.row}>
            <CopyButton text={`${d.subject}\n\n${d.body}`} />
            <a className={s.ghost} href={gmailComposeUrl(url)} target="_blank" rel="noreferrer" aria-disabled={noEmail}>
              Open in Gmail
            </a>
            <a className={s.ghost} href={mailtoUrl(url)}>
              Open in mail app
            </a>
            <button className={s.btn} disabled={!outreach.smtp.configured || noEmail || !d.body} onClick={() => setDialog(true)}>
              Send…
            </button>
          </div>
          {!outreach.smtp.configured && <p className={s.note}>Sending is off. {outreach.smtp.reason}</p>}
          {outreach.smtp.configured && noEmail && <p className={s.note}>Add an email address to send.</p>}
        </>
      )}
      {dialog && (
        <SendDialog
          contact={contact}
          draft={d}
          kind={kind === "followup" ? "followup" : "email"}
          outreach={outreach}
          onClose={() => setDialog(false)}
          onSent={(c) => {
            setDialog(false);
            patch(c);
          }}
        />
      )}
    </div>
  );
}

export function ContactCard({ initial, domain, outreach, ai, onChange, onDelete }) {
  const [c, setC] = useState(initial);
  const [note, setNote] = useState(initial.noteDraft || "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showGuess, setShowGuess] = useState(false);
  const patch = (next) => {
    setC(next);
    onChange?.(next);
  };
  const save = async (fields) => {
    const r = await api(`/api/outreach/${c.id}`, "PATCH", fields);
    if (r.success) patch(r.contact);
    else setErr(r.error);
  };
  const field = (key, placeholder) => (
    <input key={`${key}:${c[key] || ""}`} className={s.input} defaultValue={c[key] || ""} placeholder={placeholder} onBlur={(e) => e.target.value !== (c[key] || "") && save({ [key]: e.target.value })} />
  );

  async function draftNote() {
    setNoteBusy(true);
    setErr("");
    const r = await api(`/api/outreach/${c.id}/draft`, "POST", { kind: "note" });
    setNoteBusy(false);
    if (r.ok) {
      setNote(r.contact.noteDraft);
      patch(r.contact);
    } else setErr(r.error);
  }

  return (
    <div className={s.contact}>
      <div className={s.contactHead}>
        <strong>{c.name}</strong>
        <span className={s.note}>
          {c.relationship}
          {c.title ? `, ${c.title}` : ""}
        </span>
      </div>
      <div className={s.form}>
        {field("title", "Their title")}
        <select className={s.select} value={c.relationship || "Other"} onChange={(e) => save({ relationship: e.target.value })}>
          {RELATIONSHIPS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div>
          {field("email", "Email")}
          {c.emailIsGuess && c.email && <p className={s.warn}>This address is a guess. Check it before you send.</p>}
        </div>
        {field("linkedinUrl", "LinkedIn URL")}
        <div className={s.wide}>{field("notes", "Notes (how you know them, what you have in common)")}</div>
      </div>
      <div className={s.row}>
        <button className={s.ghost} onClick={() => setShowGuess(!showGuess)}>
          {showGuess ? "Hide email helper" : "Guess their email"}
        </button>
        {c.linkedinUrl && (
          <a className={s.ghost} href={c.linkedinUrl} target="_blank" rel="noreferrer">
            Open LinkedIn
          </a>
        )}
      </div>
      {showGuess && <Guesses name={c.name} domain={domain} onPick={(email) => save({ email, emailIsGuess: true })} />}

      <EmailBlock contact={c} field="emailDraft" kind="email" title="Email" draftLabel="Draft email" outreach={outreach} patch={patch} ai={ai} canDraft />

      <h3>LinkedIn connection note</h3>
      <div className={s.row} style={{ marginTop: 0 }}>
        <button className={s.ghost} disabled={noteBusy} onClick={draftNote}>
          {noteBusy ? "Writing…" : note ? "Regenerate" : "Draft note"}
        </button>
      </div>
      {note && (
        <>
          <textarea
            className={s.textarea}
            style={{ marginTop: 8, minHeight: 80 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save({ noteDraft: note })}
          />
          <div className={s.row}>
            <CopyButton text={note} />
            <span className={note.length > NOTE_LIMIT ? s.error : s.note}>
              {note.length}/{NOTE_LIMIT}
            </span>
          </div>
        </>
      )}

      {c.status === "Sent" && (
        <EmailBlock contact={c} field="followUpDraft" kind="followup" title="Follow-up" draftLabel="Draft follow-up" outreach={outreach} patch={patch} ai={ai} canDraft={!!c.lastEmail} />
      )}

      {err && <p className={s.error}>{err}</p>}
      <div className={s.row}>
        <label className={s.note}>
          Status{" "}
          <select className={s.select} style={{ width: "auto" }} value={c.status} onChange={(e) => save({ status: e.target.value })}>
            {CONTACT_STATUS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {c.sentAt && <span className={s.note}>Sent {c.sentAt.slice(0, 10)}</span>}
        {c.followUpDate && c.status === "Sent" && (
          <span className={isFollowUpDue(c) ? s.due : s.note}>
            Follow up {c.followUpDate}
            {isFollowUpDue(c) ? " (due)" : ""}
          </span>
        )}
        <button
          className={`${s.ghost} ${s.danger}`}
          onClick={async () => {
            if (!confirm(`Remove ${c.name}?`)) return;
            const r = await api(`/api/outreach/${c.id}`, "DELETE");
            if (r.success) onDelete?.(c.id);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function Outreach({ jobId, job, initialContacts, linkedin, domain, outreach, aiAvailable }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add() {
    const r = await api("/api/outreach", "POST", { ...form, jobId, company: job.Company, jobTitle: job["Role Title"] });
    if (!r.success) return setErr(r.error);
    setContacts([...contacts, r.contact]);
    setForm(BLANK);
    setOpen(false);
    setErr("");
  }

  return (
    <section className={s.card}>
      <h2>Outreach</h2>
      <p className={s.note}>People who can help you get this role. Find them on LinkedIn, add them here, then draft a short note. The app sends nothing until you confirm. {outreach.usedToday} of {outreach.cap} sends used today.</p>
      <div className={s.links}>
        {linkedin.map((l) => (
          <a key={l.label} className={s.ghost} href={l.url} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        ))}
      </div>

      {contacts.map((c) => (
        <ContactCard
          key={c.id}
          initial={c}
          domain={domain?.domain}
          outreach={outreach}
          ai={aiAvailable}
          onChange={(n) => setContacts((cs) => cs.map((x) => (x.id === n.id ? n : x)))}
          onDelete={(id) => setContacts((cs) => cs.filter((x) => x.id !== id))}
        />
      ))}

      <div className={s.row}>
        <button className={s.btn} onClick={() => setOpen(!open)}>
          {open ? "Close" : "Add a contact"}
        </button>
      </div>
      {open && (
        <div>
          <div className={s.form}>
            <input className={s.input} placeholder="Name" value={form.name} onChange={set("name")} />
            <input className={s.input} placeholder="Their title" value={form.title} onChange={set("title")} />
            <select className={s.select} value={form.relationship} onChange={set("relationship")}>
              {RELATIONSHIPS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input className={s.input} placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value, emailIsGuess: false })} />
            <input className={s.input} placeholder="LinkedIn URL (optional)" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
            <input className={s.input} placeholder="Notes" value={form.notes} onChange={set("notes")} />
          </div>
          {form.name && (
            <Guesses name={form.name} domain={domain?.domain} onPick={(email) => setForm({ ...form, email, emailIsGuess: true })} />
          )}
          {domain?.domain && domain.source.includes("guess") && <p className={s.note}>The app guessed this domain from the company name. Fix it if it's wrong.</p>}
          {form.emailIsGuess && <p className={s.warn}>This email is a guess. Check it before you send.</p>}
          {err && <p className={s.error}>{err}</p>}
          <div className={s.row}>
            <button className={s.btn} disabled={!form.name.trim()} onClick={add}>
              Save contact
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
