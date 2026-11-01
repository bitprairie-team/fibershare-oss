// What a rancher records by hand: notes, alerts they add, and animals they
// marked as checked. None of it needs an automated job. Saved in this
// browser, one list per data source, so sample notes never mix with real ones.
import { ALERT_RULES } from "./alert-config.js";

export const LOG_TYPES = ["note", "alert", "checked"];
export const LOG_KEYS = { demo: "fs-log-demo", public: "fs-log-public", rancher: "fs-log-rancher" };
const LIMIT = 300;

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Check one entry before it is saved. Returns { ok, entry } or { ok: false, error }. */
export function normalizeEntry(input, { now = new Date().toISOString(), id } = {}) {
  if (!input || !LOG_TYPES.includes(input.type)) return { ok: false, error: "Unknown entry." };
  const text = clean(input.text, ALERT_RULES.noteMaxLength);
  if (input.type !== "checked" && !text) return { ok: false, error: input.type === "alert" ? "Say what needs attention." : "Write a note first." };
  const animalId = typeof input.animalId === "string" && /^[A-Za-z0-9._-]{1,60}$/.test(input.animalId) ? input.animalId : "";
  if (input.type !== "alert" && !animalId) return { ok: false, error: "Pick an animal first." };
  const entry = { id: id || Date.parse(now).toString(36) + Math.random().toString(36).slice(2, 6), type: input.type, text, at: now };
  if (animalId) entry.animalId = animalId;
  return { ok: true, entry };
}

export function createRanchLog(scope, { storage = globalThis.localStorage } = {}) {
  const key = LOG_KEYS[scope] || LOG_KEYS.demo;
  const read = () => {
    try {
      const list = JSON.parse(storage?.getItem(key) || "[]");
      return Array.isArray(list) ? list.filter((e) => e && LOG_TYPES.includes(e.type)) : [];
    } catch {
      return [];
    }
  };
  return {
    where: "Saved in this browser.",
    load: read,
    add(input, options) {
      const checked = normalizeEntry(input, options);
      if (!checked.ok) throw new Error(checked.error);
      const list = [...read(), checked.entry].slice(-LIMIT);
      try {
        storage?.setItem(key, JSON.stringify(list));
      } catch {
        throw new Error("This browser would not save it.");
      }
      return list;
    },
  };
}

/** Notes and checks for one animal, newest first. */
export function entriesFor(log, animalId) {
  return (log || []).filter((e) => e.animalId === animalId && e.type !== "alert").sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** The newest time the rancher marked this animal checked, or null. */
export function lastChecked(log, animalId) {
  return entriesFor(log, animalId).find((e) => e.type === "checked")?.at || null;
}
