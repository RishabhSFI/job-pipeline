// app/api/studio/posting/route.js
// The posting text for a job: /api/studio/posting?id=<jobId>&link=<url>
// Uses the text saved by the daily run; for older jobs, reads the job page.
// The link must belong to the job id, so this can't fetch arbitrary pages.

import { NextResponse } from "next/server";
import { getPosting, fetchPostingText } from "../../../../lib/postings.js";
import { jobId } from "../../../../lib/jobId.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const link = params.get("link") || "";
  const saved = id && getPosting(id);
  if (saved?.description) return NextResponse.json({ success: true, source: "saved", description: saved.description });
  if (!/^https?:\/\//i.test(link) || jobId(link) !== id) {
    return NextResponse.json({ success: true, source: "none", description: "" });
  }
  const description = await fetchPostingText(link).catch(() => "");
  return NextResponse.json({ success: true, source: description ? "fetched" : "none", description });
}
