// lib/pipeline.js
// The job search run in one place. It runs every few hours from
// scripts/run-pipeline.mjs (the scheduled job), and on demand from the
// dashboard and app/api/run/route.js.
//
// fetch -> close/reopen sheet jobs -> skip started internships -> filter ->
// dedupe -> score -> write to sheet -> process approvals (sending email
// applications) -> follow-ups -> digest (once a day) -> record the run.

import { fetchAll } from "./fetchers/index.js";
import { filterJobs } from "./filters.js";
import { dedupeJobs } from "./dedupe.js";
import { scoreAll } from "./scorer.js";
import { findApplyEmail } from "./emailApply.js";
import {
  addJobs,
  getAllJobs,
  getJobsByStatus,
  updateStatus,
  updateFieldMany,
  setFollowUpDate,
  getDueFollowUps,
  STATUS,
} from "./sheets.js";
import { sendDailyDigest, sendFollowUpReminder } from "./mailer.js";
import { sendApplication } from "./autoApply.js";
import { resumeFileFor } from "./profile.js";
import { resolveSalary, simplifyIdMap } from "./salary.js";
import { savePosting, getPosting } from "./postings.js";
import { jobTypeOf, internshipAlreadyStarted } from "./jobType.js";
import { closingChanges } from "./closing.js";
import { isDigestDue, markDigestSent, queueForDigest, pendingDigest } from "./digest.js";
import { jobId, normalizeLink } from "./jobId.js";
import { logEvent } from "./timeline.js";
import { recordRun } from "./runs.js";

const MAX_NEW_ROWS_PER_RUN = 50;

async function setStatus(row, status) {
  await updateStatus(row._row, status);
  if (row.Link) logEvent(jobId(row.Link), "status", status);
}

// Closes sheet jobs gone from listings read in full, reopens closed ones
// that are listed again, and updates sheetRows to match. Returns how many
// of each.
async function closeAndReopen(sheetRows, fetched) {
  const changes = closingChanges(sheetRows, {
    postingFor: (link) => getPosting(jobId(link)),
    seenLinks: new Set(fetched.jobs.map((j) => normalizeLink(j.link))),
    complete: fetched.complete,
  });
  await updateFieldMany(
    "Status",
    changes.map((c) => ({ row: c.row, value: c.status })),
  );
  for (const c of changes) {
    sheetRows.find((r) => r._row === c.row).Status = c.status;
    logEvent(jobId(c.link), c.kind, c.kind === "closed" ? "No longer listed" : "Listed again");
  }
  return {
    closed: changes.filter((c) => c.kind === "closed").length,
    reopened: changes.filter((c) => c.kind === "reopened").length,
  };
}

// trigger: "schedule" | "dashboard" | "manual", recorded in data/runs.json.
// Returns { success, log, run } or { success: false, error, log, run }.
// Never throws.
export async function runPipeline({ trigger = "manual" } = {}) {
  const startedAt = new Date();
  const run = { at: startedAt.toISOString(), trigger, sources: [], added: 0, closed: 0, reopened: 0 };
  // Settings are read when the run starts, so changes to .env.local apply.
  const minimumScore = Number(process.env.MINIMUM_MATCH_SCORE || 55);
  const autoApproveMin = Number(process.env.AUTO_APPROVE_MIN_SCORE || 80);
  const autoSendEmails = process.env.AUTO_SEND_EMAILS === "true";
  const maxEmails = Number(process.env.MAX_EMAILS_PER_RUN || 10);

  const log = [];
  const pushLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  try {
    // --- fetch, filter, dedup ---
    pushLog("=== Fetching jobs from all sources ===");
    const fetched = await fetchAll();
    run.sources = fetched.sources;
    const rawJobs = fetched.jobs;
    pushLog(`Total raw jobs found: ${rawJobs.length}`);
    const failedSources = fetched.sources.filter((s) => s.error);
    for (const s of failedSources) pushLog(`Source ${s.name}: ${s.error}`);

    const sheetRows = await getAllJobs();
    Object.assign(run, await closeAndReopen(sheetRows, fetched));
    pushLog(`Closed ${run.closed} jobs no longer listed, reopened ${run.reopened}.`);

    const today = new Date();
    const currentJobs = rawJobs
      .map((job) => ({ ...job, jobType: jobTypeOf(job) }))
      .filter((job) => !internshipAlreadyStarted(job, today));
    pushLog(`After skipping internships already started: ${currentJobs.length}`);

    const eligibleJobs = filterJobs(currentJobs);
    pushLog(`After location filter: ${eligibleJobs.length}`);

    const newJobs = dedupeJobs(
      eligibleJobs,
      // A closed job matches by link only, so a repost under a new link is added.
      sheetRows.map((r) =>
        r.Status === STATUS.CLOSED
          ? { link: r.Link }
          : { link: r.Link, company: r.Company, title: r["Role Title"], location: r["Country/Remote"] },
      ),
    );
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    // --- score ---
    const scoredJobs = scoreAll(newJobs, minimumScore);
    pushLog(
      `After minimum match score (${minimumScore}): ${scoredJobs.length}`,
    );

    // --- write best matches in one batch ---
    const toAdd = [...scoredJobs]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_NEW_ROWS_PER_RUN);

    const autoApproved = [];
    let emailJobs = 0;
    const simplifyIds = simplifyIdMap(rawJobs);
    const salaries = [];
    for (const job of toAdd) salaries.push(await resolveSalary(job, simplifyIds));

    const rowsToAdd = toAdd.map((job, i) => {
      const applyEmail = findApplyEmail(job.description);
      if (applyEmail) emailJobs++;

      const strong = job.matchScore >= autoApproveMin && !job.needsManualReview;

      // strong match + application email -> sent automatically only when
      // AUTO_SEND_EMAILS=true, otherwise it waits for your Approve click.
      // strong match with a web form -> Needs Manual Apply (you submit it).
      let status = STATUS.AWAITING_APPROVAL;
      if (strong && applyEmail) {
        if (autoSendEmails) status = STATUS.APPROVED;
      } else if (strong) {
        status = STATUS.NEEDS_MANUAL;
      }
      if (status === STATUS.NEEDS_MANUAL) autoApproved.push(job);

      return {
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: salaries[i],
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        submissionMethod: applyEmail ? "Email" : "Unknown (check posting)",
        status,
        postedDate: (job.postedAt || "").slice(0, 10),
        jobType: job.jobType,
        scoreWhy: job.scoreWhy,
        notes: [
          status !== STATUS.AWAITING_APPROVAL
            ? `Auto-approved (score ${job.matchScore})`
            : "",
          job.needsManualReview ? "Flagged for manual CV review" : "",
          applyEmail ? `Apply by email: ${applyEmail}` : "",
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
    toAdd.forEach((job, i) => savePosting(job, salaries[i]));
    await addJobs(rowsToAdd);
    for (const job of toAdd) {
      logEvent(jobId(job.link), "found", `${job.source}, score ${job.matchScore}`);
    }
    run.added = rowsToAdd.length;
    pushLog(
      `Added ${rowsToAdd.length} new rows (${autoApproved.length} auto-approved, ${emailJobs} with an application email).`,
    );

    // --- process approved jobs: send email applications, queue the rest ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    const autoAppliedToday = [];
    const needsManualApply = [];
    let emailsSent = 0;

    for (const row of approved) {
      const method = (row["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (row.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (method === "email" && emailMatch) {
        // Over the per-run cap: leave it Approved, it goes out next run.
        if (emailsSent >= maxEmails) continue;

        const success = await sendApplication(
          {
            title: row["Role Title"] || "",
            company: row.Company || "",
            resumeFile: resumeFileFor(row["CV Version Used"]),
            trackKey: row["CV Version Used"],
          },
          emailMatch[0],
        );
        if (success) {
          emailsSent++;
          await setStatus(row, STATUS.APPLIED_AUTO);
          await setFollowUpDate(row._row, 7);
          autoAppliedToday.push(row);
          continue;
        }
      }

      await setStatus(row, STATUS.NEEDS_MANUAL);
      needsManualApply.push(row);
    }
    pushLog(
      `Emails sent: ${autoAppliedToday.length}, Needs manual: ${needsManualApply.length}`,
    );

    // --- follow-ups due today ---
    const dueFollowUps = await getDueFollowUps();
    if (dueFollowUps.length) {
      await sendFollowUpReminder(dueFollowUps);
      for (const row of dueFollowUps) {
        await setStatus(row, STATUS.FOLLOWUP_SENT);
      }
    }
    pushLog(`Follow-ups sent: ${dueFollowUps.length}`);

    // --- daily digest: the first run at or after DIGEST_HOUR each day ---
    queueForDigest({
      needsManualApply: [...autoApproved, ...needsManualApply],
      autoApplied: autoAppliedToday,
    });
    if (isDigestDue()) {
      const stillAwaiting = await getJobsByStatus(STATUS.AWAITING_APPROVAL);
      const pending = pendingDigest();
      const sent = await sendDailyDigest({
        needsApproval: stillAwaiting,
        needsManualApply: pending.needsManualApply,
        autoAppliedToday: pending.autoApplied,
      });
      if (sent) markDigestSent();
      pushLog(sent ? "Daily digest sent." : "Daily digest could not be sent; the next run tries again.");
    }

    return { success: true, log, run: finish(run, startedAt) };
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return { success: false, error: err.message, log, run: finish(run, startedAt, err) };
  }
}

function finish(run, startedAt, err) {
  return recordRun({
    ...run,
    ms: Date.now() - startedAt.getTime(),
    ok: !err,
    ...(err ? { error: err.message } : {}),
  });
}
