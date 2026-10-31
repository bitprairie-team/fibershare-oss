// Rancher answers to alerts, kept on the server. Shared by the local server
// (a file in .local/) and the Pages Functions (a KV key). No Node imports.
import { normalizeFeedback } from "../src/alerts.js";

export const FEEDBACK_LIMIT = 2000;
export const KV_FEEDBACK = "alert-feedback";

export function parseFeedbackList(text) {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.filter((f) => f && f.type === "alert-feedback") : [];
  } catch {
    return [];
  }
}

/**
 * Check one posted answer and add it to the list, keeping the newest
 * FEEDBACK_LIMIT entries. Returns { status, body, list }.
 */
export function addFeedback(list, bodyText, { now }) {
  let input = null;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "Send the answer as JSON." } };
  }
  const checked = normalizeFeedback(input, { now, source: "rancher" });
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const next = [...list, checked.entry].slice(-FEEDBACK_LIMIT);
  return { status: 200, body: { ok: true, entry: checked.entry, feedback: next }, list: next };
}
