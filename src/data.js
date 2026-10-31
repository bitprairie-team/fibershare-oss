import { hideTrackerDetails, isLiveData } from "./live-format.js";

// The sample day ends here. "Last seen" times in sample mode count from it.
export const SAMPLE_NOW = "2026-09-06T18:05:00";
const SOURCE_KEY = "fs-source";
const HIDE_KEY = "fs-hide-trackers";

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(url + " returned " + response.status);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) throw new Error(url + " is not JSON");
  return response.json();
}

// The live file only exists on your own hardware, under npm run dev or
// npm run preview. A hosted copy never has it, so it does not ask.
function onOwnHardware() {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname);
}

async function loadLive() {
  if (!onOwnHardware()) return null;
  try {
    const data = await getJson("/live/live.json");
    return isLiveData(data) ? data : null;
  } catch {
    return null;
  }
}

export function preferSample() {
  try {
    return sessionStorage.getItem(SOURCE_KEY) === "sample";
  } catch {
    return false;
  }
}

export function setPreferSample(value) {
  try {
    if (value) sessionStorage.setItem(SOURCE_KEY, "sample");
    else sessionStorage.removeItem(SOURCE_KEY);
  } catch {
    // Private windows may block storage. The choice then lasts one page load.
  }
}

/** The "Hide tracker details" setting. On unless you turned it off. */
export function hideTrackers() {
  try {
    return localStorage.getItem(HIDE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setHideTrackers(value) {
  try {
    if (value) localStorage.removeItem(HIDE_KEY);
    else localStorage.setItem(HIDE_KEY, "0");
  } catch {
    // Without storage the setting stays on.
  }
}

/**
 * Place trackers that have a position on a small local map: metres east and
 * north of the middle of the group, scaled to fit the box. No map tiles and
 * no outside requests. Returns the span in metres, or null with no positions.
 */
export function localMap(animals) {
  const placed = animals.filter((a) => Number.isFinite(a.details?.position?.latitude));
  if (!placed.length) return null;
  const lat0 = placed.reduce((s, a) => s + a.details.position.latitude, 0) / placed.length;
  const lon0 = placed.reduce((s, a) => s + a.details.position.longitude, 0) / placed.length;
  const metres = (a) => ({
    e: (a.details.position.longitude - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111320,
    n: (a.details.position.latitude - lat0) * 110540,
  });
  const points = placed.map(metres);
  const half = Math.max(25, ...points.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n * 1.5))));
  placed.forEach((animal, i) => {
    animal.x = Math.round((50 + (points[i].e / half) * 42) * 10) / 10;
    animal.y = Math.round((50 - (points[i].n / half) * 42) * 10) / 10;
    animal.onMap = true;
  });
  return Math.round(half * 2);
}

function liveView(live) {
  const hide = hideTrackers();
  const exportHidden = live.hidden !== false;
  const privateView = !hide && !exportHidden;
  const shown = privateView ? structuredClone(live) : hideTrackerDetails(live);
  let events = shown.events;
  if (privateView) {
    const names = new Map(shown.animals.map((a) => [a.alias, a.details?.deviceName || a.alias]));
    events = events.map((event) => ({
      ...event,
      text: String(event.text).replace(/Tracker \d+(?!\d)/g, (alias) => names.get(alias) || alias),
    }));
  }
  const mapSpan = privateView ? localMap(shown.animals) : null;
  return { hide, exportHidden, privateView, mapSpan, animals: shown.animals, events, sources: shown.sources || ["rest"] };
}

/**
 * Load the herd and its events. Uses .local/live.json (served by the dev
 * server at /live/live.json) when it exists, otherwise the bundled samples.
 */
export async function loadHerd() {
  const live = await loadLive();
  if (live && !preferSample()) {
    return {
      mode: "live",
      liveAvailable: true,
      ranch: "Your trackers",
      ...liveView(live),
      generatedAt: live.generatedAt,
      now: live.generatedAt,
      windowHours: live.windowHours || 24,
    };
  }
  let herd = { ranch: "Sample herd", goats: [] };
  let events = { events: [] };
  let loadFailed = false;
  try {
    herd = await getJson("/data/herd.json");
  } catch {
    loadFailed = true;
  }
  try {
    events = await getJson("/data/events.json");
  } catch {
    events = { events: [] };
  }
  return {
    mode: "sample",
    liveAvailable: Boolean(live),
    loadFailed,
    ranch: herd.ranch || "Sample herd",
    animals: herd.goats || [],
    events: events.events || [],
    now: SAMPLE_NOW,
    windowHours: 12,
  };
}
