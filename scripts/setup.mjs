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
import { spawnSync, execSync } from "child_process";
import { fileURLToPath } from "url";
import { readEnv, readKey, sheetErrorFix, runChecks, printChecks } from "./doctor.mjs";

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
      fs.renameSync(found, KEY_FILE);
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
    const file = answer.replace(/^['"]|['"]$/g, "").replace(/\\ /g, " ");
    if (fs.existsSync(file) && file.toLowerCase().endsWith(".pdf")) {
      fs.copyFileSync(file, target);
    } else {
      console.log("That isn't a PDF file I can find. Try again.");
    }
  }
  console.log(`✓ Resume ready (resumes/${path.basename(target)}).`);
}

async function stepApplyKit() {
  step(4, "Your details and answers");
  const kit = path.join(ROOT, "config", "applyKit.json");
  const left = (fs.readFileSync(kit, "utf-8").match(/EDIT ME/g) || []).length;
  if (!left) return console.log("✓ Apply kit filled in.");
  console.log(`config/applyKit.json has ${left} EDIT ME line(s): your name, links, answers to`);
  console.log("common application questions, and a short pitch for each kind of role.");
  if (await yes("Open it in TextEdit now?")) {
    spawnSync("open", ["-e", kit]);
    await ask("Save it in TextEdit, then press Enter here... ");
  }
}

async function stepGmail() {
  step(5, "Email (optional)");
  const env = readEnv();
  if (env.SMTP_APP_PASSWORD && env.SMTP_APP_PASSWORD !== "your-app-password") {
    return console.log("✓ Gmail already set up.");
  }
  console.log("With Gmail connected you get a daily digest email, and can send applications");
  console.log("to jobs that ask for one by email (only ever after you click Approve).");
  if (!(await yes("Set up Gmail now?", false))) return console.log("Skipped. Run npm run setup again any time.");
  const email = await ask("Gmail address: ");
  console.log("Make an App Password: go to https://myaccount.google.com, type \"App passwords\"");
  console.log("in its search bar, and create one (2-Step Verification must be on).");
  const pass = (await askSecret("Paste the App Password (it stays hidden): ")).replace(/\s+/g, "");
  setEnv("SMTP_EMAIL", email);
  setEnv("SMTP_APP_PASSWORD", pass);
  setEnv("DIGEST_RECIPIENT_EMAIL", email);
  console.log("✓ Gmail saved to .env.local.");
}

async function stepFirstRun() {
  step(6, "First job search");
  if (!(await yes("Run your first job search now? It takes about a minute."))) return;
  spawnSync("npm", ["run", "pipeline"], { cwd: ROOT, stdio: "inherit" });
}

console.log("Job Pipeline setup. Press Ctrl+C any time to stop; run npm run setup to pick up again.");
if (!fs.existsSync(ENV_FILE)) {
  console.log("\nRun ./scripts/install-mac.sh first, then npm run setup.");
  process.exit(1);
}
const key = await stepKey();
await stepSheet(key);
await stepResume();
await stepApplyKit();
await stepGmail();
await stepFirstRun();

console.log("\n── Checkup\n");
printChecks(await runChecks());
try {
  const port = (fs.readFileSync(path.join(os.homedir(), "Library/LaunchAgents/com.jobpipeline.dashboard.plist"), "utf-8").match(/<string>-p<\/string><string>(\d+)<\/string>/) || [])[1] || "3001";
  console.log(`\nYour dashboard: http://localhost:${port}`);
  execSync(`open http://localhost:${port}`);
} catch {}
rl.close();
