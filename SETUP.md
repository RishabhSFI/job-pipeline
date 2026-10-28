# Setting up Job Pipeline on your Mac

Job Pipeline searches about 10,000 job postings every morning, keeps the ones
that fit you, scores them, finds the salary, and puts the best 50 in your own
Google Sheet. A dashboard on your Mac lets you approve jobs, copy your
application answers, and track what you applied to. An X tab gives you
one-click searches for founders posting roles on X.

Everything runs on your own Mac with your own Google account. Nobody else
sees your jobs, resume or answers.

Setup takes about 30 minutes. You need a Mac, a Google account, and Node.js.

## 1. Install Node.js

Download the LTS version from https://nodejs.org and install it. To check it
worked, open Terminal and run `node -v`. You need version 20 or newer.

## 2. Get the code

Put the folder in `~/Projects`, not on your Desktop or in Documents or
Downloads. macOS blocks background jobs from reading those folders.

If you were given a GitHub link:

```bash
mkdir -p ~/Projects && cd ~/Projects
git clone <the link you were given> Job-pipeline
```

If you were given a zip, unzip it and move the folder to `~/Projects/Job-pipeline`.

## 3. Run the installer

```bash
cd ~/Projects/Job-pipeline
./scripts/install-mac.sh
```

It installs everything and sets up two background jobs:

- the dashboard, which starts whenever you log in, at http://localhost:3001
- the job search, which runs every day at 8:00 AM (or when your Mac next wakes)

To use another port or time: `PORT=3002 HOUR=7 ./scripts/install-mac.sh`.

## 4. Connect your Google Sheet

1. Go to https://console.cloud.google.com and create a project (any name).
2. Search for **Google Sheets API** and click **Enable**. Do the same for **Google Drive API**.
3. Go to **IAM & Admin → Service Accounts → Create service account**. Give it any name, click **Create and continue**, skip the role, click **Done**.
4. Click the new account's email, open the **Keys** tab, then **Add key → Create new key → JSON**. A file downloads.
5. Rename that file to `keys.json` and move it into `~/Projects/Job-pipeline/credentials/`. Never share this file.
6. Create a blank Google Sheet. Click **Share** and add the service account's email (it ends in `iam.gserviceaccount.com`) as **Editor**.
7. Copy the sheet ID from its URL. It is the long part between `/d/` and `/edit`. Open `.env.local` in the project folder and paste it after `GOOGLE_SPREADSHEET_ID=`.
8. Format the sheet once:

```bash
cd ~/Projects/Job-pipeline
curl -X POST http://localhost:3001/api/format
```

Use a school or work Google account and step 4 may be blocked. Use a personal Gmail instead.

## 5. Make it yours

| What | Where |
|---|---|
| Your resume | Save it as `resumes/resume.pdf` |
| Your name, links and saved answers | Replace every `EDIT ME` in `config/applyKit.json` |
| The roles you want and the words that score them | `config/profile.json` |
| Companies to watch | `config/companies.json`, then check them with `npm run check-companies` |
| X searches | `config/xSearches.json` |
| Your name for application emails | The `YOUR_` lines in `.env.local` |

`config/profile.json` comes tuned for startup generalist, operations, finance
and AI-training roles at entry level in Canada and the US. Change the
keywords to fit what you want. Each track has `titleKeywords` that decide
whether a job is relevant at all.

## 6. Run your first search

```bash
cd ~/Projects/Job-pipeline
npm run pipeline
```

It takes about a minute. Then open http://localhost:3001.

## 7. Email (optional)

For a daily digest email and sending email applications, add a Gmail address
and a Gmail App Password to `.env.local` (`SMTP_EMAIL`, `SMTP_APP_PASSWORD`,
`DIGEST_RECIPIENT_EMAIL`). Create the App Password at
myaccount.google.com → Security → 2-Step Verification → App passwords.
Nothing is ever emailed without your click unless you set `AUTO_SEND_EMAILS=true`.

## Daily use

1. Open http://localhost:3001. Jobs are sorted by match score, with salary when it is known.
2. **Approve** the ones you want, or skip them.
3. Open **Apply kit** to copy your details and answers and download your resume, then apply on the company's site.
4. Click **Mark Applied**. A follow-up reminder is set for 7 days later.
5. Check the **X** tab for founders posting roles, and reply or DM them.

## If something goes wrong

- Dashboard won't load: check `logs/dashboard.log`.
- No new jobs in the morning: check `logs/run.log`. Your Mac must be on (asleep is fine) for the daily run.
- To stop everything: `./scripts/uninstall-mac.sh`. Your files and sheet are kept.
