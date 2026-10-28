// app/api/jobs/[id]/route.js
// GET: everything the job page shows. POST { status }: move this job to
// Applied, Interview, Offer or Rejected (Applied also sets a 7-day follow-up).

import { NextResponse } from "next/server";
import { updateStatus, setFollowUpDate, STATUS } from "../../../../lib/sheets.js";
import { loadContext, findJob, keywordMatch } from "../../../../lib/jobContext.js";
import { linkedinLinks, schoolFromKit } from "../../../../lib/linkedin.js";
import { PROFILE, TRACKS } from "../../../../lib/profile.js";
import { listContacts, outreachStatus, smtpStatus, companyDomain } from "../../../../lib/outreach.js";
import { aiAvailable } from "../../../../lib/ai.js";
import { readJson } from "../../../../lib/store.js";
import { logEvent } from "../../../../lib/timeline.js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SETTABLE = new Set([STATUS.APPLIED, STATUS.INTERVIEW, STATUS.OFFER, STATUS.REJECTED]);
const fail = (error, status = 500) => NextResponse.json({ success: false, error }, { status });

export async function GET(_req, { params }) {
  try {
    const ctx = await loadContext(params.id);
    if (!ctx) return fail("Job not found", 404);
    const { row, posting, resumeSource, kit } = ctx;
    const trackKey = row["CV Version Used"];
    const roleKeywords = Object.values(TRACKS).flatMap((t) => t.titleKeywords);
    return NextResponse.json({
      success: true,
      job: { ...row, id: params.id },
      posting: { text: posting.description, live: posting.live, salary: posting.salary || "", savedAt: posting.savedAt || null },
      match: { ...keywordMatch(posting.description, ctx.resume), resume: resumeSource },
      kit,
      track: { key: trackKey, label: TRACKS[trackKey]?.label || trackKey || "" },
      linkedin: linkedinLinks(row.Company, row["Role Title"], PROFILE.linkedinSearches, roleKeywords, schoolFromKit(kit?.profile)),
      drafts: readJson(`drafts/${params.id}`, {}),
      contacts: listContacts().filter((c) => c.jobId === params.id),
      domain: companyDomain({ link: row.Link, company: row.Company }),
      outreach: { ...outreachStatus(), smtp: smtpStatus(process.env) },
      aiAvailable: aiAvailable(),
    });
  } catch (err) {
    return fail(err.message);
  }
}

export async function POST(request, { params }) {
  try {
    const { status } = await request.json();
    if (!SETTABLE.has(status)) return fail(`status must be one of: ${[...SETTABLE].join(", ")}`, 400);
    const row = await findJob(params.id);
    if (!row) return fail("Job not found", 404);
    await updateStatus(row._row, status);
    logEvent(params.id, "status", status);
    if (status === STATUS.APPLIED) await setFollowUpDate(row._row, 7);
    return NextResponse.json({ success: true, status });
  } catch (err) {
    return fail(err.message);
  }
}
