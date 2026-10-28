"use client";

import config from "../config/xSearches.json";

function xSearchUrl(query, popular) {
  const parts = [query, config.always];
  if (popular) parts.push(`min_faves:${config.popularMinLikes}`);
  const q = encodeURIComponent(parts.filter(Boolean).join(" "));
  return `https://x.com/search?q=${q}&src=typed_query&f=${popular ? "top" : "live"}`;
}

export default function XSearches() {
  return (
    <>
      <p className="xIntro">
        Hiring posts on X, one click each. Latest shows everything newest
        first. Popular only shows posts with {config.popularMinLikes}+ likes,
        which cuts the spam. When a founder posts a role, reply or DM them
        directly: that is the point of finding it on X.
      </p>
      <div className="panel">
        {config.searches.map((s) => (
          <div className="jobRow" key={s.label}>
            <div className="jobMain">
              <p className="jobTitle">{s.label}</p>
              <div className="jobCompany">
                <span className="location">{s.why}</span>
              </div>
            </div>
            <div className="jobActions">
              <a
                className="actionBtn primary"
                href={xSearchUrl(s.query, false)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Latest
              </a>
              <a
                className="actionBtn"
                href={xSearchUrl(s.query, true)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Popular
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
