// requirements.js
// Asks AI to read a posting's requirements and say, for each one, whether
// you meet it, based on your eligibility facts and resume. Pure: builds the
// prompt and tidies the reply; the route sends it through lib/ai.js.

const clip = (s, n) => String(s || "").trim().slice(0, n);

export const REQUIREMENTS_SYSTEM = [
  "You screen job postings for a candidate.",
  "List the posting's real requirements (must-haves first, then nice-to-haves): work authorization or location, degree and graduation timing, years of experience, specific skills or tools, certifications, languages.",
  "For each, judge from the candidate facts and resume only: meets, missing, or unclear. Never assume a skill the resume doesn't show.",
  "Be brief and concrete.",
].join(" ");

export function requirementsPrompt({ job, posting, resumeText }, facts = {}) {
  return [
    `ROLE: ${job.title || ""} at ${job.company || ""}${job.location ? ` (${job.location})` : ""}`,
    `POSTING:\n${clip(posting, 7000) || "(no posting text available)"}`,
    `CANDIDATE FACTS:\n${JSON.stringify(facts, null, 1)}`,
    `RESUME:\n${clip(resumeText, 5000)}`,
    `Reply as JSON: {"verdict": "likely eligible" | "some gaps" | "not eligible", "summary": "<one sentence>", "requirements": [{"requirement": "<short>", "mustHave": true|false, "status": "meets" | "missing" | "unclear", "why": "<short reason>"}]}`,
  ].join("\n\n");
}

const STATUSES = new Set(["meets", "missing", "unclear"]);
const VERDICTS = new Set(["likely eligible", "some gaps", "not eligible"]);

// Keeps only well-formed items; must-haves first, then missing, unclear, met.
export function tidyRequirements(reply) {
  const items = (Array.isArray(reply?.requirements) ? reply.requirements : [])
    .filter((r) => r && typeof r.requirement === "string" && r.requirement.trim())
    .map((r) => ({
      requirement: clip(r.requirement, 160),
      mustHave: r.mustHave !== false,
      status: STATUSES.has(r.status) ? r.status : "unclear",
      why: clip(r.why, 240),
    }));
  const rank = { missing: 0, unclear: 1, meets: 2 };
  items.sort((a, b) => b.mustHave - a.mustHave || rank[a.status] - rank[b.status]);
  return {
    verdict: VERDICTS.has(reply?.verdict) ? reply.verdict : items.some((r) => r.mustHave && r.status === "missing") ? "some gaps" : "likely eligible",
    summary: clip(reply?.summary, 300),
    requirements: items.slice(0, 20),
  };
}
