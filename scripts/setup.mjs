// scripts/setup.mjs
// Walks you through connecting Google, adding your resume and running your
// first search. Safe to run again any time: it skips what is already done
// and fixes what isn't.
//
//   npm run setup

import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { readEnv, readKey, sheetErrorFix, runChecks, printChecks, dashboardPort } from "./doctor.mjs";
import { PLATFORM, npmSpawnOptions, cleanDroppedPath } from "./platform.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const KEY_FILE = path.join(ROOT, "credentials", "keys.json");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted || s.includes("\n")) rl.output.write(muted ? "\n" : s);
};
// Lines are queued, so answers typed or pasted ahead of a question aren't lost.
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  rl.output.write(q);
  const { value, done } = await lines.next();
  if (done) {
    console.log("\nSetup stopped. Run npm run setup to pick up where you left off.");
    process.exit(1);
  }
  return value.trim();
};
const askSecret = async (q) => {
  rl.output.write(q);
  muted = true;
  const answer = await ask("");
  muted = false;
  return answer;
};
const yes = async (q, byDefault = true) => {
  const a = (await ask(`${q} ${byDefault ? "[Y/n]" : "[y/N]"} `)).toLowerCase();
  return a ? a.startsWith("y") : byDefault;
};
const step = (n, title) => console.log(`\n── Step ${n}: ${title}\n`);

function setEnv(key, value) {
  let text = fs.readFileSync(ENV_FILE, "utf-8");
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_FILE, text);
}

// Newest service-account key file in Downloads, if any.
function findDownloadedKey() {
  const dir = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(dir)) return null;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map(({ f }) => f)
    .find((f) => {
      try {
        return JSON.parse(fs.readFileSync(f, "utf-8")).type === "service_account";
      } catch {
        return false;
      }
    });
}

async function sheetsClient() {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

async function stepKey() {
  step(1, "Google key");
  while (!readKey(readEnv())) {
    const found = findDownloadedKey();
    if (found && (await yes(`Found a Google key in Downloads: ${path.basename(found)}. Use it?`))) {
      fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
      fs.copyFileSync(found, KEY_FILE);
      fs.unlinkSync(found);
      fs.chmodSync(KEY_FILE, 0o600);
      setEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", KEY_FILE);
      break;
    }
    console.log("No Google key yet. Follow SETUP.md step 4, points 1 to 6:");
    console.log("make a Google Cloud project, enable the Google Sheets and Google Drive APIs,");
    console.log("create a service account, and download a JSON key (it lands in Downloads).");
    await ask("Press Enter once the key has downloaded... ");
  }
  const key = readKey(readEnv());
  console.log(`✓ Google key ready. Your service account email is:\n\n    ${key.client_email}\n`);
  return key;
}

async function stepSheet(key) {
  step(2, "Google Sheet");
  let env = readEnv();
  let id = env.GOOGLE_SPREADSHEET_ID;
  let sheets;
  for (;;) {
    if (!id || id === "your-spreadsheet-id") {
      console.log("Make a blank sheet at https://sheets.new, click Share, and add this email as Editor:");
      console.log(`\n    ${key.client_email}\n`);
      const link = await ask("Paste the sheet's link here: ");
      id = (link.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1] || link;
      setEnv("GOOGLE_SPREADSHEET_ID", id);
    }
    try {
      sheets = sheets || (await sheetsClient());
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
      const tabs = meta.data.sheets.map((s) => s.properties.title);
      env = readEnv();
      if (!tabs.includes(env.GOOGLE_SHEET_TAB || "Sheet1")) setEnv("GOOGLE_SHEET_TAB", tabs[0]);
      console.log(`✓ Connected to "${meta.data.properties.title}".`);
      break;
    } catch (err) {
      console.log(`\n✗ Couldn't open the sheet. ${sheetErrorFix(err, key)}\n`);
      if (/sheet ID/.test(sheetErrorFix(err, key))) id = "";
      await ask("Press Enter to try again... ");
    }
  }
  const fresh = readEnv();
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: fresh.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    GOOGLE_SPREADSHEET_ID: fresh.GOOGLE_SPREADSHEET_ID,
    GOOGLE_SHEET_TAB: fresh.GOOGLE_SHEET_TAB || "Sheet1",
  });
  const first = await sheets.spreadsheets.values.get({
    spreadsheetId: fresh.GOOGLE_SPREADSHEET_ID,
    range: `${process.env.GOOGLE_SHEET_TAB}!A1`,
  });
  if (first.data.values?.length) return console.log("✓ Sheet already set up.");
  const { ensureHeader, formatSheet } = await import("../lib/sheets.js");
  await ensureHeader();
  await formatSheet();
  console.log("✓ Sheet formatted with columns and status colours.");
}

async function stepResume() {
  step(3, "Your resume");
  const { PROFILE } = await import("../lib/profile.js");
  const target = path.join(ROOT, "resumes", PROFILE.resumes[Object.keys(PROFILE.resumes)[0]]);
  while (!fs.existsSync(target)) {
    const answer = await ask("Drag your resume PDF into this window, then press Enter: ");
    const file = cleanDroppedPath(answer);
    if (fs.existsSync(file) && file.toLowerCase().endsWith(".pdf")) {
      fs.copyFileSync(file, target);
    } else {
      console.log("That isn't a PDF file I can find. Try again.");
    }
  }
  console.log(`✓ Resume ready (resumes/${path.basename(target)}).`);
}

async function stepGemini() {
  step(4, "AI writing (optional, free)");
  const env = readEnv();
  if (env.GEMINI_API_KEY) return console.log("✓ Gemini key already set.");
  console.log("A free Gemini key turns on: rewording resume bullets for a job, cover letters,");
  console.log("outreach emails, and importing your resume into Resume Studio automatically.");
  if (!(await yes("Add a Gemini key now?"))) return console.log("Skipped. Run npm run setup again any time.");
  console.log("Go to https://aistudio.google.com, sign in, click \"Get API key\", then \"Create API key\".");
  for (;;) {
    const key = (await askSecret("Paste the key (it stays hidden), or press Enter to skip: ")).trim();
    if (!key) return console.log("Skipped.");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`).catch(() => null);
    if (res?.ok) {
      setEnv("GEMINI_API_KEY", key);
      process.env.GEMINI_API_KEY = key;
      return console.log("✓ Gemini key works and is saved to .env.local.");
    }
    console.log("✗ Google didn't accept that key. Copy it again from AI Studio.");
  }
}

async function stepResumeData() {
  step(5, "Resume Studio");
  const file = path.join(ROOT, "data", "resume.json");
  if (fs.existsSync(file)) return console.log("✓ Your resume is set up in Resume Studio (data/resume.json).");
  const { PROFILE } = await import("../lib/profile.js");
  const pdf = path.join(ROOT, "resumes", PROFILE.resumes[Object.keys(PROFILE.resumes)[0]]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.env.GEMINI_API_KEY && fs.existsSync(pdf)) {
    console.log("Reading your resume PDF with Gemini to set up Resume Studio...");
    try {
      const { importResumePdf } = await import("../lib/resumeImport.js");
      const resume = await importResumePdf(pdf, Object.keys(PROFILE.tracks));
      fs.writeFileSync(file, JSON.stringify(resume, null, 2) + "\n");
      return console.log("✓ Imported. Check it in Resume Studio; fix anything it got wrong there.");
    } catch (err) {
      console.log(`✗ Import didn't work (${err.message}).`);
    }
  }
  fs.copyFileSync(path.join(ROOT, "config", "resume.example.json"), file);
  console.log("Copied a blank template to data/resume.json. Fill it in with your resume, or");
  console.log("add a Gemini key and delete data/resume.json, then run npm run setup to import it.");
}

async function stepApplyKit() {
  step(6, "Your details and answers");
  const kit = path.join(ROOT, "config", "applyKit.json");
  const left = (fs.readFileSync(kit, "utf-8").match(/EDIT ME/g) || []).length;
  if (!left) return console.log("✓ Apply kit filled in.");
  console.log(`config/applyKit.json has ${left} EDIT ME line(s): your name, links, answers to`);
  console.log("common application questions, and a short pitch for each kind of role.");
  const editor = PLATFORM.name === "Windows" ? "Notepad" : "TextEdit";
  if (await yes(`Open it in ${editor} now?`)) {
    PLATFORM.openFile(kit);
    await ask(`Save it in ${editor}, then press Enter here... `);
  }
}

async function stepGmail() {
  step(7, "Email (optional)");
  const env = readEnv();
  if (env.SMTP_APP_PASSWORD && env.SMTP_APP_PASSWORD !== "your-app-password") {
    return console.log("✓ Gmail already set up.");
  }
  console.log("With Gmail connected you get a daily digest email, and can send applications");
  console.log("to jobs that ask for one by email (only ever after you click Approve).");
  console.log("It can also read your LinkedIn and Indeed job-alert emails (read-only, nothing is");
  console.log("marked read, moved or deleted) so those jobs appear automatically.");
  if (!(await yes("Set up Gmail now?", false))) return console.log("Skipped. Run npm run setup again any time.");
  const email = await ask("Gmail address: ");
  console.log("Make an App Password: go to https://myaccount.google.com, type \"App passwords\"");
  console.log("in its search bar, and create one (2-Step Verification must be on).");
  const pass = (await askSecret("Paste the App Password (it stays hidden): ")).replace(/\s+/g, "");
  setEnv("SMTP_EMAIL", email);
  setEnv("SMTP_APP_PASSWORD", pass);
  setEnv("DIGEST_RECIPIENT_EMAIL", email);
  console.log("✓ Gmail saved to .env.local.");
  console.log("Tip: on linkedin.com/jobs search for a role and turn on \"Set alert\" (email). Indeed alerts work too.");
}

async function stepFirstRun() {
  step(8, "First job search");
  if (!(await yes("Run your first job search now? It takes about a minute."))) return;
  spawnSync("npm", ["run", "pipeline"], { cwd: ROOT, stdio: "inherit", ...npmSpawnOptions });
}

console.log("Job Pipeline setup. Press Ctrl+C any time to stop; run npm run setup to pick up again.");
if (!fs.existsSync(ENV_FILE)) {
  console.log(`\nRun ${PLATFORM.installCommand} first, then npm run setup.`);
  process.exit(1);
}
const key = await stepKey();
await stepSheet(key);
await stepResume();
await stepGemini();
await stepResumeData();
await stepApplyKit();
await stepGmail();
await stepFirstRun();

console.log("\n── Checkup\n");
printChecks(await runChecks());
const url = `http://localhost:${dashboardPort()}`;
console.log(`\nYour dashboard: ${url}`);
try {
  PLATFORM.openUrl(url);
} catch {}
rl.close();
