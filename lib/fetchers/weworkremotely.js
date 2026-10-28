// weworkremotely.js
// Public RSS feeds, no auth. Category feeds for management, finance and everything else.

import Parser from "rss-parser";
import { makeJob } from "./base.js";

const parser = new Parser();

const FEEDS = {
  managementFinance: "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss",
  allOther: "https://weworkremotely.com/categories/all-other-remote-jobs.rss",
};

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
        }));
      }
    } catch (err) {
      console.warn(`[weworkremotely] feed ${category} failed: ${err.message}`);
    }
  }
  return jobs;
}
