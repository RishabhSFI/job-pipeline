// studio.js
// Pure logic behind Resume Studio (/studio): edits to a tailored copy of the
// base resume, track presets, which pieces differ from the base, the one-page
// check and the keyword helpers. No file access, so the page and the tests
// both use it. Resume shape: see lib/resumeModel.js (bullet.hidden and
// bullet.wordings are the Studio's).

import { orderForTrack } from "./resumeModel.js";

// A preset keeps at least this many bullets per entry, topping up with the
// best remaining ones, so no job is left bare.
export const MIN_BULLETS = 2;

// The resume as it prints: hidden entries and hidden bullets dropped.
export function visibleResume(resume) {
  return {
    ...resume,
    sections: (resume.sections || []).map((s) =>
      s.kind === "skills"
        ? s
        : {
            ...s,
            entries: (s.entries || [])
              .filter((e) => !e.hidden)
              .map((e) => ({ ...e, bullets: (e.bullets || []).filter((b) => !b.hidden) })),
          },
    ),
  };
}

const fitsTrack = (bullet, track) => !bullet.tracks?.length || bullet.tracks.includes(track);

// The base resume tailored to a track: each entry's bullets ordered for it,
// suited ones on, the rest off (keeping MIN_BULLETS per entry).
export function applyTrack(base, track) {
  return {
    ...base,
    sections: base.sections.map((s) =>
      s.kind === "skills"
        ? s
        : {
            ...s,
            entries: s.entries.map((e) => {
              const ordered = orderForTrack(e.bullets || [], track);
              const keep = Math.max(MIN_BULLETS, ordered.filter((b) => fitsTrack(b, track)).length);
              return { ...e, bullets: ordered.map((b, i) => ({ ...b, hidden: i >= keep })) };
            }),
          },
    ),
  };
}

// Keys of the pieces that differ from the base:
//   "entry:<entryId>"              shown/hidden changed, or bullets added, removed or reordered
//   "bullet:<entryId>/<bulletId>"  new, reworded, or switched on/off
//   "group:<groupId>"              skills added or removed
export function changedKeys(base, resume) {
  const keys = new Set();
  const baseEntries = new Map();
  const baseGroups = new Map();
  for (const s of base.sections) {
    for (const e of s.entries || []) baseEntries.set(e.id, e);
    for (const g of s.groups || []) baseGroups.set(g.id, g);
  }
  for (const s of resume.sections) {
    for (const g of s.groups || []) {
      const was = baseGroups.get(g.id);
      if (!was || was.items.join("\n") !== g.items.join("\n")) keys.add(`group:${g.id}`);
    }
    for (const e of s.entries || []) {
      const was = baseEntries.get(e.id);
      const ids = (list) => list.map((b) => b.id).join("\n");
      if (!was || !!was.hidden !== !!e.hidden || ids(was.bullets) !== ids(e.bullets)) keys.add(`entry:${e.id}`);
      const wasBullets = new Map((was?.bullets || []).map((b) => [b.id, b]));
      for (const b of e.bullets) {
        const old = wasBullets.get(b.id);
        if (!old || old.text !== b.text || !!old.hidden !== !!b.hidden) keys.add(`bullet:${e.id}/${b.id}`);
      }
    }
  }
  return keys;
}

// Edits to the working resume, one pure function per action type.
// Every action names its place: sectionId, entryId, bulletId or groupId.
const mapSections = (resume, fn) => ({ ...resume, sections: resume.sections.map(fn) });

const mapEntry = (resume, { sectionId, entryId }, fn) =>
  mapSections(resume, (s) =>
    s.id !== sectionId ? s : { ...s, entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)) },
  );

const mapBullets = (resume, a, fn) => mapEntry(resume, a, (e) => ({ ...e, bullets: fn(e.bullets, e) }));

const mapBullet = (resume, a, fn) =>
  mapBullets(resume, a, (bullets) => bullets.map((b) => (b.id === a.bulletId ? fn(b) : b)));

const mapGroup = (resume, { groupId }, fn) =>
  mapSections(resume, (s) =>
    s.kind !== "skills" ? s : { ...s, groups: s.groups.map((g) => (g.id === groupId ? fn(g) : g)) },
  );

function move(list, id, by) {
  const from = list.findIndex((x) => x.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function newBulletId(entry) {
  const taken = new Set(entry.bullets.map((b) => b.id));
  let n = entry.bullets.length + 1;
  while (taken.has(`${entry.id}-new-${n}`)) n++;
  return `${entry.id}-new-${n}`;
}

function newWordingId(wordings) {
  const taken = new Set(wordings.map((w) => w.id));
  let n = wordings.length + 1;
  while (taken.has(`w${n}`)) n++;
  return `w${n}`;
}

// Which saved wording a bullet uses: a wording id, "base" for the base
// resume's text, or "" when the text is edited and matches none.
export function wordingInUse(bullet, baseText) {
  const saved = (bullet.wordings || []).find((w) => w.text === bullet.text);
  if (saved) return saved.id;
  return bullet.text === baseText ? "base" : "";
}

const EDITS = {
  toggleEntry: (r, a) => mapEntry(r, a, (e) => ({ ...e, hidden: !e.hidden })),
  toggleBullet: (r, a) => mapBullet(r, a, (b) => ({ ...b, hidden: !b.hidden })),
  editBullet: (r, a) => mapBullet(r, a, (b) => ({ ...b, text: a.text })),
  moveBullet: (r, a) => mapBullets(r, a, (bullets) => move(bullets, a.bulletId, a.by)),
  removeBullet: (r, a) => mapBullets(r, a, (bullets) => bullets.filter((b) => b.id !== a.bulletId)),
  addBullet: (r, a) =>
    mapBullets(r, a, (bullets, e) => [...bullets, { id: newBulletId(e), text: a.text || "", tracks: [] }]),
  // a.wording: { label, text }. Saved alternatives never change the text in use.
  addWording: (r, a) =>
    mapBullet(r, a, (b) => {
      const wordings = b.wordings || [];
      const text = String(a.wording.text || "").trim();
      if (!text || wordings.some((w) => w.text === text)) return b;
      const label = String(a.wording.label || "").trim() || `Wording ${wordings.length + 1}`;
      return { ...b, wordings: [...wordings, { id: newWordingId(wordings), label, text }] };
    }),
  chooseWording: (r, a) =>
    mapBullet(r, a, (b) => {
      const w = (b.wordings || []).find((x) => x.id === a.wordingId);
      return w ? { ...b, text: w.text } : b;
    }),
  removeWording: (r, a) =>
    mapBullet(r, a, ({ wordings = [], ...b }) => {
      const kept = wordings.filter((w) => w.id !== a.wordingId);
      return kept.length ? { ...b, wordings: kept } : b;
    }),
  removeSkill: (r, a) => mapGroup(r, a, (g) => ({ ...g, items: g.items.filter((i) => i !== a.item) })),
  addSkill: (r, a) => {
    const item = String(a.item || "").trim();
    const groupId = a.groupId || r.sections.find((s) => s.kind === "skills")?.groups[0]?.id;
    return mapGroup(r, { groupId }, (g) =>
      !item || g.items.some((i) => i.toLowerCase() === item.toLowerCase()) ? g : { ...g, items: [...g.items, item] },
    );
  },
};

export function editResume(resume, action) {
  const edit = EDITS[action.type];
  if (!edit) throw new Error(`Unknown edit: ${action.type}`);
  return edit(resume, action);
}

// Lines past the page end, from measured heights in the same units.
// A pixel or two of rounding still counts as fitting.
export function pageFit({ contentHeight, pageHeight, lineHeight }) {
  const over = contentHeight - pageHeight;
  if (over <= 2) return { fits: true, linesOver: 0 };
  return { fits: false, linesOver: Math.max(1, Math.ceil(over / lineHeight)) };
}

// Keywords that read as skills and can go in the Skills section: the terms
// in config/keywords.json and the profile's skills, minus the tracks'
// softer skillKeywords ("scrappy", "founders").
export function skillTerms(profile, keywordsConfig) {
  const soft = new Set(Object.values(profile?.tracks || {}).flatMap((t) => t.skillKeywords || []).map((w) => w.toLowerCase()));
  return new Set(
    [...(keywordsConfig?.terms || []), ...(profile?.skills || [])].map((w) => w.toLowerCase()).filter((w) => !soft.has(w)),
  );
}

// Keyword (always lowercase) as a skill chip: "power bi" -> "Power BI",
// "kpis" -> "KPIs", "rlhf" -> "RLHF", "a/b testing" -> "A/B Testing".
export function displayTerm(term) {
  const word = (w) => {
    if (w.length === 4 && w.endsWith("s")) return w.slice(0, 3).toUpperCase() + "s";
    if (w.length <= 3 || /[&/]/.test(w) || !/[aeiouy]/.test(w)) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1);
  };
  return String(term).split(" ").map(word).join(" ");
}

// Default name for a saved version: "Company - Role".
export function versionName(job) {
  return [job?.Company, job?.["Role Title"]].filter(Boolean).join(" - ");
}

// Whether data sent to the server has the resume shape, so a bad request
// can never overwrite data/resume.json with something the page can't read.
export function isResume(r) {
  const strings = (list) => Array.isArray(list) && list.every((x) => typeof x === "string");
  const entry = (e) =>
    e && typeof e.id === "string" && Array.isArray(e.bullets) && e.bullets.every((b) => b && typeof b.id === "string" && typeof b.text === "string");
  const section = (s) =>
    s &&
    typeof s.id === "string" &&
    (s.kind === "skills"
      ? Array.isArray(s.groups) && s.groups.every((g) => g && typeof g.id === "string" && strings(g.items))
      : Array.isArray(s.entries) && s.entries.every(entry));
  return !!r && typeof r.name === "string" && Array.isArray(r.sections) && r.sections.every(section);
}

// Where a job's unsaved Studio work is autosaved: per job, else per saved
// version, else one shared "untitled" draft. Safe as a file name.
export function draftKey({ jobId, versionId }) {
  const raw = jobId ? `job-${jobId}` : versionId ? `version-${versionId}` : "untitled";
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "").slice(0, 80);
}
