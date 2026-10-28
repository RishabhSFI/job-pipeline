// app/api/fetch/route.js
// POST: run the job search now, from the dashboard's "Fetch now" button.
// Refuses a second run while one is in progress. Returns the run summary.

import { NextResponse } from "next/server";
import { runPipeline } from "../../../lib/pipeline.js";
import { acquireFetchLock, releaseFetchLock } from "../../../lib/fetchLock.js";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST() {
  if (!acquireFetchLock()) {
    return NextResponse.json(
      { success: false, error: "A search is already running. Try again in a few minutes." },
      { status: 409 },
    );
  }
  try {
    const result = await runPipeline({ trigger: "dashboard" });
    return NextResponse.json(result, { status: result.success === false ? 500 : 200 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    releaseFetchLock();
  }
}
