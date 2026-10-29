// ai.js
// Talks to Google's Gemini API (free tier) with your own key from
// GEMINI_API_KEY in .env.local. Get one at https://aistudio.google.com.
//
// Model names change often, so none is hardcoded: GEMINI_MODEL wins if set,
// otherwise the free Flash models your key can use are tried fastest-first,
// skipping any that are overloaded, retired or slow, and the one that works is
// remembered in data/ai-model.json.

import { readJson, writeJson } from "./store.js";
import { loadApplyKit } from "./applyKit.js";

const API = "https://generativelanguage.googleapis.com/v1beta";

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const NO_KEY = new AiError(
  "NO_KEY",
  "AI writing needs a free Gemini key. Get one at https://aistudio.google.com (Get API key), then run npm run setup or add GEMINI_API_KEY to .env.local.",
);

export function aiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

// Free Flash models in the order to try them: fast "lite" models first (they
// answer in seconds; the bigger ones can take minutes or be overloaded on the
// free tier), newest first, previews last. Pure, so it can be tested.
export function rankModels(names) {
  const version = (n) => parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) || [])[1] || "0");
  return names
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|thinking|embedding)/.test(n))
    .sort(
      (a, b) =>
        /preview|exp/.test(a) - /preview|exp/.test(b) ||
        /lite/.test(b) - /lite/.test(a) ||
        version(b) - version(a),
    );
}

const RELIST_MS = 7 * 86_400_000;

// Models to try, best first: the one that last worked, then the ranked list
// (fetched from Google at most once a week). GEMINI_MODEL overrides all this.
async function candidateModels(key) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  let state = readJson("ai-model") || {};
  if (!state.models?.length || Date.now() - Date.parse(state.listedAt || 0) > RELIST_MS) {
    const res = await fetch(`${API}/models?key=${key}&pageSize=200`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw await toAiError(res);
    const names = ((await res.json()).models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
    state = { ...state, models: rankModels(names), listedAt: new Date().toISOString() };
    writeJson("ai-model", state);
  }
  if (!state.models.length) throw new AiError("NO_MODEL", "Your Gemini key has no Flash model available.");
  return [...new Set([state.working, ...state.models].filter(Boolean))];
}

function rememberWorking(model) {
  writeJson("ai-model", { ...(readJson("ai-model") || {}), working: model, workedAt: new Date().toISOString() });
}

async function toAiError(res) {
  let detail = "";
  try {
    detail = (await res.json()).error?.message || "";
  } catch {}
  if (res.status === 429) {
    return new AiError("RATE_LIMIT", "You've used today's free Gemini allowance. It resets every day, so try again tomorrow.");
  }
  if (res.status === 400 && /API key/i.test(detail)) {
    return new AiError("BAD_KEY", "Your Gemini key isn't valid. Make a new one at https://aistudio.google.com.");
  }
  if (res.status === 403) {
    return new AiError("BAD_KEY", `Gemini refused the key: ${detail}`);
  }
  return new AiError("API", `Gemini error ${res.status}: ${detail}`);
}

// prompt: what you want. system: standing instructions.
// json: true asks for a JSON reply and parses it.
// files: [{ mimeType, data (base64) }] sent alongside, e.g. a resume PDF.
// Words and names from "neverMention" in config/applyKit.json (old employers,
// claims that aren't true). Every AI reply is checked against them.
function neverMention() {
  try {
    return (loadApplyKit().neverMention || []).filter((w) => typeof w === "string" && w.trim());
  } catch {
    return [];
  }
}

export function forbiddenIn(text, words) {
  const lower = String(text || "").toLowerCase();
  return words.find((w) => lower.includes(w.toLowerCase().trim())) || null;
}

export async function generate({ prompt, system = "", json = false, temperature = 0.6, files = [] }) {
  const key = process.env.GEMINI_API_KEY;
  const banned = neverMention();
  if (banned.length) {
    system = `${system}\nNever mention any of these, in any form: ${banned.join("; ")}.`.trim();
  }
  if (!key) throw NO_KEY;
  const call = async (model, signal) =>
    fetch(`${API}/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system && { systemInstruction: { parts: [{ text: system }] } }),
        contents: [
          {
            role: "user",
            parts: [
              ...files.map((f) => ({ inline_data: { mime_type: f.mimeType, data: f.data } })),
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature,
          ...(json && { responseMimeType: "application/json" }),
        },
      }),
    });
  // Try models in order. Overloaded, retired, slow or out-of-quota models are
  // skipped; a bad key stops at once.
  const ATTEMPTS = 4;
  const TIMEOUT_MS = 45000;
  let res;
  let lastError = null;
  for (const model of (await candidateModels(key)).slice(0, ATTEMPTS)) {
    try {
      res = await call(model, AbortSignal.timeout(TIMEOUT_MS));
    } catch {
      lastError = new AiError("SLOW", "Gemini took too long to answer. Try again in a minute.");
      continue;
    }
    if (res.ok) {
      rememberWorking(model);
      break;
    }
    const err = await toAiError(res);
    if (err.code === "BAD_KEY") throw err;
    lastError = err.code === "RATE_LIMIT" || !lastError ? err : lastError;
    res = null;
  }
  if (!res) throw lastError || new AiError("API", "No Gemini model answered. Try again later.");
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) throw new AiError("EMPTY", "Gemini returned nothing. Try again.");
  const hit = forbiddenIn(text, banned);
  if (hit) {
    throw new AiError("FORBIDDEN", `The draft mentioned "${hit}", which is on your never-mention list, so the app threw it away. Try again.`);
  }
  if (!json) return text;
  try {
    return JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    throw new AiError("BAD_JSON", "Gemini answered in the wrong format. Try again.");
  }
}

// Shape for API routes: { ok, ...result } or { ok: false, code, error }.
export async function aiRoute(fn) {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    return { ok: false, code: err.code || "ERROR", error: err.message };
  }
}
