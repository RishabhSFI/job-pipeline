// The resume as a printable US Letter page. Its styles are a plain string,
// not the CSS module, because "Download PDF" prints this same markup in an
// iframe with these same styles: the PDF is exactly the preview.

import { forwardRef } from "react";
import { boldRuns } from "../../lib/resumeModel.js";

// CSS pixels at 96 per inch.
export const PAGE_WIDTH_PX = 816;
export const PAGE_HEIGHT_PX = 1056;
export const MARGIN_Y_PX = 48;

export const RESUME_CSS = `
.rd-page { box-sizing: border-box; width: 8.5in; padding: 0.5in; background: #fff; color: #000;
  font-family: "Times New Roman", Times, "Liberation Serif", serif; font-size: 10pt; line-height: 1.17; text-align: left; }
.rd-page * { box-sizing: border-box; }
.rd-name { margin: 0; text-align: center; font-size: 24pt; font-weight: 700; line-height: 1.05; }
.rd-contact { margin: 2pt 0; text-align: center; }
.rd-contact a { color: inherit; text-decoration: none; }
.rd-sep { padding: 0 6pt; }
.rd-section { margin-top: 5pt; }
.rd-heading { margin: 0 0 3pt; padding-bottom: 1pt; border-bottom: 0.75pt solid #000; font-size: 12pt; font-weight: 400;
  font-variant: small-caps; letter-spacing: 0.03em; line-height: 1.15; }
.rd-entry { margin-bottom: 3pt; }
.rd-row { display: flex; justify-content: space-between; gap: 12pt; }
.rd-org { font-weight: 700; }
.rd-role { font-style: italic; }
.rd-right { flex-shrink: 0; text-align: right; }
.rd-bullets { margin: 1pt 0 0; padding-left: 14pt; }
.rd-bullets li { margin: 0; padding-left: 2pt; }
.rd-group { margin: 0 0 1pt; }
`;

const Runs = ({ text }) =>
  boldRuns(text).map((r, i) => (r.bold ? <b key={i}>{r.text}</b> : <span key={i}>{r.text}</span>));

function Entry({ entry }) {
  return (
    <div className="rd-entry">
      <div className="rd-row">
        <span className="rd-org">{entry.org}</span>
        <span className="rd-right">{entry.location}</span>
      </div>
      {(entry.role || entry.dates) && (
        <div className="rd-row">
          <span className="rd-role">{entry.role}</span>
          <span className="rd-right rd-role">{entry.dates}</span>
        </div>
      )}
      {entry.bullets.length > 0 && (
        <ul className="rd-bullets">
          {entry.bullets.map((b) => (
            <li key={b.id}>
              <Runs text={b.text} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// resume: already filtered with visibleResume(). contentRef: the block whose
// height is the page's content height.
const ResumeDoc = forwardRef(function ResumeDoc({ resume, contentRef }, pageRef) {
  return (
    <div className="rd-page" ref={pageRef}>
      <div ref={contentRef}>
        <h1 className="rd-name">{resume.name}</h1>
        <div className="rd-contact">
          {(resume.contact || []).map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="rd-sep">|</span>}
              {c.url ? <a href={c.url}>{c.text}</a> : c.text}
            </span>
          ))}
        </div>
        {resume.sections.map((s) => {
          const empty = s.kind === "skills" ? !s.groups.some((g) => g.items.length) : !s.entries.length;
          if (empty) return null;
          return (
            <section className="rd-section" key={s.id}>
              <h2 className="rd-heading">{s.title}</h2>
              {s.kind === "skills"
                ? s.groups
                    .filter((g) => g.items.length)
                    .map((g) => (
                      <div className="rd-group" key={g.id}>
                        <b>{g.label}:</b> {g.items.join(", ")}
                      </div>
                    ))
                : s.entries.map((e) => <Entry key={e.id} entry={e} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
});

export default ResumeDoc;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The standalone HTML that prints: one US Letter page, no browser margins.
export function printableHtml(pageEl, title) {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>${RESUME_CSS}@page { size: letter; margin: 0; } html, body { margin: 0; background: #fff; }</style>` +
    `</head><body>${pageEl.outerHTML}</body></html>`
  );
}

// Opens the print dialog for the resume page alone, so "Save as PDF" gives a
// text PDF identical to the preview. The page title becomes the file name.
export function printResume(pageEl, title) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(printableHtml(pageEl, title));
  doc.close();
  const pageTitle = document.title;
  document.title = title;
  frame.contentWindow.focus();
  frame.contentWindow.print();
  document.title = pageTitle;
  setTimeout(() => frame.remove(), 1000);
}
