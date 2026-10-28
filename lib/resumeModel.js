// resumeModel.js
// Pure helpers for the structured resume (data/resume.json). No file access,
// so the browser and the server both use them.
//
// Resume shape:
//   { name, contact: [{ text, url? }], sections: [Section] }
//   Section (kind "entries"): { id, title, kind, entries: [Entry] }
//   Section (kind "skills"):  { id, title, kind, groups: [{ id, label, items: [string] }] }
//   Entry: { id, org, location, role, dates, hidden?, bullets: [Bullet] }
//   Bullet: { id, text, tracks: [trackKey], hidden?, wordings?: [{ id, label, text }] }
// Bullet text marks bold with **double asterisks**. text is the wording in
// use; wordings are optional saved alternatives (Resume Studio switches
// between them by copying one into text). hidden switches a bullet off.

// [{ text, bold }] runs for rendering "**bold** text".
export function boldRuns(text) {
  return String(text || "")
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export const plain = (text) => String(text || "").replace(/\*\*/g, "");

// Everything a recruiter or keyword scan would read, as one string.
export function resumeText(resume) {
  const parts = [resume?.name];
  for (const s of resume?.sections || []) {
    if (s.kind === "skills") {
      for (const g of s.groups || []) parts.push(g.label, ...(g.items || []));
    } else {
      for (const e of s.entries || []) {
        if (e.hidden) continue;
        parts.push(e.org, e.role, ...(e.bullets || []).map((b) => plain(b.text)));
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}

// Bullets suited to a track first, the rest after, order otherwise kept.
// Bullets with no tracks suit every track.
export function orderForTrack(bullets, track) {
  const fits = (b) => !b.tracks?.length || b.tracks.includes(track);
  return [...bullets.filter(fits), ...bullets.filter((b) => !fits(b))];
}
