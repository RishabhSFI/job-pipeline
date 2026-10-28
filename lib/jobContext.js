// jobContext.js
// Everything the job page and the AI drafts need about one job, gathered on
// the server: the sheet row, posting text, the resume that applies, the
// keyword match and the apply kit.

import { getAllJobs } from "./sheets.js";
import { jobId } from "./jobId.js";
import { getPosting, fetchPostingText } from "./postings.js";
import { loadBaseResume, listVersions, getVersion } from "./resume.js";
import { resumeText } from "./resumeModel.js";
import { vocabulary, postingKeywords, coverage } from "./keywords.js";
import { loadApplyKit } from "./applyKit.js";
import { PROFILE } from "./profile.js";
import { loadJson } from "./loadJson.js";

export async function findJob(id) {
  const jobs = await getAllJobs();
  return jobs.find((j) => jobId(j.Link) === id) || null;
}

// Saved posting text, or the live page for jobs added before postings were saved.
export async function postingFor(id, link) {
  const saved = getPosting(id);
  if (saved?.description) return { ...saved, live: false };
  let description = "";
  try {
    description = link ? await fetchPostingText(link) : "";
  } catch {}
  return { ...(saved || {}), description, live: true };
}

// The tailored version saved for this job if there is one, else the base resume.
export function resumeFor(id) {
  const meta = listVersions().find((v) => v.jobId === id);
  const version = meta && getVersion(meta.id);
  if (version?.resume) return { resume: version.resume, source: "version", label: version.savedAs || meta.id };
  return { resume: loadBaseResume(), source: "base", label: "your base resume" };
}

export function keywordMatch(description, resume) {
  const vocab = vocabulary(PROFILE, loadJson(import.meta.url, "../config/keywords.json"));
  const keywords = postingKeywords(description, vocab);
  return coverage(resumeText(resume), keywords);
}

export async function loadContext(id) {
  const row = await findJob(id);
  if (!row) return null;
  const posting = await postingFor(id, row.Link);
  const { resume, source, label } = resumeFor(id);
  return {
    row,
    posting,
    resume,
    resumeSource: { source, label },
    kit: loadApplyKit(),
    // shape the prompt builders in writing.js expect
    ai: {
      job: { title: row["Role Title"], company: row.Company, location: row["Country/Remote"] },
      posting: posting.description,
      resumeText: resumeText(resume),
      kit: loadApplyKit(),
      trackKey: row["CV Version Used"],
    },
  };
}
