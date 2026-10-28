// greenhouse.js
// Public per-company JSON endpoint, no auth. Reads company slugs from config/companies.json.

import { fetchBoards, makeJob, toIso } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

export function fetchGreenhouse() {
  return fetchBoards(
    companies.greenhouse || [],
    API_TEMPLATE,
    (data, slug) =>
      data.jobs.map((item) =>
        makeJob({
          title: item.title || "",
          company: slug,
          location: item.location?.name || "",
          employmentType: "",
          link: item.absolute_url || "",
          description: item.content || "",
          source: "greenhouse",
          postedAt: toIso(item.first_published || item.updated_at),
        }),
      ),
    { content: "true" },
  );
}
