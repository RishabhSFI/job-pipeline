"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_FILTERS,
  ELIGIBILITY_KINDS,
  SORTS,
  activeFilterCount,
  facetCounts,
} from "../lib/jobFilters.js";
import { statusLabel } from "../lib/board.js";

const SHOWN = 8;

// A pick-several list with a count per option. Long lists get a search box.
function Facet({ title, options, picked, onToggle, label = (v) => v }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const matching = options.filter((o) => !q || label(o.value).toLowerCase().includes(q));
  const shown = all || q ? matching : matching.slice(0, SHOWN);
  return (
    <fieldset className="facet">
      <legend>{title}</legend>
      {options.length > SHOWN && (
        <input
          type="search"
          className="facetSearch"
          placeholder={`Find a ${title.toLowerCase()}`}
          aria-label={`Find a ${title.toLowerCase()}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="facetList">
        {shown.map((o) => (
          <label key={o.value} className={`facetOption ${o.count === 0 ? "zero" : ""}`}>
            <input type="checkbox" checked={picked.includes(o.value)} onChange={() => onToggle(o.value)} />
            <span className="facetLabel">{label(o.value)}</span>
            <span className="facetCount">{o.count}</span>
          </label>
        ))}
        {!shown.length && <span className="facetEmpty">No matches</span>}
      </div>
      {!q && matching.length > SHOWN && (
        <button type="button" className="linkBtn" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${matching.length}`}
        </button>
      )}
    </fieldset>
  );
}

// Search, sort, the Filters panel, and a chip for every filter in use.
export default function FilterPanel({ jobs, filters, setFilters, tracks, regions }) {
  const [open, setOpen] = useState(false);
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  const facets = useMemo(
    () =>
      Object.fromEntries(
        ["companies", "places", "eligibility", "statuses"].map((k) => [k, facetCounts(jobs, filters, k, { regions })]),
      ),
    [jobs, filters, regions],
  );
  const active = activeFilterCount(filters);

  const chips = [
    ...filters.companies.map((v) => ({ text: v, clear: () => toggle("companies", v) })),
    ...filters.places.map((v) => ({ text: v, clear: () => toggle("places", v) })),
    ...filters.eligibility.map((v) => ({ text: ELIGIBILITY_KINDS[v], clear: () => toggle("eligibility", v) })),
    ...filters.statuses.map((v) => ({ text: statusLabel(v), clear: () => toggle("statuses", v) })),
    ...(filters.include ? [{ text: `Title has ${filters.include}`, clear: () => set("include", "") }] : []),
    ...(filters.exclude ? [{ text: `Title without ${filters.exclude}`, clear: () => set("exclude", "") }] : []),
    ...(filters.favourites ? [{ text: "Favourites only", clear: () => set("favourites", false) }] : []),
    ...(filters.type !== "all" ? [{ text: filters.type, clear: () => set("type", "all") }] : []),
    ...(filters.posted !== "any" ? [{ text: `Posted in ${filters.posted}`, clear: () => set("posted", "any") }] : []),
    ...(filters.location !== "all" ? [{ text: { canada: "Canada", us: "US", remote: "Remote" }[filters.location], clear: () => set("location", "all") }] : []),
    ...(filters.track !== "all" ? [{ text: tracks[filters.track]?.label || filters.track, clear: () => set("track", "all") }] : []),
  ];

  return (
    <div className="filters">
      <div className="filterTop">
        <input
          type="search"
          className="filterSearch"
          aria-label="Search role or company"
          placeholder="Search role or company"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
        <button
          type="button"
          className={`ghostBtn ${open || active ? "filterOn" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Filters{active ? ` · ${active}` : ""}
        </button>
        <select aria-label="Sort" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
          {Object.entries(SORTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="filterPanel">
          <fieldset className="facet">
            <legend>Basics</legend>
            <div className="facetSelects">
              <select aria-label="Job type" value={filters.type} onChange={(e) => set("type", e.target.value)}>
                <option value="all">Any type</option>
                <option value="Internship">Internship</option>
                <option value="Full-time">Full-time</option>
              </select>
              <select aria-label="Posted" value={filters.posted} onChange={(e) => set("posted", e.target.value)}>
                <option value="any">Posted any time</option>
                <option value="24h">Last 24 hours</option>
                <option value="48h">Last 48 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
              <select aria-label="Region" value={filters.location} onChange={(e) => set("location", e.target.value)}>
                <option value="all">Any region</option>
                <option value="canada">Canada</option>
                <option value="us">US</option>
                <option value="remote">Remote</option>
              </select>
              <select aria-label="Track" value={filters.track} onChange={(e) => set("track", e.target.value)}>
                <option value="all">Any track</option>
                {Object.entries(tracks).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="facetOption">
              <input type="checkbox" checked={filters.favourites} onChange={(e) => set("favourites", e.target.checked)} />
              <span className="facetLabel">Favourites only</span>
            </label>
          </fieldset>

          <fieldset className="facet">
            <legend>Title words</legend>
            <input
              className="facetSearch"
              aria-label="Title has any of these words"
              placeholder="Has any of: analyst, associate"
              value={filters.include}
              onChange={(e) => set("include", e.target.value)}
            />
            <input
              className="facetSearch"
              aria-label="Title has none of these words"
              placeholder="Has none of: senior, mba"
              value={filters.exclude}
              onChange={(e) => set("exclude", e.target.value)}
            />
          </fieldset>

          <Facet title="Eligibility" options={facets.eligibility} picked={filters.eligibility} onToggle={(v) => toggle("eligibility", v)} label={(v) => ELIGIBILITY_KINDS[v] || v} />
          <Facet title="Status" options={facets.statuses} picked={filters.statuses} onToggle={(v) => toggle("statuses", v)} label={statusLabel} />
          <Facet title="Company" options={facets.companies} picked={filters.companies} onToggle={(v) => toggle("companies", v)} />
          <Facet title="Place" options={facets.places} picked={filters.places} onToggle={(v) => toggle("places", v)} />
        </div>
      )}

      {chips.length > 0 && (
        <div className="chipRow">
          {chips.map((c) => (
            <button key={c.text} type="button" className="filterChip" onClick={c.clear} aria-label={`Remove filter ${c.text}`}>
              {c.text} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            type="button"
            className="linkBtn"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, search: filters.search })}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
