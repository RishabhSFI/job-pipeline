// emailAlerts.js
// Reads LinkedIn and Indeed job-alert emails from the user's Gmail over IMAP
// and turns them into jobs. Read-only: the mailbox is opened with EXAMINE
// (readOnly), bodies are fetched with BODY.PEEK (never sets \Seen), and no
// message is ever moved, flagged, deleted or sent.
//
// Settings in .env.local: SMTP_EMAIL, SMTP_APP_PASSWORD (same App Password as
// sending), READ_JOB_ALERTS (default true), ALERTS_LOOKBACK_DAYS (default 14).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { makeJob } from "./base.js";
import { parseAlertEmail } from "../alertParse.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const STATE_FILE = path.join(ROOT, "data", "alerts-state.json");
export const ALERT_SENDERS = [
  "jobalerts-noreply@linkedin.com",
  "alert@indeed.com",
  "donotreply@jobalert.indeed.com",
];
const MAX_MESSAGES = 50;
const DAY = 86400000;

export function alertsConfig(env = process.env) {
  const email = env.SMTP_EMAIL;
  const pass = (env.SMTP_APP_PASSWORD || "").replace(/\s+/g, "");
  const placeholder =
    !email || email === "you@example.com" || !pass || pass === "your-app-password";
  const lookback = Number(env.ALERTS_LOOKBACK_DAYS);
  return {
    email,
    pass,
    hasCredentials: !placeholder,
    enabled: String(env.READ_JOB_ALERTS ?? "true").toLowerCase() !== "false",
    lookbackDays: lookback > 0 ? lookback : 14,
  };
}

function readState(file) {
  try {
    const t = Date.parse(JSON.parse(fs.readFileSync(file, "utf-8")).lastDate);
    return Number.isNaN(t) ? null : new Date(t);
  } catch {
    return null;
  }
}

function writeState(file, date) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ lastDate: date.toISOString() }, null, 2));
}

async function withMailbox(cfg, fn) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.email, pass: cfg.pass },
    logger: false,
  });
  client.on("error", () => {});
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

const alertQuery = (since) => ({
  or: ALERT_SENDERS.map((from) => ({ from })),
  since,
});

// Counts alert emails in the last `days` days. Used by `npm run doctor`.
export async function countAlertEmails(env = process.env, days = 14) {
  const cfg = alertsConfig(env);
  return withMailbox(cfg, async (client) => {
    const uids = await client.search(alertQuery(new Date(Date.now() - days * DAY)), { uid: true });
    return uids.length;
  });
}

// Returns { jobs, reason }. `reason` explains an empty result.
export async function readAlerts(env = process.env, { stateFile = STATE_FILE } = {}) {
  const cfg = alertsConfig(env);
  if (!cfg.enabled) return { jobs: [], reason: "READ_JOB_ALERTS is false" };
  if (!cfg.hasCredentials) {
    return { jobs: [], reason: "Gmail is not set up (SMTP_EMAIL / SMTP_APP_PASSWORD), run npm run setup" };
  }

  const lastDate = readState(stateFile);
  const since = lastDate || new Date(Date.now() - cfg.lookbackDays * DAY);
  const jobs = [];
  let newest = lastDate;

  try {
    await withMailbox(cfg, async (client) => {
      const uids = await client.search(alertQuery(since), { uid: true });
      const messages = [];
      for await (const msg of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
        messages.push(msg);
      }
      // Oldest first so the cap never skips mail that the state date moves past.
      messages.sort((a, b) => new Date(a.internalDate) - new Date(b.internalDate));
      for (const msg of messages.slice(0, MAX_MESSAGES)) {
        const date = new Date(msg.internalDate);
        if (lastDate && date <= lastDate) continue;
        const mail = await simpleParser(msg.source);
        const from = mail.from?.value?.[0]?.address || "";
        if (!ALERT_SENDERS.includes(from.toLowerCase())) continue;
        const { source, jobs: parsed } = parseAlertEmail({ from, text: mail.text || "" });
        const postedAt = (mail.date || date).toISOString();
        const label = source === "linkedin-alert" ? "LinkedIn" : "Indeed";
        for (const j of parsed) {
          jobs.push(makeJob({ ...j, source, postedAt, description: `From your ${label} job alert email` }));
        }
        if (!newest || date > newest) newest = date;
      }
    });
  } catch (err) {
    return { jobs: [], reason: `could not read Gmail (${err.responseText || err.message})` };
  }

  if (newest && (!lastDate || newest > lastDate)) writeState(stateFile, newest);
  return { jobs, reason: jobs.length ? "" : "no new alert emails" };
}

export async function fetchEmailAlerts() {
  const { jobs, reason } = await readAlerts();
  if (!jobs.length && reason) console.log(`[fetchers] email alerts: skipped, ${reason}`);
  return jobs;
}
