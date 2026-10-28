// app/api/runs/route.js
// GET: the last 10 search runs and the newest result of each source.

import { NextResponse } from "next/server";
import { recentRuns, sourceHealth } from "../../../lib/runs.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ runs: recentRuns(10), sources: sourceHealth() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
