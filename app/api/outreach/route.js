// app/api/outreach/route.js
// GET: every contact plus send settings. POST: add a contact.

import { NextResponse } from "next/server";
import { listContacts, addContact, outreachStatus, smtpStatus } from "../../../lib/outreach.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    contacts: listContacts(),
    outreach: { ...outreachStatus(), smtp: smtpStatus(process.env) },
  });
}

export async function POST(request) {
  try {
    return NextResponse.json({ success: true, contact: addContact(await request.json()) });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
