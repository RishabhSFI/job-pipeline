// app/api/jobs/[id]/requirements/route.js
// GET: the last AI requirements check for this job, if any.
// POST: run a new check (one Gemini request, only on an explicit click).
// Saved in data/requirements/<id>.json.

import { NextResponse } from "next/server";
import { generate, aiRoute } from "../../../../../lib/ai.js";
import { loadContext } from "../../../../../lib/jobContext.js";
import { REQUIREMENTS_SYSTEM, requirementsPrompt, tidyRequirements } from "../../../../../lib/requirements.js";
import { readJson, writeJson } from "../../../../../lib/store.js";

export const maxDuration = 60;

export async function GET(_request, { params }) {
  return NextResponse.json({ ok: true, check: readJson(`requirements/${params.id}`) });
}

export async function POST(_request, { params }) {
  const result = await aiRoute(async () => {
    const ctx = await loadContext(params.id);
    if (!ctx) throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
    const reply = await generate({
      system: REQUIREMENTS_SYSTEM,
      prompt: requirementsPrompt(ctx.ai, ctx.kit.eligibility || {}),
      json: true,
      temperature: 0.2,
    });
    const check = { ...tidyRequirements(reply), checkedAt: new Date().toISOString() };
    writeJson(`requirements/${params.id}`, check);
    return { check };
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 422 });
}
