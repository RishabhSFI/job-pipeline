// app/api/studio/drafts/[key]/route.js
// Autosaved, unsaved Studio work. GET returns { draft } (null when none),
// PUT { jobId, versionId, savedAs, track, description, resume } saves it,
// DELETE discards it.

import { NextResponse } from "next/server";
import { deleteDraft, getDraft, isDraftKey, saveDraft } from "../../../../../lib/studioDrafts.js";
import { isResume } from "../../../../../lib/studio.js";

export const dynamic = "force-dynamic";

const badKey = () => NextResponse.json({ success: false, error: "Bad draft key." }, { status: 400 });

export async function GET(_request, { params }) {
  if (!isDraftKey(params.key)) return badKey();
  return NextResponse.json({ success: true, draft: getDraft(params.key) });
}

export async function PUT(request, { params }) {
  if (!isDraftKey(params.key)) return badKey();
  const body = await request.json().catch(() => ({}));
  if (!isResume(body.resume)) return NextResponse.json({ success: false, error: "That isn't a resume." }, { status: 400 });
  const { savedAt } = saveDraft(params.key, body);
  return NextResponse.json({ success: true, savedAt });
}

export async function DELETE(_request, { params }) {
  if (!isDraftKey(params.key)) return badKey();
  deleteDraft(params.key);
  return NextResponse.json({ success: true });
}
