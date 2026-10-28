// weworkremotely.js
// Public RSS feeds, no auth. Which category feeds to read is
// search.weworkremotelyFeeds in config/profile.json.

import Parser from "rss-parser";
import { makeJob, toIso } from "./base.js";
import { PROFILE } from "../profile.js";

const parser = new Parser();

const FEEDS = Object.fromEntries(
  (PROFILE.search?.weworkremotelyFeeds || []).map((slug) => [
    slug,
    `https://weworkremotely.com/categories/${slug}.rss`,
  ]),
);

export async function fetchWeWorkRemotely() {
  const jobs = [];

  for (const [category, url] of Object.entries(FEEDS)) {
    try {
      const feed = await parser.parseURL(url);
      for (const entry of feed.items || []) {
        const titleRaw = entry.title || "";
        let company = "";
        let title = titleRaw;
        if (titleRaw.includes(":")) {
          [company, title] = titleRaw.split(":", 2).map((s) => s.trim());
        }
        jobs.push(makeJob({
          title,
          company,
          location: "Remote",
          employmentType: "",
          link: entry.link || "",
          description: entry.contentSnippet || entry.content || "",
          source: "weworkremotely",
          postedAt: toIso(entry.isoDate || entry.pubDate),
        }));
      }
    } catch (err) {
      console.warn(`[weworkremotely] feed ${category} failed: ${err.message}`);
    }
  }
  return jobs;
}
