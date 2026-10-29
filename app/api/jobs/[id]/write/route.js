// app/api/jobs/[id]/write/route.js
// POST { kind: "cover" | "why" }: draft text with AI, only on an explicit
// click. The draft is saved to data/drafts/<id>.json.

import { NextResponse } from "next/server";
import { generate, aiRoute } from "../../../../../lib/ai.js";
import { loadContext } from "../../../../../lib/jobContext.js";
import { SYSTEM, coverLetterPrompt, whyCompanyPrompt, whyFirmSentencePrompt, fillBaseLetter } from "../../../../../lib/writing.js";
import { readJson, writeJson } from "../../../../../lib/store.js";

export const maxDuration = 60;
const PROMPTS = { cover: coverLetterPrompt, why: whyCompanyPrompt };

// Base-letter mode (coverLetterBase in the apply kit): the letter is the
// person's own text; AI only writes the {why} sentence.
async function fromBaseLetter(ctx) {
  const base = ctx.kit.coverLetterBase.trim();
  if (!base) {
    throw Object.assign(
      new Error("Cover letters use your base letter, which is still empty. Write it in config/applyKit.json under coverLetterBase, using {company}, {role}, {why}, {summary} and {name}."),
      { code: "NO_BASE" },
    );
  }
  const why = base.includes("{why}") ? await generate({ system: SYSTEM, prompt: whyFirmSentencePrompt(ctx.ai) }) : "";
  const name = (ctx.kit.profile || []).find((p) => p.label === "Full name")?.value || "";
  const summary = ctx.kit.summaries?.[ctx.ai.trackKey] || "";
  return fillBaseLetter(base, { company: ctx.row.Company, role: ctx.row["Role Title"], why, summary, name });
}

export async function POST(request, { params }) {
  const { kind } = await request.json().catch(() => ({}));
  if (!PROMPTS[kind]) return NextResponse.json({ ok: false, code: "BAD_KIND", error: "kind must be cover or why" }, { status: 400 });
  const result = await aiRoute(async () => {
    const ctx = await loadContext(params.id);
    if (!ctx) throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
    const text = kind === "cover" && typeof ctx.kit.coverLetterBase === "string"
      ? await fromBaseLetter(ctx)
      : await generate({ system: SYSTEM, prompt: PROMPTS[kind](ctx.ai) });
    const drafts = readJson(`drafts/${params.id}`, {});
    drafts[kind] = { text, generatedAt: new Date().toISOString() };
    writeJson(`drafts/${params.id}`, drafts);
    return { text, draft: drafts[kind] };
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 422 });
}
