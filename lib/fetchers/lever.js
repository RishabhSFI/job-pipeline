// lever.js
// Public per-company JSON endpoint, no auth. Reads company slugs from config/companies.json.

import { fetchBoards, makeJob, toIso } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://api.lever.co/v0/postings/${slug}`;

export function fetchLever() {
  return fetchBoards(
    companies.lever || [],
    API_TEMPLATE,
    (data, slug) =>
      data.map((item) => {
        const categories = item.categories || {};
        return makeJob({
          title: item.text || "",
          company: slug,
          location: categories.location || "",
          employmentType: categories.commitment || "",
          link: item.hostedUrl || "",
          description: item.descriptionPlain || item.description || "",
          source: "lever",
          postedAt: toIso(item.createdAt),
        });
      }),
    { mode: "json" },
  );
}
