// salary.js
// Finds a salary for a job, in this order:
//   1. pay the posting itself lists (Ashby compensation, YC salary, or a
//      "$X - $Y" range in the description, common under pay-transparency laws)
//   2. Simplify's salary for the same job, when Simplify lists it
// Returns text like "$65K–$75K/yr (posting)" or "Not listed".

import { safeGet } from "./fetchers/base.js";

const NOT_LISTED = "Not listed";

function money(n, sign) {
  if (n >= 1000) return `${sign}${Number((n / 1000).toFixed(1))}K`;
  return `${sign}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

// Hourly when the number is small, unless the period says otherwise.
export function formatRange(min, max, period, currency = "") {
  if (!min && !max) return "";
  const lo = min || max;
  const hi = max || min;
  const unit = period || (hi < 500 ? "hr" : "yr");
  const sign = currency === "CAD" ? "CA$" : "$";
  const range =
    lo === hi ? money(lo, sign) : `${money(lo, sign)}–${money(hi, sign)}`;
  return `${range}/${unit}`;
}

function toNumber(raw) {
  const s = raw.replace(/[$,\s]|USD|CAD/gi, "");
  const n = parseFloat(s);
  return /k$/i.test(s) ? n * 1000 : n;
}

const NUM = String.raw`\$\s?\d[\d,]*(?:\.\d+)?\s?[kK]?`;
const RANGE = new RegExp(
  String.raw`(${NUM})\s*(?:USD|CAD)?\s*(?:-|–|—|to)\s*(?:USD|CAD|CA|C)?\s*(${NUM.replace("\\$", "\\$?")})`,
);
const PERIODS = [
  ["hr", /(per hour|\/\s?h(ou)?r|hourly|an hour)/i],
  ["wk", /(per week|\/\s?w(ee)?k|weekly|a week)/i],
  ["mo", /(per month|\/\s?mo(nth)?|monthly|a month)/i],
];

// The first "$X - $Y" pay range in a block of text.
export function salaryFromText(text) {
  const clean = String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|\s+/g, " ");
  const m = clean.match(RANGE);
  if (!m) return "";
  let lo = toNumber(m[1]);
  let hi = toNumber(m[2]);
  // "$120 - 150K": the K on the second number applies to both.
  if (hi >= 1000 && lo < 1000 && /k/i.test(m[2])) lo *= 1000;
  if (!lo || !hi || hi < lo || lo < 10) return "";
  const around = clean.slice(Math.max(0, m.index - 4), m.index + m[0].length + 25);
  const period = PERIODS.find(([, re]) => re.test(around))?.[0] || null;
  const own = clean.slice(Math.max(0, m.index - 3), m.index + m[0].length + 4);
  const currency = /CA\$|CAD|C\$/.test(own) ? "CAD" : "";
  return formatRange(lo, hi, period, currency);
}

const SIMPLIFY_PERIOD = { 1: "hr", 4: "yr" };

export async function simplifySalary(simplifyId) {
  const res = await safeGet(`https://simplify.jobs/p/${simplifyId}`);
  if (!res) return "";
  const m = (await res.text()).match(
    /"min_salary":(\d+(?:\.\d+)?|null),"max_salary":(\d+(?:\.\d+)?|null),"salary_period":(\d+|null)/,
  );
  if (!m) return "";
  const min = m[1] === "null" ? 0 : Number(m[1]);
  const max = m[2] === "null" ? 0 : Number(m[2]);
  return formatRange(min, max, SIMPLIFY_PERIOD[m[3]] || null);
}

// Same job, different URL spellings: drop the query string, case and slash.
export function normalizeLink(link) {
  return String(link || "")
    .split("?")[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

// simplifyIds: Map of normalized job link -> Simplify job id.
export async function resolveSalary(job, simplifyIds) {
  const posted =
    salaryFromText(job.salary) || job.salary || salaryFromText(job.description);
  if (posted) return `${posted} (posting)`;
  const id = job.simplifyId || simplifyIds?.get(normalizeLink(job.link));
  if (id) {
    const fromSimplify = await simplifySalary(id);
    if (fromSimplify) return `${fromSimplify} (Simplify)`;
  }
  return NOT_LISTED;
}

export function simplifyIdMap(jobs) {
  const map = new Map();
  for (const j of jobs) {
    if (j.simplifyId) map.set(normalizeLink(j.link), j.simplifyId);
  }
  return map;
}
