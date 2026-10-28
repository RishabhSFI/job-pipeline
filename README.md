# Job Pipeline

A Next.js app that searches about 10,000 job postings every few hours, keeps
entry-level startup, operations, finance and AI-training roles in Canada, the
US or remote, scores them against your profile, finds the salary, logs the
best ones in your own Google Sheet, and gives you a dashboard to approve and
apply from, plus one-click X searches for founders who are hiring.

**To install it on your Mac, follow [SETUP.md](SETUP.md).** You can do it by
hand or with an AI assistant such as Claude Code or Gemini (free for college
students in 2026). The short version:

```bash
git clone https://github.com/RishabhSFI/job-pipeline.git ~/Projects/Job-pipeline
cd ~/Projects/Job-pipeline
./scripts/install-mac.sh     # Windows: powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
npm run setup                # connects Google, adds your resume, runs your first search
npm run doctor               # checks everything and says how to fix what's wrong
```

Works on macOS and Windows 10/11.

Built on [Job Pipeline by Daniel Chimezie](https://github.com/0xDaniiel/Job-pipeline),
retargeted from developer jobs to startup and business roles. The rest of
this README describes how the code works.

## How it works

```
schedule (every 4 hours)  ->  scripts/run-pipeline.mjs  ->  lib/pipeline.js
                         |
   1. lib/fetchers/      pull jobs, with posted dates, from every source
   2. lib/closing.js     close sheet jobs no longer listed, reopen returning ones
   3. lib/jobType.js     internship or full-time; skip internships already started
   4. lib/filters.js     keep Canada, US and remote jobs
   5. lib/dedupe.js      keep each job once across sources and the sheet
   6. lib/scorer.js      score each job with reasons, pick the right CV
   7. lib/sheets.js      write the best new matches to the sheet
   8. lib/emailApply.js  find application emails in descriptions
   9. approvals          send email applications, queue the rest
  10. lib/mailer.js      follow-up reminders, and the digest once a day
  11. lib/runs.js        record the run and how each source did

Dashboard (app/page.js) reads and updates the same sheet.
```

## Your day

1. Open the dashboard. Jobs are sorted by match score.
2. **Approve** a job you want. For an email job, your CV is sent at once
   (after a confirmation that shows the address). For a web-form job, it moves
   to Needs Manual Apply.
3. Open **Apply kit** on a job to copy your details and saved answers and to
   download the right CV. Open the application, fill it in, submit.
4. Click **Mark Applied**. A follow-up reminder is set for 7 days later.

Jobs scoring at or above `AUTO_APPROVE_MIN_SCORE` skip step 2. Only email jobs
are ever submitted for you; web forms are always submitted by you.

## Project layout

### Root

| File                 | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `middleware.js`      | Password login for the dashboard and API (HTTP Basic Auth).    |
| `package.json`       | Dependencies: next, react, googleapis, nodemailer, rss-parser. |
| `.env.local.example` | Template for every setting. Copy to `.env.local`.              |

### How matching works

`config/profile.json` is the single source of truth. Each track has title
keywords and skill keywords. A job's title picks the track (the most specific
keyword wins), and the track picks the CV file. The score (0 to 100) rewards
a track title match, entry-level words (intern, co-op, new grad, analyst) and
skills from your profile, and penalises senior titles, titles on the exclude
list, and postings asking for more than `maxYearsAsked` years. A title that
fits no track stays below the minimum score of 55.

### `config/` (edit these, no code changes)

| File             | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `profile.json`   | Your CVs, tracks (finance, ops, AI training), keywords and seniority rules.   |
| `countries.json` | Canada and US provinces, states, cities, and foreign regions to drop.          |
| `companies.json` | Company names checked on Greenhouse, Lever, Ashby, BambooHR.                   |
| `applyKit.json`  | Your details and saved answers for the Apply kit. Replace the `EDIT ME` lines. |

### `app/`

| File                   | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `page.js`              | The dashboard: stats, tabs, Approve, Apply kit, LinkedIn links. |
| `api/run/route.js`     | The daily pipeline. Protected by `CRON_SECRET`.                 |
| `api/approve/route.js` | Approve and status changes. Sends email applications.           |
| `api/jobs/route.js`    | Reads the sheet for the dashboard.                              |
| `api/kit/route.js`     | Serves `applyKit.json` to the dashboard.                        |
| `api/resume/route.js`  | Downloads a CV by track (`?cv=finance`).                                    |
| `api/clear/route.js`   | Clear all (only works when `ALLOW_CLEAR=true`).                 |
| `api/format/route.js`  | One-time sheet styling. Run it once.                            |

### `lib/`

| File            | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `sheets.js`     | All Google Sheet reads and writes.                             |
| `filters.js`    | Location filter, remote check, duplicate removal.              |
| `scorer.js`     | Match score and track choice. Word lists come from profile.json. |
| `profile.js`    | Loads profile.json: tracks, CV file and label per track.       |
| `emailApply.js` | Finds an application email in a job description.               |
| `linkedin.js`   | Builds LinkedIn search links per company.                      |
| `mailer.js`     | Daily digest and follow-up emails.                             |
| `autoApply.js`  | Sends one application email with the right CV attached.        |
| `loadJson.js`   | Loads the config files.                                        |
| `fetchers/`     | One file per job source, plus `index.js` that runs them all.   |

### `scripts/`

| File                  | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `check-companies.mjs` | Tests every company in `companies.json`, removes dead ones, adds new ones. |

### Other

`resumes/` holds your 3 CV PDFs. `cron/` holds the scripts that call `/api/run`
on a schedule. `logs/` holds the run log.

## Settings (`.env.local`)

| Setting                                                                                 | What it does                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`          | Connect to your sheet.                                                     |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `SMTP_SERVER`, `SMTP_PORT`, `DIGEST_RECIPIENT_EMAIL` | Sending email. Gmail needs an App Password.                                |
| `DIGEST_HOUR`                                                                           | The digest goes out once a day, on the first run at or after this hour. Default 8. |
| `MINIMUM_MATCH_SCORE`                                                                   | Jobs below this never reach the sheet. Default 55.                         |
| `AUTO_APPROVE_MIN_SCORE`                                                                | Jobs at or above this skip the Approve step. Default 80.                   |
| `REQUIRE_REMOTE`                                                                        | `true` drops career-page jobs that don't look remote. Default false.       |
| `AUTO_SEND_EMAILS`                                                                      | `true` sends strong email-apply matches without your click. Default false. |
| `MAX_EMAILS_PER_RUN`                                                                    | Cap on automatic emails per run. Default 10.                               |
| `CRON_SECRET`                                                                           | Protects `/api/run`.                                                       |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD`                                                  | Switch on the dashboard login.                                             |
| `ALLOW_CLEAR`                                                                           | Enables Clear all. Keep false on the VPS.                                  |

## Setup on your PC

```bash
npm install
cp .env.local.example .env.local     # then fill it in
npm run dev                          # open http://localhost:3000
```

Google setup: create a Google Cloud project, enable the Sheets and Drive APIs,
make a service account, download its JSON key into `credentials/`, create the
sheet, and share it with the service account's email as Editor. Then run once:

```bash
curl -X POST http://localhost:3000/api/format
curl -X POST http://localhost:3000/api/run -H "x-cron-secret: YOUR_CRON_SECRET"
```

(If you set a dashboard login, add `-u USER:PASSWORD` to the `format` call.)

Keep the project in a plain folder such as `C:\Users\YOU\job-pipeline`. Do not
put it in OneDrive: syncing breaks `node_modules`.

## Keeping the company list healthy

```bash
node scripts/check-companies.mjs                 # report
node scripts/check-companies.mjs --fix           # remove dead names
node scripts/check-companies.mjs --add=greenhouse:dropbox,ashby:retool
```

Restart `npm run dev` after changing the list, because the fetchers read it at startup.

## Putting it on the VPS

1. Install Node 20, upload the project, run `npm ci` and
   `npm run build`.
2. Fill in `.env.local` with Linux paths. Set `ALLOW_CLEAR=false` and set a
   dashboard login.
3. Start it with PM2: `pm2 start "npm start" --name job-pipeline`, then
   `pm2 save` and `pm2 startup`.
4. Fix Windows line endings in the scripts, then install the daily job:
   `sed -i 's/\r$//' cron/*.sh && chmod +x cron/*.sh && ./cron/setup_cron.sh`.
5. Block everything except SSH with the firewall and reach the dashboard
   through an SSH tunnel: `ssh -L 3000:localhost:3000 user@your-vps-ip`.

## Security

- `.env.local` and `credentials/` must never be committed. Check with
  `git check-ignore -v .env.local credentials/keys.json`.
- The dashboard login uses Basic Auth, which is readable on plain `http://`.
  Use the SSH tunnel or HTTPS.
- `config/applyKit.json` holds your saved answers. Do not commit a real salary
  number to a public repo.
- Rotate the service account key, app password, and `CRON_SECRET` if they are
  ever pasted somewhere public.

## Known limits

- Only email applications are sent for you. Web forms (most jobs) are
  submitted by you; the Apply kit makes that faster.
- Scoring is a keyword-based first pass. Read the posting before applying.
- Location matching is text based. It knows Canada, the US, their provinces,
  states and major cities. Add missing places in `config/countries.json`.
- Salaries are not read from postings, so the sheet shows "Not listed".
- Email detection can pick the wrong address. Check the address on the
  dashboard card before approving.
- LinkedIn and Indeed are not sources: neither offers individual API access.

## Next steps

1. Watch a few real runs and tune the keywords in `config/profile.json` and
   `MINIMUM_MATCH_SCORE`.
2. Run `check-companies.mjs` every month and add companies from your target list.
3. Deploy to the VPS (section above).
4. Build the LinkedIn alert-email reader.
5. Build an assisted-apply script if submitting forms takes too long.
6. Add company career pages for finance and consulting firms in
   `config/companies.json`.
