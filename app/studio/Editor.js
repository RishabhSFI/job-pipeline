"use client";

// Middle column of Resume Studio: track presets, skills and every entry's
// bullets, all editing the working copy through editResume actions.

import { useLayoutEffect, useRef, useState } from "react";
import { displayTerm, wordingInUse } from "../../lib/studio.js";
import s from "./studio.module.css";

const Dot = ({ on }) =>
  on ? (
    <span className={s.dot} title="Changed from your base resume">
      ●
    </span>
  ) : null;

// Links in an error message become clickable (the Gemini key page).
export function Linkified({ text }) {
  return String(text)
    .split(/(https?:\/\/[^\s)]+[^\s).,])/)
    .map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noreferrer">
          {part}
        </a>
      ) : (
        part
      ),
    );
}

function AutoText({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function SkillGroup({ group, changed, suggestions, edit }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const add = (item) => {
    edit({ type: "addSkill", groupId: group.id, item });
    setDraft("");
  };
  return (
    <div className={s.group}>
      <div className={s.groupLabel}>
        {group.label} <Dot on={changed} />
      </div>
      <div className={s.chips}>
        {group.items.map((item) => (
          <span key={item} className={s.chip}>
            {item}
            <button className={s.chipX} onClick={() => edit({ type: "removeSkill", groupId: group.id, item })} aria-label={`Remove ${item}`}>
              ×
            </button>
          </span>
        ))}
        <button className={s.addChip} onClick={() => setAdding((a) => !a)}>
          + Add
        </button>
      </div>
      {adding && (
        <div className={s.addRow}>
          <input
            className={s.input}
            value={draft}
            placeholder="Type a skill and press Enter"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft.trim() && add(draft)}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className={s.suggest}>
              <span className={s.muted}>From the posting:</span>
              {suggestions.map((term) => (
                <button key={term} className={s.suggestChip} onClick={() => add(displayTerm(term))}>
                  + {displayTerm(term)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Wordings({ bullet, baseText, at, edit, onRemoveWording }) {
  const wordings = bullet.wordings || [];
  if (!wordings.length) return null;
  const inUse = wordingInUse(bullet, baseText);
  const choose = (id) =>
    id === "base" ? edit({ type: "editBullet", ...at, text: baseText }) : edit({ type: "chooseWording", ...at, wordingId: id });
  return (
    <div className={s.wordings}>
      <label className={s.muted}>
        Wording{" "}
        <select className={s.wordingSelect} value={inUse} onChange={(e) => e.target.value && choose(e.target.value)}>
          {inUse === "" && <option value="">Edited</option>}
          {baseText !== undefined && <option value="base">Base resume</option>}
          {wordings.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      {inUse && inUse !== "base" && (
        <button className={s.linkBtn} onClick={() => onRemoveWording(at, wordings.find((w) => w.id === inUse))}>
          Delete this wording
        </button>
      )}
    </div>
  );
}

function Bullet({ bullet, baseText, index, count, where, changed, edit, reword, onReword, onPick, onDismiss, onSaveWording, onRemoveWording }) {
  const at = { ...where, bulletId: bullet.id };
  const mine = reword?.bulletId === bullet.id && reword?.entryId === where.entryId ? reword : null;
  const saveWording = (text, suggested) => {
    const label = prompt("Name this wording (for example the track or company it suits)", suggested);
    if (label !== null) onSaveWording(at, { label, text });
  };
  return (
    <li className={`${s.bullet} ${bullet.hidden ? s.off : ""}`}>
      <div className={s.bulletTop}>
        <input
          type="checkbox"
          checked={!bullet.hidden}
          onChange={() => edit({ type: "toggleBullet", ...at })}
          title="On resume"
          aria-label="Bullet on resume"
        />
        <AutoText className={s.bulletText} value={bullet.text} onChange={(text) => edit({ type: "editBullet", ...at, text })} />
        <Dot on={changed} />
      </div>
      <Wordings bullet={bullet} baseText={baseText} at={at} edit={edit} onRemoveWording={onRemoveWording} />
      <div className={s.bulletActions}>
        <button disabled={index === 0} onClick={() => edit({ type: "moveBullet", ...at, by: -1 })} aria-label="Move up">
          ↑
        </button>
        <button disabled={index === count - 1} onClick={() => edit({ type: "moveBullet", ...at, by: 1 })} aria-label="Move down">
          ↓
        </button>
        <button onClick={() => onReword(bullet)} disabled={mine?.loading || !bullet.text.trim()}>
          {mine?.loading ? "Rewording…" : "Reword"}
        </button>
        <button onClick={() => saveWording(bullet.text, `Wording ${(bullet.wordings?.length || 0) + 1}`)} disabled={!bullet.text.trim()}>
          Save wording
        </button>
        <button onClick={() => edit({ type: "removeBullet", ...at })}>Remove</button>
      </div>
      {mine && !mine.loading && (
        <div className={s.reword}>
          {mine.error ? (
            <p className={s.error}>
              <Linkified text={mine.error} />
            </p>
          ) : (
            <>
              <div className={s.muted}>Pick a rewrite, or keep yours.</div>
              {mine.options.map((opt) => (
                <div key={opt} className={s.option}>
                  <div>{opt}</div>
                  <div className={s.optionActions}>
                    <button className={s.linkBtn} onClick={() => onPick(at, opt)}>
                      Use this
                    </button>
                    <button className={s.linkBtn} onClick={() => saveWording(opt, "AI rewrite")}>
                      Keep as wording
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          <button className={s.linkBtn} onClick={onDismiss}>
            {mine.error ? "Close" : "Keep original"}
          </button>
        </div>
      )}
    </li>
  );
}

export default function Editor({ resume, baseTexts, onSaveWording, onRemoveWording, changed, tracks, track, onTrack, onReset, suggestions, edit, reword, onReword, onPick, onDismiss, onMakeBase }) {
  return (
    <div className={s.col}>
      <div className={s.card}>
        <div className={s.cardTitle}>Start from a track</div>
        <div className={s.presets}>
          {tracks.map((t) => (
            <button key={t.key} className={`${s.preset} ${track === t.key ? s.presetOn : ""}`} onClick={() => onTrack(t.key)}>
              {t.label}
            </button>
          ))}
          <button className={s.preset} onClick={onReset}>
            Base as is
          </button>
        </div>
        <p className={s.hint}>
          A preset starts from your base resume, not your current edits. It turns on the bullets tagged for that track,
          moves them to the top and turns the rest off. A <span className={s.dot}>●</span> marks each change
          {changed.size ? ` (${changed.size} now).` : "."}
        </p>
      </div>

      {resume.sections.map((sec) =>
        sec.kind === "skills" ? (
          <div className={s.card} key={sec.id}>
            <div className={s.cardTitle}>{sec.title}</div>
            {sec.groups.map((g) => (
              <SkillGroup
                key={g.id}
                group={g}
                changed={changed.has(`group:${g.id}`)}
                suggestions={suggestions.filter((t) => !g.items.some((i) => i.toLowerCase() === t))}
                edit={edit}
              />
            ))}
          </div>
        ) : (
          <div className={s.card} key={sec.id}>
            <div className={s.cardTitle}>{sec.title}</div>
            {sec.entries.map((e) => {
              const where = { sectionId: sec.id, entryId: e.id };
              return (
                <div key={e.id} className={`${s.entry} ${e.hidden ? s.off : ""}`}>
                  <div className={s.entryHead}>
                    <div>
                      <div className={s.entryOrg}>
                        {e.org} <Dot on={changed.has(`entry:${e.id}`)} />
                      </div>
                      <div className={s.muted}>
                        {[e.role, e.dates].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <label className={s.onResume}>
                      <input type="checkbox" checked={!e.hidden} onChange={() => edit({ type: "toggleEntry", ...where })} />
                      On resume
                    </label>
                  </div>
                  {!e.hidden && (
                    <>
                      <ul className={s.bullets}>
                        {e.bullets.map((b, i) => (
                          <Bullet
                            key={b.id}
                            bullet={b}
                            baseText={baseTexts.get(`${e.id}/${b.id}`)}
                            onSaveWording={onSaveWording}
                            onRemoveWording={onRemoveWording}
                            index={i}
                            count={e.bullets.length}
                            where={where}
                            changed={changed.has(`bullet:${e.id}/${b.id}`)}
                            edit={edit}
                            reword={reword}
                            onReword={(bullet) => onReword(e, bullet)}
                            onPick={onPick}
                            onDismiss={onDismiss}
                          />
                        ))}
                      </ul>
                      <button className={s.linkBtn} onClick={() => edit({ type: "addBullet", ...where })}>
                        + Add bullet
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ),
      )}
      <p className={s.hint}>
        Wrap words in **double asterisks** for bold.{" "}
        <button className={s.linkBtn} onClick={onMakeBase} disabled={!changed.size}>
          Make these edits my base resume
        </button>
      </p>
    </div>
  );
}
