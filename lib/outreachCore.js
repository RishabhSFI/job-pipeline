// outreachCore.js
// Pure outreach logic with no file or network access, so the browser and the
// server both use it: email guesses, follow-up dates, daily-cap counting,
// send checks and compose links.

export const CONTACT_STATUS = ["Draft", "Sent", "Replied", "No reply"];
export const RELATIONSHIPS = ["Recruiter", "Hiring manager", "Alumni", "In the role", "Founder", "Other"];
export const FOLLOW_UP_DAYS = 5;
export const DEFAULT_DAILY_CAP = 10;
export const NOTE_LIMIT = 300;

const pad = (n) => String(n).padStart(2, "0");

// Local calendar date as YYYY-MM-DD.
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function followUpDateFor(sentAt, days = FOLLOW_UP_DAYS) {
  return dayKey(addDays(new Date(sentAt), days));
}

export function isFollowUpDue(contact, today = dayKey()) {
  return contact.status === "Sent" && !!contact.followUpDate && contact.followUpDate <= today;
}

export function dailyCap(env = {}) {
  const n = Number(env.MAX_OUTREACH_PER_DAY);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

// Emails the app itself sent today, counted from each contact's send log.
export function sentTodayCount(contacts, now = new Date()) {
  const today = dayKey(now);
  return contacts.reduce((sum, c) => sum + (c.sends || []).filter((s) => dayKey(new Date(s.at)) === today).length, 0);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s) => EMAIL_RE.test(String(s || "").trim());

const PLACEHOLDER_PASSWORDS = new Set(["", "your-app-password"]);

// SMTP counts as configured only with a real-looking address and password;
// the template values from .env.local.example do not count.
export function smtpStatus(env = {}) {
  const email = String(env.SMTP_EMAIL || "").trim();
  const pass = String(env.SMTP_APP_PASSWORD || "").trim();
  if (!email || !pass) {
    return { configured: false, reason: "Gmail sending isn't set up. Add SMTP_EMAIL and SMTP_APP_PASSWORD (a Gmail App Password) to .env.local, or use Open in Gmail instead." };
  }
  if (!isEmail(email) || /@example\.(com|org|net)$/i.test(email) || PLACEHOLDER_PASSWORDS.has(pass)) {
    return { configured: false, reason: "SMTP_EMAIL or SMTP_APP_PASSWORD in .env.local still has the template value. Put in your own Gmail address and App Password, or use Open in Gmail instead." };
  }
  return { configured: true, from: email };
}

const ascii = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/['-]/g, "");

const BOARD_HOSTS =
  /(greenhouse|lever|ashbyhq|workable|workday|myworkdayjobs|smartrecruiters|linkedin|indeed|glassdoor|wellfound|angel|ziprecruiter|jobvite|icims|bamboohr|recruitee|breezy|teamtailor|rippling|dover|himalayas|jobicy|workingnomads|arbeitnow|flexjobs|remote\.co|remotive|remoteok|weworkremotely|simplify|builtin|otta|welcometothejungle|notion\.site)/i;

// The company's email domain, from the posting link when it is the company's
// own site, otherwise a labelled guess from the company name.
export function companyDomain({ link = "", company = "" } = {}) {
  try {
    const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
    if (host && !BOARD_HOSTS.test(host)) {
      const labels = host.split(".");
      const keep = labels.length > 2 && /^(co|com|org|net|ac)$/.test(labels.at(-2)) ? 3 : 2;
      return { domain: labels.slice(-keep).join("."), source: "posting link" };
    }
  } catch {}
  const slug = String(company).toLowerCase().replace(/\b(inc|llc|ltd|corp|co|company|technologies|labs)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  return slug ? { domain: `${slug}.com`, source: "company name (guess)" } : { domain: "", source: "" };
}

// Common address formats for a person at a domain. These are guesses.
export function guessEmails(fullName, domain) {
  const d = String(domain || "").trim().toLowerCase().replace(/^@/, "");
  const parts = ascii(fullName).split(/\s+/).filter(Boolean);
  if (!d || !parts.length) return [];
  const first = parts[0];
  const last = parts.length > 1 ? parts.at(-1) : "";
  const out = [];
  if (last) out.push({ pattern: "first.last@", email: `${first}.${last}@${d}` });
  out.push({ pattern: "first@", email: `${first}@${d}` });
  if (last) {
    out.push({ pattern: "flast@", email: `${first[0]}${last}@${d}` });
    out.push({ pattern: "firstlast@", email: `${first}${last}@${d}` });
  }
  return out;
}

export function gmailComposeUrl({ to = "", subject = "", body = "" }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q}`;
}

export function mailtoUrl({ to = "", subject = "", body = "" }) {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function clampNote(text, limit = NOTE_LIMIT) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > limit * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

// Why this send must not go ahead, or null. Order: confirmation first, so a
// stray call never gets as far as looking at settings.
export function sendBlocker({ contact, subject, body, confirmed, confirmGuess, env, contacts, now = new Date() }) {
  if (confirmed !== true) return { code: "NOT_CONFIRMED", error: "Sending needs your confirmation. Review the recipient, subject and body, then confirm." };
  const smtp = smtpStatus(env);
  if (!smtp.configured) return { code: "NO_SMTP", error: smtp.reason };
  if (!isEmail(contact?.email)) return { code: "NO_RECIPIENT", error: "This contact has no valid email address." };
  if (contact.emailIsGuess && confirmGuess !== true) {
    return { code: "GUESS_UNCONFIRMED", error: "This address is an unverified guess. Confirm that you want to send to it." };
  }
  if (!String(subject || "").trim() || !String(body || "").trim()) return { code: "EMPTY", error: "Subject and body can't be empty." };
  const cap = dailyCap(env);
  if (sentTodayCount(contacts, now) >= cap) {
    return { code: "DAILY_CAP", error: `You've sent today's limit of ${cap} emails. Try again tomorrow, or raise MAX_OUTREACH_PER_DAY in .env.local.` };
  }
  return null;
}
