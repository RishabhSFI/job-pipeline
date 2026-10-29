// app/api/resume/route.js
// Downloads a CV by track: /api/resume?cv=finance
// Only track keys from config/profile.json work, so no other file can be requested.

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  DEFAULT_TRACK,
  isTrackKey,
  resumeFileFor,
} from "../../../lib/profile.js";

export async function GET(request) {
  const cv = new URL(request.url).searchParams.get("cv") || DEFAULT_TRACK;
  if (!isTrackKey(cv)) {
    return NextResponse.json({ error: "No track by that name." }, { status: 400 });
  }
  const fileName = resumeFileFor(cv);

  const filePath = path.join(process.cwd(), "resumes", fileName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "No resume PDF saved for this track. Run npm run setup to add one." },
      { status: 404 },
    );
  }

  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
