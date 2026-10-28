// app/api/outreach/[cid]/send/route.js
// POST { subject, body, kind?, confirmed, confirmGuess? }: send one email to
// one contact through the app's Gmail SMTP. Refused unless confirmed is true,
// SMTP is configured and today's cap has room. Never bulk, never automatic.

import { NextResponse } from "next/server";
import { sendContact } from "../../../../../lib/outreach.js";

export const maxDuration = 30;

export async function POST(request, { params }) {
  const input = await request.json().catch(() => ({}));
  const result = await sendContact({
    id: params.cid,
    subject: String(input.subject || ""),
    body: String(input.body || ""),
    kind: input.kind === "followup" ? "followup" : "email",
    confirmed: input.confirmed,
    confirmGuess: input.confirmGuess,
  });
  const status = result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : result.code === "SEND_FAILED" ? 502 : result.code === "DAILY_CAP" ? 429 : 422;
  return NextResponse.json(result, { status });
}
