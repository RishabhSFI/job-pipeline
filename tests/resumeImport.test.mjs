import { test } from "node:test";
import assert from "node:assert/strict";
import { importPrompt } from "../lib/resumeImport.js";

test("the resume import asks for the user's real content only, in the template's shape", () => {
  const prompt = importPrompt({ name: "Your Name", sections: [] }, ["startup", "finance"]);
  assert.match(prompt, /Never add, invent, embellish or drop facts/);
  assert.match(prompt, /\[startup, finance\]/);
  assert.match(prompt, /"name": "Your Name"/);
});
