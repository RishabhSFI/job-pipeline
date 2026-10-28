// app/api/outreach/[cid]/route.js
// PATCH: edit a contact (details, drafts, status). DELETE: remove it.

import { NextResponse } from "next/server";
import { updateContact, deleteContact } from "../../../../lib/outreach.js";

export async function PATCH(request, { params }) {
  try {
    const contact = updateContact(params.cid, await request.json());
    if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ success: true, contact });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const ok = deleteContact(params.cid);
  return NextResponse.json({ success: ok, ...(ok ? {} : { error: "Contact not found" }) }, { status: ok ? 200 : 404 });
}
