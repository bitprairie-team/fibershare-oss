// A signed-in rancher's notes, checks and hand-made alerts, kept on the
// server. Shared by the local server (a file in .local/) and the Pages
// Functions (KV). One shared log per deployed copy. No Node imports.
import { LOG_TYPES, normalizeEntry } from "../src/ranch-log.js";

export const LOG_LIMIT = 2000;
/** Old single-key list. Still read so nothing already saved is lost. */
export const KV_LOG = "ranch-log";
/** Each new entry is written under log:ranch:<time>:<id>. */
export const KV_LOG_PREFIX = "log:ranch:";
/** Local sign-in is a shared passphrase, so this is the author on that path. */
export const LOCAL_LOG_AUTHOR = "rancher";

export function parseLogList(text) {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.filter(isLogEntry) : [];
  } catch {
    return [];
  }
}

function isLogEntry(entry) {
  return entry && LOG_TYPES.includes(entry.type) && typeof entry.id === "string";
}

/** One stored value: a single entry, or a leftover list from the old key. */
export function parseLogValue(text) {
  if (text == null || text === "") return [];
  try {
    const data = typeof text === "string" ? JSON.parse(text) : text;
    if (Array.isArray(data)) return data.filter(isLogEntry);
    return isLogEntry(data) ? [data] : [];
  } catch {
    return [];
  }
}

/**
 * Author from a verified Access JWT. Email first, then subject. Never use a
 * name the client sent.
 */
export function authorFromClaims(claims) {
  const email = cleanAuthor(claims?.email);
  if (email) return email;
  return cleanAuthor(claims?.sub) || LOCAL_LOG_AUTHOR;
}

export function cleanAuthor(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function newLogId(now) {
  const rand = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12);
  return Date.parse(now).toString(36) + "-" + rand;
}

export function logEntryKey(entry) {
  return KV_LOG_PREFIX + entry.at + ":" + entry.id;
}

/** Merge leftover list entries with per-entry records, newest last, capped. */
export function mergeLogEntries(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const entry of group || []) {
      if (isLogEntry(entry)) byId.set(entry.id, entry);
    }
  }
  // Same time keeps the order they were merged, so a just-added entry is
  // the one that stays when the cap is hit.
  return [...byId.values()].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-LOG_LIMIT);
}

/**
 * Check one posted entry. The server sets the id, the time and the author.
 * A client-supplied author is ignored. Returns { status, body, entry }.
 */
export function addLogEntry(list, bodyText, { now, author, id } = {}) {
  let input = null;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "Send the entry as JSON." } };
  }
  const checked = normalizeEntry(input, { now, id: id || newLogId(now), author });
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const next = mergeLogEntries(list || [], [checked.entry]);
  return { status: 200, body: { ok: true, entry: checked.entry, log: next }, list: next, entry: checked.entry };
}

async function listKeys(store, prefix) {
  if (typeof store.list !== "function") return [];
  const names = [];
  let cursor;
  do {
    const page = await store.list({ prefix, cursor, limit: 1000 });
    for (const key of page.keys || []) names.push(key.name);
    cursor = page.list_complete === false ? page.cursor : null;
  } while (cursor);
  return names;
}

/** Read the leftover single-key log plus every per-entry key. */
export async function readLog(store) {
  const keys = await listKeys(store, KV_LOG_PREFIX);
  const texts = await Promise.all([store.get(KV_LOG), ...keys.map((key) => store.get(key))]);
  return mergeLogEntries(...texts.map(parseLogValue));
}

/** Write one entry under its own key so two posts at once cannot drop one. */
export async function writeLogEntry(store, entry) {
  await store.put(logEntryKey(entry), JSON.stringify(entry));
  if (typeof store.delete !== "function") return;
  const keys = (await listKeys(store, KV_LOG_PREFIX)).sort();
  const extra = keys.length - LOG_LIMIT;
  if (extra > 0) await Promise.all(keys.slice(0, extra).map((key) => store.delete(key)));
}
