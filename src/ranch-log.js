// What a rancher records by hand: notes, alerts they add, and animals they
// marked as checked. None of it needs an automated job.
// - Sample data and the public live view: this browser, one list per data
//   source, so sample notes never mix with real ones.
// - A signed-in rancher looking at real data: the server, at /api/log,
//   behind the same sign-in check as the real data and /api/alerts.
import { ALERT_RULES } from "./alert-config.js";
import { timeOf } from "./time.js";

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
export function normalizeEntry(input, { now = new Date().toISOString(), id, author: optionsAuthor } = {}) {
  if (!input || !LOG_TYPES.includes(input.type)) return { ok: false, error: "Unknown entry." };
  const text = clean(input.text, ALERT_RULES.noteMaxLength);
  if (input.type !== "checked" && !text) return { ok: false, error: input.type === "alert" ? "Say what needs attention." : "Write a note first." };
  const animalId = typeof input.animalId === "string" && /^[A-Za-z0-9._-]{1,60}$/.test(input.animalId) ? input.animalId : "";
  if (input.type !== "alert" && !animalId) return { ok: false, error: "Pick an animal first." };
  const entry = { id: id || Date.parse(now).toString(36) + Math.random().toString(36).slice(2, 6), type: input.type, text, at: now };
  if (animalId) entry.animalId = animalId;
  // Author is set only by the server from the verified sign-in, never from the client body.
  const author = clean(optionsAuthor, 120);
  if (author) entry.author = author;
  return { ok: true, entry };
}

function serverLog(fetchImpl) {
  const call = async (init) => {
    const res = await fetchImpl("/api/log", { credentials: "same-origin", cache: "no-store", ...init });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Sign in again to save notes.");
    if (!res.ok) throw new Error(body.error || "The server did not save it.");
    return Array.isArray(body.log) ? body.log.filter((e) => e && LOG_TYPES.includes(e.type)) : [];
  };
  return {
    server: true,
    where: "Shared on the server by signed-in ranchers on this copy.",
    load: () => call({ method: "GET" }),
    async add(input) {
      // Check here too, so a missing note fails without a round trip.
      const checked = normalizeEntry(input);
      if (!checked.ok) throw new Error(checked.error);
      return call({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: input.type, animalId: input.animalId, text: input.text }) });
    },
  };
}

/**
 * The log for one data source. The browser log answers at once; the server
 * log returns promises. Callers await both.
 */
export function createRanchLog(scope, { storage = globalThis.localStorage, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (scope === "rancher") return serverLog(fetchImpl);
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
    server: false,
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

/**
 * Plain line for the log UI. Server-saved entries name the author,
 * e.g. "Checked by rancher@example.com at 17:55". Sample and public
 * entries have no author and keep a shorter line.
 */
export function describeLogEntry(entry) {
  if (!entry) return "";
  const when = timeOf(entry.at);
  const who = typeof entry.author === "string" ? entry.author.trim() : "";
  if (entry.type === "checked") {
    const lead = who ? "Checked by " + who : "Checked by hand";
    return lead + (when ? " at " + when : "") + (entry.text ? ": " + entry.text : "");
  }
  const text = (entry.text || "").replace(/[.,;:\s]+$/, "");
  if (who) return (text ? text + " by " : "") + who + (when ? " at " + when : "");
  return entry.text || "";
}

/** Notes and checks for one animal, newest first. */
export function entriesFor(log, animalId) {
  return (log || []).filter((e) => e.animalId === animalId && e.type !== "alert").sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** The newest time the rancher marked this animal checked, or null. */
export function lastChecked(log, animalId) {
  return entriesFor(log, animalId).find((e) => e.type === "checked")?.at || null;
}
