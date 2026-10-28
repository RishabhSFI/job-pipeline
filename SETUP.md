# Job Pipeline setup guide

Job Pipeline searches about 10,000 job postings every morning, keeps the ones
that fit you, scores them, finds the salary, and puts the best 50 in your own
Google Sheet. A dashboard on your Mac lets you approve jobs, copy your
application answers, and track what you applied to. An X tab gives you
one-click searches for founders posting roles on X.

Everything runs on your own Mac with your own Google account. Nobody else
sees your jobs, resume or answers. It is free to run: the Google Sheets API
costs nothing at this size, and every job source it reads is free.

You need:

- a Mac (the installer is Mac only)
- a personal Google account (school or work accounts often block step 4)
- about 30 minutes

## The easy way: let an AI assistant set it up with you

This project was set up and customized with an AI coding assistant, and you
can do the same. The assistant runs the commands, explains each step, and
tailors the job matching to your resume. Two options:

- **Claude Code** (https://claude.com/claude-code). This is what the project
  was built with. It needs a paid Claude plan.
- **Gemini**. Google gives college students a free year of its paid AI plan
  in 2026: **Google AI Pro** for students in the US and **Google AI Plus** for
  students in most other countries, including Canada. Claim it at
  https://gemini.google/students with your student status verified through
  SheerID. The offer must be claimed by **December 31, 2026**. Google's
  **Gemini CLI**, which works in your Terminal like Claude Code, also has a
  free tier with a personal Google account.

Open your assistant in Terminal, give it your resume, and paste this:

> I want to set up Job Pipeline from https://github.com/RishabhSFI/job-pipeline
> on my Mac. Clone it into ~/Projects/Job-pipeline, read SETUP.md, and do the
> setup with me step by step. Run the installer, walk me through the Google
> Cloud steps, then have me run npm run setup in my own Terminal (it asks me
> questions). After that, run npm run doctor and fix anything it flags. Then
> tailor config/profile.json,
> config/companies.json and config/applyKit.json to my resume and the kind of
> roles I want. Never paste the contents of credentials/keys.json or my
> passwords into chat or into any file other than where SETUP.md says.

You still click through the Google Cloud website yourself (step 4 below) and
answer the setup questions. The assistant can't do those for you, but it can
tell you where you are stuck.

## The manual way

### 1. Install Node.js

Download the **LTS** version from https://nodejs.org and install it. To check
it worked, open Terminal and run:

```bash
node -v
```

You need version 20 or newer.

### 2. Get the code

Put the folder in `~/Projects`. Do **not** put it on your Desktop or in
Documents or Downloads: macOS blocks background jobs from reading those
folders, and the daily search would silently fail.

```bash
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/RishabhSFI/job-pipeline.git Job-pipeline
```

### 3. Run the installer

```bash
cd ~/Projects/Job-pipeline
./scripts/install-mac.sh
```

It installs everything and sets up two background jobs:

- the dashboard, which starts whenever you log in, at http://localhost:3001
- the job search, which runs every day at 8:00 AM (or as soon as your Mac wakes, if it was asleep)

To use another port or time instead: `PORT=3002 HOUR=7 ./scripts/install-mac.sh`.

### 4. Make a Google key

The app writes to your own Google Sheet through a Google Cloud "service
account". Making one takes about five minutes of clicking.

Google Cloud has a lot of menus. The fastest way through is the **search bar
at the top of the page**: click it, type what the step says, and pick the
matching result.

1. Go to https://console.cloud.google.com and sign in with your personal Google account.
2. Create a project. Click the project picker at the top left (next to the
   Google Cloud logo), then **New project**. Any name works, for example
   `job-pipeline`. Click **Create**, then make sure the new project is
   selected in the project picker.
3. In the search bar, type **Google Sheets API**. Open it and click **Enable**.
4. In the search bar, type **Google Drive API**. Open it and click **Enable**.
5. In the search bar, type **Service Accounts** and open it (it is under IAM & Admin).
   Click **+ Create service account**. Give it any name, click **Create and
   continue**, skip the optional role, and click **Done**.
6. Click the email of the service account you just made. Open the **Keys**
   tab, then **Add key → Create new key → JSON → Create**. A `.json` file
   downloads to your Downloads folder. Leave it there; the next step finds it.

That file works like a password: never share it, post it, or paste it anywhere.

If Google says **"Service account key creation is disabled"**, you are on a
school or work account. Start again from point 1 with a personal Gmail.

### 5. Run the guided setup

```bash
cd ~/Projects/Job-pipeline
npm run setup
```

It walks you through the rest, one question at a time:

1. finds the key in your Downloads and moves it into place
2. tells you which email to share your Google Sheet with, then asks for the sheet's link
3. sets up the sheet's columns and colours
4. asks you to drag in your resume PDF
5. opens your Apply kit so you can add your name, links and answers
6. optionally connects Gmail for a daily digest email
7. runs your first job search and opens your dashboard

You can stop any time with Ctrl+C. Running `npm run setup` again picks up
where you left off and skips what is already done.

### 6. Make it yours

| What | Where |
|---|---|
| Your name, links and saved answers | Replace every `EDIT ME` in `config/applyKit.json` |
| A short pitch for each kind of role | `summaries` in `config/applyKit.json` |
| The roles you want and the words that score them | `config/profile.json` |
| What the job boards are searched for | `search` in `config/profile.json` |
| LinkedIn people searches on each job | `linkedinSearches` in `config/profile.json` |
| Companies to watch | `config/companies.json`, then run `npm run check-companies` |
| X searches | `config/xSearches.json` |
| The email sent to email-apply jobs | `emailTemplate` in `config/applyKit.json` |
| Your resume | `resumes/resume.pdf` |

`config/profile.json` comes tuned for entry-level startup generalist,
operations, finance and AI-training roles in Canada and the US. Each track
has `titleKeywords` (a job title must contain one to count) and a
`titleBonus` (how much that track is favoured). Add, rename or remove tracks
to fit what you want, and give each one a summary under the same name in
`config/applyKit.json`. An AI assistant can do this from your resume.

## Daily use

1. Open http://localhost:3001. Jobs are sorted by match score, with salary when it is known.
2. **Approve** the ones you want, or skip them. Approve never submits a
   web application for you: it moves the job to Needs Manual Apply. Only
   jobs that apply by email get sent, after you confirm.
3. Open **Apply kit** to copy your details and answers and download your
   resume, then apply on the company's site.
4. Click **Mark Applied**. A follow-up reminder is set for 7 days later.
5. Check the **X** tab for founders posting roles, and reply or DM them.

## Keeping it running

- Your Mac must be on for the 8 AM search. Asleep is fine: it runs when the Mac wakes. Shut down means that day is skipped.
- Once a month, run `npm run check-companies` to drop companies whose job boards moved.
- To get updates from this repo: `git pull`, then `./scripts/install-mac.sh` again, then `npm run doctor`. Your private files (`.env.local`, `credentials/`, your resume and `config/applyKit.json`) are never touched. If you edited `config/profile.json`, `config/companies.json` or `config/xSearches.json`, git may ask you to commit or stash your changes first.

## If something goes wrong

Run the checkup first. It tests every part of your setup and tells you
exactly how to fix anything that is wrong:

```bash
cd ~/Projects/Job-pipeline
npm run doctor
```

- Dashboard won't load: check `logs/dashboard.log`.
- No new jobs in the morning: check `logs/run.log`.
- To stop everything: `./scripts/uninstall-mac.sh`. Your files and sheet are kept.
