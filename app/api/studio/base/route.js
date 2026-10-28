// app/api/studio/base/route.js
// PUT { resume } replaces your base resume (data/resume.json).

import { NextResponse } from "next/server";
import { saveBaseResume } from "../../../../lib/resume.js";
import { isResume } from "../../../../lib/studio.js";

export async function PUT(request) {
  const { resume } = await request.json().catch(() => ({}));
  if (!isResume(resume)) {
    return NextResponse.json({ success: false, error: "That isn't a resume." }, { status: 400 });
  }
  return NextResponse.json({ success: true, base: saveBaseResume(resume) });
}
