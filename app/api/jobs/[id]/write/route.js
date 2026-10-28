// app/api/jobs/[id]/write/route.js
// POST { kind: "cover" | "why" }: draft text with AI, only on an explicit
// click. The draft is saved to data/drafts/<id>.json.

import { NextResponse } from "next/server";
import { generate, aiRoute } from "../../../../../lib/ai.js";
import { loadContext } from "../../../../../lib/jobContext.js";
import { SYSTEM, coverLetterPrompt, whyCompanyPrompt } from "../../../../../lib/writing.js";
import { readJson, writeJson } from "../../../../../lib/store.js";

export const maxDuration = 60;
const PROMPTS = { cover: coverLetterPrompt, why: whyCompanyPrompt };

export async function POST(request, { params }) {
  const { kind } = await request.json().catch(() => ({}));
  if (!PROMPTS[kind]) return NextResponse.json({ ok: false, code: "BAD_KIND", error: "kind must be cover or why" }, { status: 400 });
  const result = await aiRoute(async () => {
    const ctx = await loadContext(params.id);
    if (!ctx) throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
    const text = await generate({ system: SYSTEM, prompt: PROMPTS[kind](ctx.ai) });
    const drafts = readJson(`drafts/${params.id}`, {});
    drafts[kind] = { text, generatedAt: new Date().toISOString() };
    writeJson(`drafts/${params.id}`, drafts);
    return { text, draft: drafts[kind] };
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 422 });
}
