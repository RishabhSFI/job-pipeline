// app/api/approve/route.js
// Updates a row's Status when you click a button on the dashboard.
// Body: { row: 5, status: "Approved" }
//
// Clicking Approve acts immediately:
//   - email job (Submission Method "Email" + address in Notes): the
//     application is sent now, status becomes "Applied (Auto)" and a
//     follow-up is set 7 days out. If sending fails, the row stays
//     "Approved" and the next pipeline run retries it.
//   - any other job (web form): moves straight to "Needs Manual Apply".
// Marking a job Applied also sets a 7-day follow-up.

import { NextResponse } from "next/server";
import {
  getAllJobs,
  updateStatus,
  setFollowUpDate,
  STATUS,
} from "../../../lib/sheets.js";
import { sendApplication } from "../../../lib/autoApply.js";
import { resumeFileFor } from "../../../lib/profile.js";
import { logEvent } from "../../../lib/timeline.js";
import { jobId } from "../../../lib/jobId.js";

export const maxDuration = 30;
const ALLOWED_STATUSES = new Set(Object.values(STATUS));
const FOLLOW_UP_STATUSES = new Set([STATUS.APPLIED, STATUS.APPLIED_AUTO]);

export async function POST(request) {
  try {
    const { row, status } = await request.json();

    if (!row || !status) {
      return NextResponse.json(
        { error: "row and status are required" },
        { status: 400 },
      );
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` },
        { status: 400 },
      );
    }

    const rowNumber = Number(row);
    const all = await getAllJobs();
    const job = all.find((j) => j._row === rowNumber);
    const setStatus = async (newStatus) => {
      await updateStatus(rowNumber, newStatus);
      if (job?.Link) logEvent(jobId(job.Link), "status", newStatus);
    };

    if (status === STATUS.APPROVED) {
      const method = (job?.["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (job?.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (job && method === "email" && emailMatch) {
        const sent = await sendApplication(
          {
            title: job["Role Title"] || "",
            company: job.Company || "",
            resumeFile: resumeFileFor(job["CV Version Used"]),
            trackKey: job["CV Version Used"],
          },
          emailMatch[0],
        );
        if (sent) {
          await setStatus(STATUS.APPLIED_AUTO);
          await setFollowUpDate(rowNumber, 7);
          return NextResponse.json({ success: true, sent: true });
        }
        // Sending failed: keep it Approved so the next run retries.
        await setStatus(STATUS.APPROVED);
        return NextResponse.json({ success: true, sent: false });
      }

      // Web-form job: nothing to send, go straight to the manual queue.
      await setStatus(STATUS.NEEDS_MANUAL);
      return NextResponse.json({ success: true, sent: false });
    }

    await setStatus(status);
    if (FOLLOW_UP_STATUSES.has(status)) {
      await setFollowUpDate(rowNumber, 7);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
