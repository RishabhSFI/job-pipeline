"use client";

// Resume Studio: tailor the base resume to one job, see it as the printed
// page, save it as a version and download it as a PDF.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resumeText } from "../../lib/resumeModel.js";
import { coverage, postingKeywords } from "../../lib/keywords.js";
import { applyTrack, changedKeys, displayTerm, draftKey, editResume, pageFit, versionName, visibleResume } from "../../lib/studio.js";
import ResumeDoc, { PAGE_HEIGHT_PX, PAGE_WIDTH_PX, MARGIN_Y_PX, RESUME_CSS, printResume } from "./ResumeDoc.js";
import Editor, { Linkified } from "./Editor.js";
import s from "./studio.module.css";

const POSTING_NOTE = {
  saved: "From the posting saved when this job was found.",
  fetched: "Read from the job page. Check it, or paste the posting instead.",
  none: "No saved text for this job. Paste the posting here.",
  loading: "Loading the posting…",
};

const findBullet = (resume, { sectionId, entryId, bulletId }) =>
  resume.sections.find((x) => x.id === sectionId)?.entries.find((e) => e.id === entryId)?.bullets.find((b) => b.id === bulletId);

async function api(url, options) {
  const res = await fetch(url, options && { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({ success: false, error: `Request failed (${res.status})` }));
  if (data.success === false) throw new Error(data.error || "Request failed");
  return data;
}

const send = (method, body) => ({ method, body: JSON.stringify(body) });

const AUTOSAVE_MS = 800;
const draftUrl = (key) => `/api/studio/drafts/${key}`;
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function Preview({ resume, onFit }) {
  const frameRef = useRef(null);
  const pageRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(PAGE_HEIGHT_PX);

  useLayoutEffect(() => {
    const el = frameRef.current;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / PAGE_WIDTH_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 17;
    setHeight(Math.max(PAGE_HEIGHT_PX, pageRef.current.offsetHeight));
    onFit({
      ...pageFit({ contentHeight: content.offsetHeight, pageHeight: PAGE_HEIGHT_PX - 2 * MARGIN_Y_PX, lineHeight }),
      page: pageRef.current,
    });
  }, [resume, onFit]);

  return (
    <div className={s.paperFrame} ref={frameRef} style={{ height: height * scale }}>
      <div className={s.paper} style={{ transform: `scale(${scale})` }}>
        <ResumeDoc resume={resume} ref={pageRef} contentRef={contentRef} />
        {height > PAGE_HEIGHT_PX && <div className={s.pageEnd} style={{ top: PAGE_HEIGHT_PX }} title="Page 1 ends here" />}
      </div>
    </div>
  );
}

export default function Studio() {
  const params = useSearchParams();
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [base, setBase] = useState(null);
  const [resume, setResume] = useState(null);
  const [track, setTrack] = useState("");
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsError, setJobsError] = useState("");
  const [jobId, setJobId] = useState("");
  const [savedAs, setSavedAs] = useState("");
  const [description, setDescription] = useState("");
  const [postingNote, setPostingNote] = useState("");
  const [fit, setFit] = useState(null);
  const [reword, setReword] = useState(null);
  const [notice, setNotice] = useState(null);
  // The resume as last loaded or saved; anything else is unsaved work.
  const [saved, setSaved] = useState(null);
  const [restored, setRestored] = useState(null);
  const postingRequest = useRef(0);
  const pendingDraft = useRef(null);
  // True while switching job or version, so autosave never writes one job's
  // work under another job's key.
  const [switching, setSwitching] = useState(false);

  const say = (text, kind = "ok") => setNotice({ text, kind });

  useEffect(() => {
    api("/api/studio")
      .then((data) => {
        setSetup(data);
        setBase(data.base);
        setResume(data.base);
        setSaved(data.base);
        setVersions(data.versions);
      })
      .catch((err) => setLoadError(err.message));
    api("/api/jobs")
      // The same posting can sit in the sheet twice; list each job once.
      .then((data) => setJobs([...new Map(data.jobs.map((j) => [j.id, j])).values()]))
      .catch((err) => setJobsError(err.message));
  }, []);

  const loadPosting = useCallback(async (job) => {
    const ticket = ++postingRequest.current;
    setDescription("");
    if (!job) return setPostingNote("");
    setPostingNote(POSTING_NOTE.loading);
    try {
      const data = await api(`/api/studio/posting?id=${encodeURIComponent(job.id)}&link=${encodeURIComponent(job.Link || "")}`);
      if (ticket !== postingRequest.current) return;
      setDescription(data.description);
      setPostingNote(POSTING_NOTE[data.source]);
    } catch {
      if (ticket === postingRequest.current) setPostingNote(POSTING_NOTE.none);
    }
  }, []);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const key = draftKey({ jobId, versionId });
  const dirty = !!saved && !!resume && JSON.stringify(resume) !== JSON.stringify(saved);

  // Sends the waiting autosave now (before switching jobs or leaving).
  const flushDraft = useCallback(() => {
    const p = pendingDraft.current;
    if (!p) return;
    pendingDraft.current = null;
    clearTimeout(p.timer);
    fetch(draftUrl(p.key), { method: "PUT", headers: { "Content-Type": "application/json" }, body: p.body, keepalive: true }).catch(() => {});
  }, []);

  const dropDraft = useCallback((k) => {
    if (pendingDraft.current) clearTimeout(pendingDraft.current.timer);
    pendingDraft.current = null;
    setRestored(null);
    return fetch(draftUrl(k), { method: "DELETE" }).catch(() => {});
  }, []);

  // Autosave shortly after each change while there is unsaved work.
  useEffect(() => {
    if (!dirty || switching) return;
    if (pendingDraft.current?.key && pendingDraft.current.key !== key) flushDraft();
    if (pendingDraft.current) clearTimeout(pendingDraft.current.timer);
    const body = JSON.stringify({ jobId, versionId, savedAs, track, description, resume });
    pendingDraft.current = { key, body, timer: setTimeout(flushDraft, AUTOSAVE_MS) };
  }, [dirty, switching, key, jobId, versionId, savedAs, track, description, resume, flushDraft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      flushDraft();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, flushDraft]);

  // The autosaved work for a job or version, put back if there is any
  // (and, when given, it passes accept).
  async function restoreDraft(k, accept = () => true) {
    const { draft } = await api(draftUrl(k)).catch(() => ({}));
    if (!draft || !accept(draft)) return null;
    setResume(draft.resume);
    setTrack(draft.track || "");
    setVersionId(draft.versionId || "");
    if (draft.savedAs) setSavedAs(draft.savedAs);
    if (draft.description) {
      postingRequest.current++;
      setDescription(draft.description);
      setPostingNote("");
    }
    setRestored({ key: k, savedAt: draft.savedAt });
    return draft;
  }

  // Switching to another job keeps the current edits unless that job has
  // its own unsaved work, which comes back instead.
  async function pickJob(id) {
    setSwitching(true);
    flushDraft();
    setRestored(null);
    const job = jobById.get(id);
    setJobId(id);
    setVersionId("");
    const draft = id ? await restoreDraft(draftKey({ jobId: id })) : null;
    if (!draft?.savedAs) setSavedAs(job ? versionName(job) : "");
    if (!draft?.description) loadPosting(job || (id && { id }));
    setSwitching(false);
  }

  async function discardDraft() {
    await dropDraft(restored?.key || key);
    setResume(saved);
    say("Discarded the unsaved work.");
  }

  // /studio?job=<id> preselects that job once the list arrives; with no job,
  // untitled unsaved work comes back.
  const wanted = params.get("job");
  const started = useRef(false);
  const jobsSettled = jobs.length > 0 || !!jobsError;
  useEffect(() => {
    if (started.current || !setup || (wanted && !jobsSettled)) return;
    started.current = true;
    if (wanted) pickJob(wanted);
    else restoreDraft(draftKey({}));
  });

  const edit = useCallback((action) => setResume((r) => editResume(r, action)), []);
  const changed = useMemo(() => (base && resume ? changedKeys(base, resume) : new Set()), [base, resume]);
  const shown = useMemo(() => resume && visibleResume(resume), [resume]);

  const keywords = useMemo(() => (setup ? postingKeywords(description, setup.vocab) : []), [description, setup]);
  const cov = useMemo(() => (shown ? coverage(resumeText(shown), keywords) : null), [shown, keywords]);
  const skillSet = useMemo(() => new Set(setup?.skillTerms || []), [setup]);
  const missingSkills = useMemo(() => (cov ? cov.missing.filter((k) => skillSet.has(k)) : []), [cov, skillSet]);
  const versionJobs = useMemo(() => new Set(versions.map((v) => v.jobId).filter(Boolean)), [versions]);
  const versionForJob = versions.find((v) => v.jobId && v.jobId === jobId && v.id !== versionId);

  const onFit = useCallback((f) => setFit(f), []);

  function chooseTrack(trackKey) {
    if (changed.size && !confirm("This track starts from your base resume and replaces your current edits. Continue?")) return;
    setTrack(trackKey);
    setResume(trackKey ? applyTrack(base, trackKey) : base);
  }

  async function loadVersion(id) {
    if (!id) return;
    setSwitching(true);
    try {
      flushDraft();
      setRestored(null);
      const { version } = await api(`/api/studio/versions/${encodeURIComponent(id)}`);
      setResume(version.resume);
      setSaved(version.resume);
      setTrack(version.track || "");
      setVersionId(version.id);
      setSavedAs(version.savedAs);
      setJobId(version.jobId || "");
      // Only unsaved work on this same version comes back: an explicit load
      // wins over other unsaved work for the job.
      const draft = await restoreDraft(draftKey({ jobId: version.jobId, versionId: version.id }), (d) => d.versionId === version.id);
      if (version.jobId && !draft?.description) loadPosting(jobById.get(version.jobId) || { id: version.jobId });
      if (!draft) say(`Loaded "${version.savedAs}".`);
    } catch (err) {
      say(err.message, "error");
    }
    setSwitching(false);
  }

  async function saveCurrent() {
    const name = (savedAs || prompt("Name this version", versionName(jobById.get(jobId)) || "") || "").trim();
    if (!name) return;
    try {
      const data = await api("/api/studio/versions", send("POST", { savedAs: name, jobId, track, resume }));
      await dropDraft(key);
      setSaved(resume);
      setVersions(data.versions);
      setVersionId(data.version.id);
      setSavedAs(data.version.savedAs);
      say(`Saved "${data.version.savedAs}".`);
    } catch (err) {
      say(err.message, "error");
    }
  }

  async function deleteCurrent() {
    const v = versions.find((x) => x.id === versionId);
    if (!v || !confirm(`Delete the saved version "${v.savedAs}"?`)) return;
    try {
      const data = await api(`/api/studio/versions/${encodeURIComponent(v.id)}`, { method: "DELETE" });
      setVersions(data.versions);
      setVersionId("");
      say(`Deleted "${v.savedAs}". Your edits are still here until you leave.`);
    } catch (err) {
      say(err.message, "error");
    }
  }

  async function makeBase() {
    if (!confirm("Replace your base resume with these edits? New versions and track presets start from it.")) return;
    try {
      const data = await api("/api/studio/base", send("PUT", { resume }));
      setBase(data.base);
      if (!versionId) {
        await dropDraft(key);
        setSaved(resume);
      }
      say("Saved as your base resume.");
    } catch (err) {
      say(err.message, "error");
    }
  }

  async function askReword(entry, bullet) {
    const job = jobById.get(jobId);
    setReword({ entryId: entry.id, bulletId: bullet.id, loading: true });
    try {
      const data = await api(
        "/api/studio/reword",
        send("POST", {
          text: bullet.text,
          entry: { org: entry.org, role: entry.role },
          resume: shown,
          keywords: cov.missing.length ? cov.missing : keywords,
          job: { title: job?.["Role Title"] || "", company: job?.Company || "" },
          description,
        }),
      );
      const result = data.ok ? { options: data.options } : { error: data.error };
      setReword((r) => (r?.bulletId === bullet.id ? { entryId: entry.id, bulletId: bullet.id, ...result } : r));
    } catch (err) {
      setReword({ entryId: entry.id, bulletId: bullet.id, error: err.message });
    }
  }

  const baseTexts = useMemo(() => {
    const texts = new Map();
    for (const sec of base?.sections || []) for (const e of sec.entries || []) for (const b of e.bullets) texts.set(`${e.id}/${b.id}`, b.text);
    return texts;
  }, [base]);

  // A wording is saved to this version and, when the bullet exists there,
  // to the base resume, so every later version can use it.
  async function saveWording(at, wording) {
    edit({ type: "addWording", ...at, wording });
    if (!baseTexts.has(`${at.entryId}/${at.bulletId}`)) {
      return say("Wording kept for this version. The bullet is new, so your base resume doesn't have it.");
    }
    try {
      const data = await api("/api/studio/base", send("PUT", { resume: editResume(base, { type: "addWording", ...at, wording }) }));
      setBase(data.base);
      say(`Saved the wording${wording.label ? ` "${wording.label}"` : ""} to your base resume.`);
    } catch (err) {
      say(err.message, "error");
    }
  }

  async function removeWording(at, wording) {
    if (!wording || !confirm(`Delete the wording "${wording.label}" from this version and your base resume?`)) return;
    const drop = (r) =>
      editResume(r, { type: "removeWording", ...at, wordingId: (findBullet(r, at)?.wordings || []).find((w) => w.text === wording.text)?.id });
    setResume(drop);
    try {
      const data = await api("/api/studio/base", send("PUT", { resume: drop(base) }));
      setBase(data.base);
    } catch (err) {
      say(err.message, "error");
    }
  }

  function download() {
    if (!fit?.page) return;
    if (!fit.fits && !confirm(`The resume runs about ${fit.linesOver} line${fit.linesOver > 1 ? "s" : ""} past one page. Download anyway?`)) return;
    printResume(fit.page, savedAs || setup.base.name || "Resume");
  }

  if (loadError) return <main className={s.wrap}><p className={s.error}>Couldn't load Resume Studio: {loadError}</p></main>;
  if (!setup || !resume) return <main className={s.wrap}><p className={s.muted}>Loading your resume…</p></main>;

  const currentVersion = versions.find((v) => v.id === versionId);

  return (
    <main className={s.wrap}>
      <style dangerouslySetInnerHTML={{ __html: RESUME_CSS }} />
      <header className={s.head}>
        <div>
          <h1 className={s.title}>Resume Studio</h1>
          <p className={s.muted}>
            {currentVersion ? `Editing "${currentVersion.savedAs}"` : "Tailor your base resume to one job."}
            {dirty ? " · Not saved as a version yet (kept as a draft)" : ""}
          </p>
        </div>
        <div className={s.headActions}>
          <select className={s.select} value="" onChange={(e) => loadVersion(e.target.value)} aria-label="Saved versions">
            <option value="">{versions.length ? "Saved versions…" : "No saved versions yet"}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.savedAs}
              </option>
            ))}
          </select>
          {currentVersion && (
            <button className={`${s.btn} ${s.danger}`} onClick={deleteCurrent}>
              Delete version
            </button>
          )}
          <button className={s.btn} onClick={saveCurrent}>
            Save version
          </button>
          <button className={`${s.btn} ${s.primary}`} onClick={download}>
            Download PDF
          </button>
        </div>
      </header>
      {restored && (
        <div className={s.draftNote} role="status">
          <span>Restored unsaved work from {when(restored.savedAt)}.</span>
          <button className={s.btn} onClick={discardDraft}>
            Discard
          </button>
        </div>
      )}
      {notice && (
        <div className={`${s.notice} ${notice.kind === "error" ? s.noticeError : ""}`} role="status">
          {notice.text}
          <button className={s.linkBtn} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className={s.grid}>
        <div className={s.col}>
          <div className={s.card}>
            <div className={s.cardTitle}>Job</div>
            <label className={s.label}>
              Saved job
              <select className={s.select} value={jobId} onChange={(e) => pickJob(e.target.value)}>
                <option value="">{jobsError ? "Couldn't load jobs" : jobs.length ? "Pick a job…" : "Loading jobs…"}</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {versionJobs.has(j.id) ? "✓ " : ""}
                    {versionName(j) || j.Link}
                  </option>
                ))}
              </select>
            </label>
            {jobsError && <p className={s.hint}>Jobs come from your sheet ({jobsError}). You can still paste a posting below.</p>}
            {versionForJob && (
              <p className={s.hint}>
                You saved "{versionForJob.savedAs}" for this job.{" "}
                <button className={s.linkBtn} onClick={() => loadVersion(versionForJob.id)}>
                  Load it
                </button>
              </p>
            )}
            <label className={s.label}>
              Saved as
              <input className={s.input} value={savedAs} placeholder="Company - Role" onChange={(e) => setSavedAs(e.target.value)} />
            </label>
            <label className={s.label}>
              Job description
              <textarea
                className={s.posting}
                value={description}
                placeholder="Paste the job posting here"
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {postingNote && <p className={s.hint}>{postingNote}</p>}
          </div>
        </div>

        <Editor
          resume={resume}
          baseTexts={baseTexts}
          onSaveWording={saveWording}
          onRemoveWording={removeWording}
          changed={changed}
          tracks={setup.tracks}
          track={track}
          onTrack={chooseTrack}
          onReset={() => chooseTrack("")}
          suggestions={missingSkills}
          edit={edit}
          reword={reword}
          onReword={askReword}
          onPick={(at, text) => {
            edit({ type: "editBullet", ...at, text });
            setReword(null);
          }}
          onDismiss={() => setReword(null)}
          onMakeBase={makeBase}
        />

        <div className={`${s.col} ${s.previewCol}`}>
          <div className={`${s.fit} ${fit && !fit.fits ? s.fitOver : ""}`}>
            {!fit ? "Measuring…" : fit.fits ? "Fits on one page" : `About ${fit.linesOver} line${fit.linesOver > 1 ? "s" : ""} over one page`}
          </div>
          <Preview resume={shown} onFit={onFit} />
          <div className={s.card}>
            <div className={s.cardTitle}>Keyword match</div>
            {!keywords.length ? (
              <p className={s.hint}>Pick a job or paste a posting to see which of its keywords your resume covers.</p>
            ) : (
              <>
                <div className={s.coverage}>
                  <span className={s.percent}>{cov.percent}%</span>
                  <span className={s.muted}>
                    {cov.covered.length} of {keywords.length} posting keywords on your resume
                  </span>
                </div>
                {cov.missing.length > 0 && (
                  <>
                    <div className={s.kwLabel}>Missing</div>
                    <div className={s.chips}>
                      {cov.missing.map((k) =>
                        skillSet.has(k) ? (
                          <button key={k} className={s.missingSkill} title="Add to Skills" onClick={() => edit({ type: "addSkill", item: displayTerm(k) })}>
                            + {k}
                          </button>
                        ) : (
                          <span key={k} className={s.missing}>
                            {k}
                          </span>
                        ),
                      )}
                    </div>
                    {missingSkills.length > 0 && <p className={s.hint}>Click a skill marked + to add it to your Skills.</p>}
                  </>
                )}
                {cov.covered.length > 0 && (
                  <>
                    <div className={s.kwLabel}>Covered</div>
                    <div className={s.chips}>
                      {cov.covered.map((k) => (
                        <span key={k} className={s.covered}>
                          {k}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {!setup.ai && (
              <p className={s.hint}>
                <Linkified text="Reword uses a free Gemini key. Get one at https://aistudio.google.com and add GEMINI_API_KEY to .env.local." />
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
