// Work out where each animal is, and what its tracker reported, at a point in
// the event feed. Used by the herd view and its day playback.
import { ALERT_RULES } from "./alert-config.js";


export function sortEvents(events) {
  return [...(events || [])].sort((a, b) => String(a.time).localeCompare(String(b.time)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * State after the first `count` events. Animals start at their first
 * positioned event, or at their own x and y when no event has a position.
 */
export function stateAt(animals, events, count, { uplinksStart = null, now = null } = {}) {
  const sorted = sortEvents(events);
  const upto = sorted.slice(0, Math.max(0, count));
  const byId = new Map();
  for (const animal of animals) {
    const first = sorted.find((event) => event.animalId === animal.id && Number.isFinite(event.x));
    byId.set(animal.id, {
      ...animal,
      x: first ? first.x : animal.x,
      y: first ? first.y : animal.y,
      battery: first && Number.isFinite(first.battery) ? first.battery : animal.battery,
      lastSeen: null,
      lastMoved: first ? first.time : animal.lastMoved || null,
      // Last event that carried a position. Hourly uplink counts update lastSeen
      // only, so not-moving alerts use lastFix and ignore those count-only bumps.
      lastFix: first ? first.time : animal.lastFix || null,
      silent: false,
      sos: false,
    });
  }
  const alerts = new Map();
  let smoke = false;
  for (const event of upto) {
    const animal = byId.get(event.animalId);
    if (animal) {
      if (Number.isFinite(event.x) && Number.isFinite(event.y)) {
        const prev = { x: animal.x, y: animal.y };
        animal.x = event.x;
        animal.y = event.y;
        animal.lastFix = event.time;
        const dist = Math.hypot(animal.x - prev.x, animal.y - prev.y);
        if (!animal.lastMoved || dist >= ALERT_RULES.stillDistance) animal.lastMoved = event.time;
      }
      if (Number.isFinite(event.battery)) animal.battery = event.battery;
      if (event.type === "checkin") {
        animal.lastSeen = event.time;
        animal.silent = false;
      }
      if (event.type === "silent") animal.silent = true;
      if (event.type === "sos") animal.sos = true;
    }
    if (event.type === "predator" && event.cell) alerts.set(event.cell, event);
    if (event.type === "predator-clear" && event.cell) alerts.delete(event.cell);
    if (event.type === "smoke") smoke = true;
    if (event.type === "smoke-clear") smoke = false;
  }
  if (upto.length >= sorted.length) {
    for (const animal of animals) {
      const state = byId.get(animal.id);
      if (!state.lastSeen && animal.lastSeen) state.lastSeen = animal.lastSeen;
      if (animal.silent) state.silent = true;
    }
  }
  // The sample day also has hourly uplink counts. Use them so "last check-in"
  // moves on between the check-ins the event feed lists.
  if (uplinksStart && now) {
    for (const state of byId.values()) {
      if (!state.lastSeen) continue;
      const heard = heardBy(state.uplinks, uplinksStart, now);
      if (heard && Date.parse(heard) > Date.parse(state.lastSeen)) state.lastSeen = heard;
    }
  }
  return { animals: [...byId.values()], alertCells: [...alerts.keys()], smoke, shown: upto };
}

function localIso(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":00";
}

/**
 * The latest uplink at or before `now`, from hourly counts that start at
 * `startIso` (index 0 covers the first hour). Uplinks in an hour are spread
 * evenly across it. Returns a local ISO time, or null.
 */
export function heardBy(uplinks, startIso, now) {
  const start = Date.parse(startIso);
  const end = Date.parse(now);
  if (!Array.isArray(uplinks) || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  let best = null;
  uplinks.forEach((count, i) => {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    for (let k = 0; k < n; k++) {
      const t = start + i * 3600000 + Math.round(((k + 1) * 3600000) / (n + 1));
      if (t <= end && (best === null || t > best)) best = t;
    }
  });
  return best === null ? null : localIso(best);
}

/**
 * Steps worth jumping to in the sample day: each alert just before it
 * clears, so the grid shows the alert and what the herd did about it.
 * Returns [{ id, label, step, time }] in time order.
 */
export function keyMoments(events) {
  const sorted = sortEvents(events);
  const out = [];
  const add = (id, label, startType, clearType) => {
    const start = sorted.findIndex((e) => e.type === startType);
    if (start < 0) return;
    const clear = sorted.findIndex((e, i) => i > start && e.type === clearType && (!sorted[start].cell || e.cell === sorted[start].cell));
    const step = clear > start ? clear : start + 1;
    out.push({ id, label, step, time: sorted[start].time });
  };
  add("smoke", "Smoke", "smoke", "smoke-clear");
  add("predator", "Predator", "predator", "predator-clear");
  return out.sort((a, b) => a.step - b.step);
}

/**
 * The few numbers the herd view shows above the paddock. At most three, so
 * the page stays easy to scan in a live demo.
 * animals: [{ lastSeen }], openAlerts: count, nowMs: the clock to measure from.
 * Returns [{ id, value, label, warn }]; value for "last" is an ISO time or "".
 */
export function herdStats({ animals = [], openAlerts = 0, nowMs = Date.now() } = {}) {
  const seen = animals.map((a) => (a.lastSeen ? new Date(a.lastSeen).getTime() : NaN)).filter(Number.isFinite);
  const reporting = seen.filter((t) => t <= nowMs && nowMs - t <= 3600000).length;
  const latest = animals
    .filter((a) => a.lastSeen && new Date(a.lastSeen).getTime() <= nowMs)
    .map((a) => a.lastSeen)
    .sort()
    .pop();
  return [
    { id: "reporting", value: reporting + " of " + animals.length, label: "reporting in the last hour", warn: reporting < animals.length },
    { id: "open", value: String(openAlerts), label: openAlerts === 1 ? "open alert" : "open alerts", warn: openAlerts > 0 },
    { id: "last", value: latest || "", label: "last check-in", warn: false },
  ];
}
