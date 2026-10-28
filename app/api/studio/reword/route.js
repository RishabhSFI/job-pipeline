// app/api/studio/reword/route.js
// POST { text, entry, resume, keywords, job, description } asks Gemini for
// 2-3 truthful rewrites of one bullet. Replies { ok, options } or
// { ok: false, code, error } (code NO_KEY when no Gemini key is set).

import { NextResponse } from "next/server";
import { aiRoute, generate } from "../../../../lib/ai.js";
import { rewordPrompt, cleanRewordOptions } from "../../../../lib/studioPrompt.js";
import { isResume } from "../../../../lib/studio.js";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.text !== "string" || !body.text.trim() || !isResume(body.resume)) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST", error: "Nothing to reword." }, { status: 400 });
  }
  const result = await aiRoute(async () => {
    const reply = await generate({ ...rewordPrompt(body), json: true, temperature: 0.7 });
    const options = cleanRewordOptions(reply, body.text);
    if (!options.length) throw Object.assign(new Error("No usable rewrites came back. Try again."), { code: "EMPTY" });
    return { options };
  });
  return NextResponse.json(result);
}
