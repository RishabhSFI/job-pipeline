// scripts/doctor.mjs
// Checks every part of your setup and says exactly how to fix what's wrong.
//
//   npm run doctor             full check, including your Google Sheet
//   npm run doctor -- --offline   skips the Google Sheet check

import fs from "fs";
import path from "path";
import { PLATFORM } from "./platform.mjs";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts) => path.join(ROOT, ...parts);

export function readEnv() {
  const file = p(".env.local");
  if (!fs.existsSync(file)) return null;
  const env = {};
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function readKey(env) {
  const file = env?.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!file || !fs.existsSync(file)) return null;
  try {
    const key = JSON.parse(fs.readFileSync(file, "utf-8"));
    return key.type === "service_account" && key.client_email ? key : null;
  } catch {
    return null;
  }
}

// Turns a Google API error into the fix a person needs.
export function sheetErrorFix(err, key) {
  const msg = String(err?.message || err);
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    return "Turn on the Google Sheets API: in Google Cloud, type \"Google Sheets API\" in the search bar and click Enable (check the project picker shows the right project). Wait two minutes.";
  }
  if (/permission|403|caller does not have/i.test(msg)) {
    return `Share your sheet with ${key?.client_email || "the service account email in credentials/keys.json"} as Editor (Share button in Google Sheets).`;
  }
  if (/not found|404|Requested entity/i.test(msg)) {
    return "The sheet ID in .env.local is wrong. Run npm run setup and paste your sheet's link again.";
  }
  if (/invalid_grant|invalid JWT|Invalid JWT/i.test(msg)) {
    return "Your Google key was deleted or is invalid. Make a new JSON key for the service account (Keys tab) and run npm run setup.";
  }
  return msg;
}

async function sheetCheck(env, key) {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  process.env.GOOGLE_SPREADSHEET_ID = env.GOOGLE_SPREADSHEET_ID;
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SPREADSHEET_ID });
  const tabs = meta.data.sheets.map((s) => s.properties.title);
  const tab = env.GOOGLE_SHEET_TAB || "Sheet1";
  if (!tabs.includes(tab)) {
    throw new Error(`TAB:Your sheet has no tab called "${tab}". Run npm run setup to fix it (your tabs: ${tabs.join(", ")}).`);
  }
  return meta.data.properties.title;
}

export function dashboardPort(env = readEnv()) {
  return Number(env?.DASHBOARD_PORT) || 3001;
}

// Each check: { name, ok, fix, optional }
export async function runChecks({ offline = false } = {}) {
  const checks = [];
  const add = (name, ok, fix, optional = false) => checks.push({ name, ok, fix, optional });

  const major = Number(process.versions.node.split(".")[0]);
  add("Node.js 20 or newer", major >= 20, "Install the LTS version from https://nodejs.org.");

  add("Project folder is in a safe place", !PLATFORM.blockedFolder(ROOT), PLATFORM.blockedFolderFix);

  add("Dependencies installed", fs.existsSync(p("node_modules")), `Run ${PLATFORM.installCommand}.`);

  const env = readEnv();
  add("Settings file (.env.local)", !!env, `Run ${PLATFORM.installCommand} to create it.`);

  const key = readKey(env);
  add("Google key (credentials/keys.json)", !!key,
    "Download a JSON key for your service account (SETUP.md step 4) and run npm run setup.");

  const hasSheet = !!env?.GOOGLE_SPREADSHEET_ID && env.GOOGLE_SPREADSHEET_ID !== "your-spreadsheet-id";
  add("Google Sheet ID set", hasSheet, "Run npm run setup and paste your sheet's link.");

  if (!offline && key && hasSheet) {
    try {
      const title = await sheetCheck(env, key);
      add(`Google Sheet reachable ("${title}")`, true, "");
    } catch (err) {
      const msg = String(err.message || err);
      add("Google Sheet reachable", false, msg.startsWith("TAB:") ? msg.slice(4) : sheetErrorFix(err, key));
    }
  }

  const { PROFILE } = await import("../lib/profile.js");
  for (const file of new Set(Object.values(PROFILE.resumes))) {
    add(`Resume (resumes/${file})`, fs.existsSync(p("resumes", file)),
      `Save your resume as resumes/${file}, or run npm run setup.`);
  }

  const kitFile = p("config", "applyKit.json");
  const editMe = fs.existsSync(kitFile)
    ? (fs.readFileSync(kitFile, "utf-8").match(/EDIT ME/g) || []).length
    : -1;
  add("Apply kit filled in (config/applyKit.json)", editMe === 0,
    editMe < 0 ? `Run ${PLATFORM.installCommand} to create it.` : `Replace the ${editMe} EDIT ME line(s) in config/applyKit.json.`);

  if (!offline) {
    add("Daily job search scheduled", PLATFORM.isScheduled("daily"), `Run ${PLATFORM.installCommand}.`);
    const port = dashboardPort(env);
    let up = false;
    try {
      up = (await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(5000) })).ok;
    } catch {}
    add(`Dashboard running (http://localhost:${port})`, up,
      PLATFORM.isScheduled("dashboard")
        ? "It can take 20 seconds after you log in. Otherwise check logs/dashboard.log."
        : `Run ${PLATFORM.installCommand}.`);
  }

  add("Gmail set up for digest emails", !!env?.SMTP_APP_PASSWORD && env.SMTP_APP_PASSWORD !== "your-app-password",
    "Optional. Run npm run setup and choose to set up Gmail.", true);

  return checks;
}

export function printChecks(checks) {
  for (const c of checks) {
    const mark = c.ok ? "✓" : c.optional ? "○" : "✗";
    console.log(`${mark} ${c.name}`);
    if (!c.ok && c.fix) console.log(`    ${c.fix}`);
  }
  const failed = checks.filter((c) => !c.ok && !c.optional).length;
  console.log(failed ? `\n${failed} thing(s) to fix.` : "\nAll set.");
  return failed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failed = printChecks(await runChecks({ offline: process.argv.includes("--offline") }));
  process.exit(failed ? 1 : 0);
}
