// profile.js
// Loads config/profile.json once. Every CV filename and CV label in the app
// comes from here.

import { loadJson } from "./loadJson.js";

export const PROFILE = loadJson(import.meta.url, "../config/profile.json");

export const TRACKS = PROFILE.tracks;

export const DEFAULT_TRACK =
  Object.keys(TRACKS).find((key) => TRACKS[key].isDefault) ||
  Object.keys(TRACKS)[0];

export function isTrackKey(trackKey) {
  return Object.hasOwn(TRACKS, trackKey);
}

export function resumeFileFor(trackKey) {
  const track = TRACKS[isTrackKey(trackKey) ? trackKey : DEFAULT_TRACK];
  return PROFILE.resumes[track.resume];
}

export function trackLabel(trackKey) {
  return isTrackKey(trackKey) ? TRACKS[trackKey].label : trackKey;
}
