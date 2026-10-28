// app/api/studio/versions/[id]/route.js
// GET one saved version with its resume; DELETE removes it.

import { NextResponse } from "next/server";
import { deleteVersion, getVersion, listVersions } from "../../../../../lib/resume.js";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const version = getVersion(params.id);
  if (!version) return NextResponse.json({ success: false, error: "No such version." }, { status: 404 });
  return NextResponse.json({ success: true, version });
}

export async function DELETE(_request, { params }) {
  deleteVersion(params.id);
  return NextResponse.json({ success: true, versions: listVersions() });
}
