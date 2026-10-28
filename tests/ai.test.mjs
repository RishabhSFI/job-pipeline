import { test } from "node:test";
import assert from "node:assert/strict";
import { rankModels } from "../lib/ai.js";

test("fast lite models are tried first, previews last, image and audio models never", () => {
  const ranked = rankModels([
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-preview-tts",
    "gemini-3.1-pro",
  ]);
  assert.deepEqual(ranked, [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3-flash-preview",
  ]);
});
