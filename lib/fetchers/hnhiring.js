// hnhiring.js
// The latest Hacker News "Ask HN: Who is hiring?" thread, read through the
// free Algolia HN API. Posts are mostly from small startups and start with a
// header like "Acme | Founding Engineer, BizOps Lead | NYC | Onsite".
// Most roles there are engineering, so a post is kept only when a header
// segment names one of your tracks, and that segment becomes the title.

import { safeGet, makeJob, toIso } from "./base.js";
import { TRACKS } from "../profile.js";

const API = "https://hn.algolia.com/api/v1";
const TITLE_KEYWORDS = Object.values(TRACKS).flatMap((t) => t.titleKeywords);

function stripHtml(html) {
  return html
    .replace(/<p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function roleSegment(segments) {
  return segments.find((seg) => {
    const s = seg.toLowerCase();
    return TITLE_KEYWORDS.some((kw) => s.includes(kw));
  });
}

export async function fetchHNHiring() {
  const search = await safeGet(`${API}/search_by_date`, {
    tags: "story,author_whoishiring",
    hitsPerPage: 5,
  });
  if (!search) return [];
  const thread = (await search.json()).hits.find((h) =>
    /who is hiring/i.test(h.title || ""),
  );
  if (!thread) return [];

  const res = await safeGet(`${API}/items/${thread.objectID}`);
  if (!res) return [];
  const jobs = [];
  for (const post of (await res.json()).children || []) {
    if (!post.text) continue;
    const text = stripHtml(post.text);
    const header = text.split("\n")[0];
    const segments = header.split("|").map((s) => s.trim());
    if (segments.length < 2) continue;
    const role = roleSegment(segments.slice(1));
    if (!role) continue;
    jobs.push(
      makeJob({
        title: role,
        company: segments[0],
        location: segments.slice(1).filter((s) => s !== role).join(" | "),
        link: `https://news.ycombinator.com/item?id=${post.id}`,
        description: text,
        source: "hnhiring",
        postedAt: toIso(post.created_at),
      }),
    );
  }
  return jobs;
}
