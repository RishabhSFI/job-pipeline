// app/api/outreach/[cid]/draft/route.js
// POST { kind: "email" | "note" | "followup" }: AI draft for one contact,
// only on an explicit click. Saved on the contact.

import { NextResponse } from "next/server";
import { generate, aiRoute } from "../../../../../lib/ai.js";
import { loadContext } from "../../../../../lib/jobContext.js";
import { listContacts, updateContact, dayKey } from "../../../../../lib/outreach.js";
import { SYSTEM, outreachEmailPrompt, linkedinNotePrompt, followUpPrompt, parseEmailDraft, parseNote } from "../../../../../lib/writing.js";

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { kind } = await request.json().catch(() => ({}));
  if (!["email", "note", "followup"].includes(kind)) {
    return NextResponse.json({ ok: false, code: "BAD_KIND", error: "kind must be email, note or followup" }, { status: 400 });
  }
  const result = await aiRoute(async () => {
    const contact = listContacts().find((c) => c.id === params.cid);
    if (!contact) throw Object.assign(new Error("Contact not found"), { code: "NOT_FOUND" });
    const ctx = await loadContext(contact.jobId);
    if (!ctx) throw Object.assign(new Error("The job for this contact is no longer in your sheet."), { code: "NOT_FOUND" });
    if (kind === "note") {
      const noteDraft = parseNote(await generate({ system: SYSTEM, prompt: linkedinNotePrompt(ctx.ai, contact) }));
      return { contact: updateContact(contact.id, { noteDraft }) };
    }
    if (kind === "email") {
      const emailDraft = parseEmailDraft(await generate({ system: SYSTEM, json: true, prompt: outreachEmailPrompt(ctx.ai, contact) }));
      return { contact: updateContact(contact.id, { emailDraft }) };
    }
    if (!contact.lastEmail) throw Object.assign(new Error("Send the first email before drafting a follow-up."), { code: "NO_PREVIOUS" });
    const prompt = followUpPrompt(ctx.ai, contact, { sentOn: dayKey(new Date(contact.sentAt)), previous: contact.lastEmail.body });
    const followUpDraft = parseEmailDraft(await generate({ system: SYSTEM, json: true, prompt }));
    return { contact: updateContact(contact.id, { followUpDraft }) };
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 422 });
}
