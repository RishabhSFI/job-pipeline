// jobId.js
// A short, stable id for a job, made from its link. Sheet row numbers change
// when rows are cleared, links don't. Works in the browser and in Node.

export function normalizeLink(link) {
  return String(link || "")
    .split("?")[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

// FNV-1a, 52 bits, base 36: short, URL-safe, no crypto dependency.
export function jobId(link) {
  let h = 0xcbf29ce484222325n;
  for (const ch of normalizeLink(link)) {
    h ^= BigInt(ch.codePointAt(0));
    h = (h * 0x100000001b3n) & 0xfffffffffffffn;
  }
  return h.toString(36);
}
