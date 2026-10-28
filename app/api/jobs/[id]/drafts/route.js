// app/api/jobs/[id]/drafts/route.js
// PUT { cover?, why? }: save your edits to this job's drafts.

import { NextResponse } from "next/server";
import { readJson, writeJson } from "../../../../../lib/store.js";

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const current = readJson(`drafts/${params.id}`, {});
    for (const kind of ["cover", "why"]) {
      if (typeof body[kind] === "string") current[kind] = { ...current[kind], text: body[kind], editedAt: new Date().toISOString() };
    }
    writeJson(`drafts/${params.id}`, current);
    return NextResponse.json({ success: true, drafts: current });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
