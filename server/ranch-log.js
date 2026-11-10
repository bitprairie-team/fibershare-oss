// A signed-in rancher's notes, checks and hand-made alerts, kept on the
// server. Shared by the local server (a file in .local/) and the Pages
// Functions (a KV key). No Node imports.
import { LOG_TYPES, normalizeEntry } from "../src/ranch-log.js";

export const LOG_LIMIT = 2000;
export const KV_LOG = "ranch-log";

export function parseLogList(text) {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.filter((e) => e && LOG_TYPES.includes(e.type) && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Check one posted entry and add it to the list, keeping the newest
 * LOG_LIMIT entries. The server sets the id and the time. Returns
 * { status, body, list }.
 */
export function addLogEntry(list, bodyText, { now }) {
  let input = null;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "Send the entry as JSON." } };
  }
  const id = Date.parse(now).toString(36) + "-" + (list.length + 1).toString(36);
  const checked = normalizeEntry(input, { now, id });
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const next = [...list, checked.entry].slice(-LOG_LIMIT);
  return { status: 200, body: { ok: true, entry: checked.entry, log: next }, list: next };
}
