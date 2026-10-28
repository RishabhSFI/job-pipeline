// app/api/studio/versions/route.js
// GET lists saved versions (without their resumes).
// POST { savedAs, jobId, track, resume } saves one; the same name overwrites.

import { NextResponse } from "next/server";
import { listVersions, saveVersion } from "../../../../lib/resume.js";
import { isResume } from "../../../../lib/studio.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, versions: listVersions() });
}

export async function POST(request) {
  const { savedAs, jobId = "", track = "", resume } = await request.json().catch(() => ({}));
  const name = typeof savedAs === "string" ? savedAs.trim() : "";
  if (!name || !isResume(resume)) {
    return NextResponse.json({ success: false, error: "A version needs a name and a resume." }, { status: 400 });
  }
  const { resume: _, ...version } = saveVersion({ savedAs: name, jobId: String(jobId), track: String(track), resume });
  return NextResponse.json({ success: true, version, versions: listVersions() });
}
