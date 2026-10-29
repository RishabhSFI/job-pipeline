// eligibility.js
// Can you actually take this job? Checks a posting against your own facts
// (work authorization, graduation, degree, languages, certifications) from
// the "eligibility" section of config/applyKit.json.
//
// checkEligibility(job, facts) -> { verdict, reasons, notes }
//   verdict: "ok" | "check" (worth a look, something to confirm) | "no"
//   reasons: plain-English strings, the strongest first
//   notes: facts worth knowing that aren't a problem (e.g. a US job needs a visa)
// Pure: no file or network access, so it runs anywhere and is easy to test.

import { termsOf } from "./jobType.js";

export const VERDICT_LABEL = { ok: "", check: "Check", no: "Not eligible" };

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_PLACE = new RegExp(
  String.raw`\b(united states|usa|u\.s\.a?\.?|us only|us-based|new york|san francisco|seattle|boston|chicago|austin|los angeles|denver|atlanta|miami|washington,? d\.?c)\b|,\s*(${US_STATES})\b|\((us|usa)\)|remote\s*[-–(]?\s*(us|usa|united states)\b`,
  "i",
);
const CANADA_PLACE =
  /\b(canada|toronto|vancouver|montreal|ottawa|calgary|waterloo|edmonton|winnipeg|ontario|quebec|british columbia|alberta)\b|,\s*(ON|BC|QC|AB|MB|NS|SK|NB|NL|PE)\b/i;

const CITIZENSHIP =
  /\b(u\.?s\.? citizen(ship)?( is)? required|must be a u\.?s\.? citizen|united states citizen(ship)? (is )?required|u\.?s\.? citizens? only|security clearance|(secret|top secret|ts\/sci) clearance|active clearance|clearance (is )?required|u\.?s\.? persons?\b|itar\b)/i;
const NO_SPONSORSHIP =
  /\b((not|unable to|cannot|can't|won't|will not|do not|does not|are not able to)\s+(provide\s+|offer\s+)?(visa\s+|immigration\s+)?sponsor(ship)?|without (the need for )?(current or future |any )?(visa |employment visa )?sponsorship|no (visa )?sponsorship|sponsorship (is )?not (available|provided|offered))\b/i;

const LANGUAGES = [
  "german", "french", "spanish", "mandarin", "chinese", "japanese", "korean", "portuguese",
  "italian", "dutch", "arabic", "hindi", "cantonese", "polish", "russian", "turkish",
  "hebrew", "vietnamese", "swedish", "danish", "norwegian", "finnish", "greek", "thai",
];
const CERTS = ["cpa", "cfa", "cma", "frm", "acca", "pmp", "series 7", "series 63", "series 65", "series 66", "series 79"];

const SEASON_MONTH = { winter: 1, spring: 4, summer: 5, fall: 9, autumn: 9 };

function monthIndex(yyyyMm) {
  const m = String(yyyyMm || "").match(/^(\d{4})-(\d{1,2})/);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

function termIndex(term) {
  const m = String(term).toLowerCase().match(/(winter|spring|summer|fall|autumn)\s*(\d{4})/);
  return m ? Number(m[2]) * 12 + SEASON_MONTH[m[1]] - 1 : null;
}

// The most years of experience the posting asks for, or 0.
export function yearsAsked(text) {
  let most = 0;
  const re = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*years?(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,4}?experience/gi;
  for (const m of String(text || "").matchAll(re)) most = Math.max(most, Number(m[1]));
  return most;
}

// Graduation years a posting asks for ("Class of 2026", "graduating in 2026",
// "2026 graduates"), empty when it names none.
export function graduationYears(text) {
  const years = new Set();
  const t = String(text || "");
  const near = /(class of|graduat\w*|grads?\b|degree (completion|conferred)|expected to graduate|completing (your|a) degree)[^.]{0,40}?\b(20\d\d)\b/gi;
  const before = /\b(20\d\d)\s+(new\s+)?(grads?|graduates?|graduation)\b/gi;
  for (const m of t.matchAll(near)) years.add(Number(m[4]));
  for (const m of t.matchAll(before)) years.add(Number(m[1]));
  return [...years];
}

function locationOf(job) {
  return String(job.location || job["Country/Remote"] || "");
}

export function checkEligibility(job, facts = {}) {
  const title = String(job.title || job["Role Title"] || "");
  const text = `${title}\n${job.description || ""}`;
  const lower = text.toLowerCase();
  const location = locationOf(job);
  const no = [];
  const check = [];
  const notes = [];

  // --- work authorization ---
  const workIn = (facts.workIn || []).map((c) => c.toLowerCase());
  const canWorkInUS = workIn.some((c) => /united states|^us$|^usa$/.test(c));
  const knowsAuth = workIn.length > 0;
  const inUS = US_PLACE.test(location);
  const inCanada = CANADA_PLACE.test(location);
  const usOnly = inUS && !inCanada;
  if (knowsAuth && !canWorkInUS && usOnly) {
    const sponsorship = String(job.sponsorship || "");
    if (/citizenship is required/i.test(sponsorship) || CITIZENSHIP.test(text)) {
      no.push("Requires US citizenship or a security clearance");
    } else if (/remote/i.test(location)) {
      no.push("Remote, but for people based in the US");
    } else if (/does not offer sponsorship/i.test(sponsorship) || NO_SPONSORSHIP.test(text)) {
      (facts.tnEligible ? check : no).push(
        facts.tnEligible
          ? "US job with no visa sponsorship: a TN visa may still work for business roles, ask the recruiter"
          : "US job with no visa sponsorship",
      );
    } else {
      notes.push(facts.tnEligible ? "US: TN visa" : "US: needs visa sponsorship");
    }
  }

  // --- graduation and student status ---
  const grad = monthIndex(facts.graduation);
  if (grad !== null) {
    const isIntern = /intern|co-?op/i.test(job.jobType || job["Job Type"] || "") || /\b(intern(ship)?|co-?op)\b/i.test(title);
    const terms = termsOf({ ...job, title }).map(termIndex).filter((n) => n !== null);
    if (isIntern && terms.length) {
      const after = terms.filter((t) => t > grad);
      if (after.length === terms.length) {
        no.push(`Internship after you graduate (${facts.graduation}); internships need you to still be a student`);
      } else if (terms.some((t) => t >= grad - 1)) {
        check.push(`Internship around your graduation (${facts.graduation}): many expect you to return to school after`);
      }
    }
    const years = graduationYears(text);
    const gradYear = Math.floor(grad / 12);
    if (!isIntern && years.length && Math.max(...years) < gradYear) {
      no.push(`Wants ${Math.max(...years)} graduates; you graduate in ${gradYear}`);
    }
  }

  // --- degree ---
  const degree = String(facts.degree || "").toLowerCase();
  if (degree && !/master|mba|phd|doctor/.test(degree)) {
    const listed = (job.degrees || []).map((d) => d.toLowerCase());
    if (/\b(mba|ph\.?d|master'?s|doctoral|postdoc)\b/i.test(title)) {
      no.push("For graduate students (MBA, Master's or PhD)");
    } else if (listed.length && !listed.some((d) => /bachelor|associate|certificate|bootcamp|incomplete/.test(d))) {
      no.push(`Requires a ${job.degrees.join(" or ")}`);
    } else if (/(master'?s|mba|ph\.?d\.?|doctoral)( degree)? (is )?(required|needed)|requires? (a |an )?(master'?s|mba|ph\.?d)|must (have|hold) (a |an )?(master'?s|mba|ph\.?d)/i.test(text)) {
      no.push("Requires a graduate degree (Master's, MBA or PhD)");
    }
  }

  // --- experience ---
  const asked = yearsAsked(text);
  const maxYears = Number(facts.maxYearsExperience ?? 2);
  if (asked >= maxYears + 3) no.push(`Asks for ${asked}+ years of experience`);
  else if (asked > maxYears) check.push(`Asks for ${asked}+ years of experience`);

  // --- languages ---
  const mine = (facts.languages || ["English"]).map((l) => l.toLowerCase());
  for (const lang of LANGUAGES) {
    if (mine.includes(lang)) continue;
    const inTitle = new RegExp(`\\b${lang}\\b`, "i").test(title) && /writer|translator|speaker|bilingual|native|fluent|annotat|tutor|linguist/i.test(title);
    const near = new RegExp(`(fluen\\w*|native|proficien\\w*|bilingual|speak|written and spoken)[^.\\n]{0,40}\\b${lang}\\b|\\b${lang}\\b[^.\\n]{0,25}(fluen\\w*|native|proficien\\w*|required|speaker)`, "i");
    if (inTitle) no.push(`Needs ${lang[0].toUpperCase() + lang.slice(1)}`);
    else if (near.test(text)) {
      const required = new RegExp(`(required|must)[^.\\n]{0,40}\\b${lang}\\b|\\b${lang}\\b[^.\\n]{0,40}(required|is a must)`, "i").test(text);
      (required ? no : check).push(`${required ? "Needs" : "Mentions"} ${lang[0].toUpperCase() + lang.slice(1)}`);
    }
  }

  // --- certifications ---
  const certs = (facts.certifications || []).map((c) => c.toLowerCase());
  for (const cert of CERTS) {
    if (certs.includes(cert)) continue;
    const c = cert.replace(" ", "\\s*");
    const required = new RegExp(`\\b${c}\\b[^.\\n]{0,30}(required|is a must|designation required)|must (hold|have|possess)[^.\\n]{0,25}\\b${c}\\b|requires?[^.\\n]{0,20}\\b${c}\\b`, "i");
    if (required.test(lower)) {
      const within = new RegExp(`\\b${c}\\b[^.\\n]{0,60}(within|after hire|upon hire|sponsor)`, "i").test(lower);
      (within ? check : no).push(`${within ? "Must get" : "Requires"} ${cert.toUpperCase().replace("SERIES", "Series")}${within ? " after joining" : ""}`);
    }
  }

  const verdict = no.length ? "no" : check.length ? "check" : "ok";
  return { verdict, reasons: [...no, ...check], notes };
}

// The sheet's Eligibility cell: "Check: …" / "Not eligible: …", "Note: …" for
// a fine job with something worth knowing, "" otherwise.
export function eligibilityCell({ verdict, reasons, notes = [] }) {
  if (verdict !== "ok") return `${VERDICT_LABEL[verdict]}: ${[...reasons, ...notes].join(" · ")}`;
  return notes.length ? `Note: ${notes.join(" · ")}` : "";
}
