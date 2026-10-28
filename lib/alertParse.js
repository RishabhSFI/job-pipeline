// alertParse.js
// Pure parsers for LinkedIn and Indeed job-alert emails (plain text in, jobs out).

const SEPARATOR = /^[-=_*~•\s]{5,}$/;
const LINKEDIN_VIEW = /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^\s/?]*-)?(\d{5,})/i;
const INDEED_LINK = /https?:\/\/(?:[a-z.]+\.)?indeed\.com\/[^\s<>)"]*/i;

// Lines that sit between the job details and the link, or in the email header.
const JUNK = [
  /^view job\b/i,
  /^(easy apply|actively recruiting|promoted|new|be an early applicant|apply with resume.*)$/i,
  /^\d+\s+(connections?|school alumni|company alumni|applicants?|benefits?)\b/i,
  /^(your job alert|new jobs?\b|see all jobs|unsubscribe|you are receiving|this email was intended|help|©)/i,
  /^[\$€£]\s?[\d,.]+/,
  /^\d+\s+(hours?|days?|weeks?|minutes?)\s+ago$/i,
];

const clean = (line) => line.replace(/[​-‏ ﻿]/g, " ").replace(/\s+/g, " ").trim();
const isJunk = (line) => JUNK.some((re) => re.test(line));

export function normalizeLinkedInLink(url) {
  const m = String(url || "").match(LINKEDIN_VIEW);
  return m ? `https://www.linkedin.com/jobs/view/${m[1]}/` : "";
}

export function normalizeIndeedLink(url) {
  let u;
  try {
    u = new URL(String(url).replace(/[.,;)\]]+$/, ""));
  } catch {
    return "";
  }
  const jk = u.searchParams.get("jk") || u.searchParams.get("vjk");
  if (jk) return `https://${u.hostname}/viewjob?jk=${jk}`;
  return `${u.origin}${u.pathname}`;
}

// Walks the text; every link line closes a block of detail lines above it.
// blankResets treats a blank line as the end of a block (Indeed groups each job as a paragraph).
function blocksFromText(text, linkRe, { blankResets = false } = {}) {
  const lines = String(text || "").split(/\r?\n/).map(clean);
  const blocks = [];
  let pending = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || SEPARATOR.test(line)) {
      if (SEPARATOR.test(line) || blankResets) pending = [];
      continue;
    }
    let linkMatch = line.match(linkRe);
    if (!linkMatch && /^view job\b.*:?$/i.test(line) && lines[i + 1]) {
      linkMatch = lines[i + 1].match(linkRe);
      if (linkMatch) i++;
    }
    if (linkMatch) {
      blocks.push({ details: pending.filter((l) => !isJunk(l) && !/^<?https?:\/\//i.test(l)), url: linkMatch[0] });
      pending = [];
    } else if (!/^<?https?:\/\//i.test(line)) {
      pending.push(line);
    }
  }
  return blocks;
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter((j) => (seen.has(j.link) ? false : seen.add(j.link)));
}

export function parseLinkedInAlert(text) {
  const jobs = [];
  for (const { details, url } of blocksFromText(text, LINKEDIN_VIEW)) {
    const link = normalizeLinkedInLink(url);
    const [title, company, location] = details.slice(-3);
    if (!link || details.length < 3 || !title || !company) continue;
    jobs.push({ title, company, location: location || "", link });
  }
  return dedupe(jobs);
}

export function parseIndeedAlert(text) {
  const jobs = [];
  for (const { details, url } of blocksFromText(text, INDEED_LINK, { blankResets: true })) {
    if (!/[?&]v?jk=|\/(?:viewjob|rc\/clk|pagead\/clk|m\/viewjob)/i.test(url)) continue;
    const link = normalizeIndeedLink(url);
    // Indeed's block starts with the title; the snippet that follows is long prose.
    const [title, second = "", third = ""] = details.filter((l) => l.length <= 140);
    if (!link || !title || !second) continue;
    let company = second;
    let location = third;
    const split = second.match(/^(.+?)\s+(?:-|–|—|·)\s+(.+)$/);
    if (split) [, company, location] = split;
    jobs.push({ title, company, location, link });
  }
  return dedupe(jobs);
}

export function parseAlertEmail({ from = "", text = "" }) {
  if (/linkedin\.com/i.test(from)) {
    return { source: "linkedin-alert", jobs: parseLinkedInAlert(text) };
  }
  if (/indeed\.com/i.test(from)) {
    return { source: "indeed-alert", jobs: parseIndeedAlert(text) };
  }
  return { source: "", jobs: [] };
}
