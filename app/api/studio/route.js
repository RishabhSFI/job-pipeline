// app/api/studio/route.js
// Everything Resume Studio needs on load: the base resume, the saved
// versions, the tracks and the keyword vocabulary.

import { NextResponse } from "next/server";
import { loadBaseResume, listVersions } from "../../../lib/resume.js";
import { PROFILE, TRACKS, DEFAULT_TRACK } from "../../../lib/profile.js";
import { loadJson } from "../../../lib/loadJson.js";
import { vocabulary } from "../../../lib/keywords.js";
import { skillTerms } from "../../../lib/studio.js";
import { aiAvailable } from "../../../lib/ai.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keywords = loadJson(import.meta.url, "../../../config/keywords.json");
    return NextResponse.json({
      success: true,
      base: loadBaseResume(),
      versions: listVersions(),
      tracks: Object.entries(TRACKS).map(([key, t]) => ({ key, label: t.label, isDefault: key === DEFAULT_TRACK })),
      vocab: vocabulary(PROFILE, keywords),
      skillTerms: [...skillTerms(PROFILE, keywords)],
      ai: aiAvailable(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
