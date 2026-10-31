// Alert rules and rancher answers. Plain functions with no browser or Node
// imports, so the herd view, the local server, the Pages Functions, and the
// tests all use the same rules.
import { ALERT_RULES } from "./alert-config.js";

export const ALERT_KINDS = ["battery", "quiet", "sos", "predator", "smoke"];
export const ANSWERS = ["confirmed", "dismissed", "reopened"];
const KIND_ORDER = { sos: 0, predator: 1, smoke: 2, quiet: 3, battery: 4 };

function ms(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function hm(iso) {
  const m = /T(\d{2}:\d{2})/.exec(String(iso || ""));
  return m ? m[1] : "";
}

function duration(minutes) {
  if (minutes < 60) return minutes + " min";
  if (minutes >= 48 * 60) return Math.floor(minutes / 1440) + " days";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + (h === 1 ? " hour" : " hours") + (m ? " " + m + " min" : "");
}

/**
 * Alerts from the tracker data: a low battery, a quiet tracker, or an SOS.
 * animals: [{ id, name, battery, externalPower, lastSeen, status, sos, sensors }]
 * now: ISO time to measure "quiet" from.
 */
export function trackerAlerts(animals, now, rules = ALERT_RULES) {
  const out = [];
  const nowMs = ms(now);
  for (const a of animals || []) {
    const name = String(a.name || a.alias || a.id);
    if (Number.isFinite(a.battery) && a.battery < rules.lowBatteryPercent && !a.externalPower) {
      out.push({
        id: "battery:" + a.id,
        kind: "battery",
        animalId: a.id,
        title: name + ": battery at " + Math.round(a.battery) + "%",
        detail: "Below " + rules.lowBatteryPercent + "%. Charge or swap the tracker soon.",
        time: a.lastSeen || now,
      });
    }
    const seen = ms(a.lastSeen);
    if (seen !== null && nowMs !== null) {
      const quiet = Math.round((nowMs - seen) / 60000);
      if (quiet > rules.quietMinutes) {
        out.push({
          id: "quiet:" + a.id + ":" + a.lastSeen,
          kind: "quiet",
          animalId: a.id,
          title: name + ": no check-in for " + duration(quiet),
          detail: "Last heard at " + hm(a.lastSeen) + ". The tracker may be out of range, off, or out of battery.",
          time: a.lastSeen,
        });
      }
    } else if (a.status === "never seen") {
      out.push({
        id: "quiet:" + a.id + ":never",
        kind: "quiet",
        animalId: a.id,
        title: name + ": never checked in",
        detail: "The server has no uplink from this tracker yet.",
        time: now,
      });
    }
    if (a.sos || a.sensors?.sos === true) {
      const at = a.sensors?.at || a.lastSeen || now;
      out.push({
        id: "sos:" + a.id + ":" + at,
        kind: "sos",
        animalId: a.id,
        title: name + ": SOS",
        detail: "The tracker sent an SOS. Find the animal.",
        time: at,
      });
    }
  }
  return out;
}

/** Predator Watch and Wildfire Watch alerts from the events shown so far. */
export function eventAlerts(events) {
  const out = [];
  const list = events || [];
  list.forEach((e, i) => {
    if (e.type !== "predator" && e.type !== "smoke") return;
    const clearType = e.type + "-clear";
    const cleared = list.slice(i + 1).some((x) => x.type === clearType && (!e.cell || x.cell === e.cell));
    out.push({
      id: "event:" + e.id,
      kind: e.type,
      eventId: e.id,
      title: e.type === "predator" ? "Predator Watch: activity near " + (e.cell || "the herd") : "Wildfire Watch: smoke upwind",
      detail: String(e.text || ""),
      time: e.time,
      cleared,
    });
  });
  return out;
}

export function computeAlerts({ animals, events, now, rules = ALERT_RULES }) {
  return [...eventAlerts(events), ...trackerAlerts(animals, now, rules)].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(b.time).localeCompare(String(a.time))
  );
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Check and tidy one answer before it is stored. Returns { ok, entry } or
 * { ok: false, error }. The server sets `at` and `source`; anything else in
 * the input is dropped.
 */
export function normalizeFeedback(input, { now = new Date().toISOString(), source = "demo", rules = ALERT_RULES } = {}) {
  if (!input || typeof input !== "object") return { ok: false, error: "Send an answer as JSON." };
  const alertId = String(input.alertId || "");
  if (!/^(battery|quiet|sos|event):[A-Za-z0-9:._-]{1,100}$/.test(alertId)) return { ok: false, error: "Unknown alert." };
  if (!ANSWERS.includes(input.answer)) return { ok: false, error: "The answer must be confirmed, dismissed, or reopened." };
  if (!ALERT_KINDS.includes(input.kind)) return { ok: false, error: "Unknown alert kind." };
  if (typeof input.note === "string" && input.note.length > rules.noteMaxLength * 2) return { ok: false, error: "The note is too long." };
  const entry = {
    type: "alert-feedback",
    alertId,
    kind: input.kind,
    answer: input.answer,
    note: cleanText(input.note, rules.noteMaxLength),
    title: cleanText(input.title, 140),
    alertTime: cleanText(input.alertTime, 40),
    at: now,
    source,
    // The rule that raised the alert, for a later tuning step.
    rule: input.kind === "battery" ? { lowBatteryPercent: rules.lowBatteryPercent } : input.kind === "quiet" ? { quietMinutes: rules.quietMinutes } : {},
  };
  if (typeof input.animalId === "string" && /^[A-Za-z0-9._-]{1,60}$/.test(input.animalId)) entry.animalId = input.animalId;
  return { ok: true, entry };
}

/** The newest answer for each alert. */
export function latestAnswers(feedback) {
  const out = new Map();
  for (const f of feedback || []) {
    const prev = out.get(f.alertId);
    if (!prev || String(f.at) >= String(prev.at)) out.set(f.alertId, f);
  }
  return out;
}

/**
 * Split alerts into the open list and the history list.
 * open: alerts with no answer, or reopened.
 * history: the newest answer per alert that was confirmed or dismissed,
 * newest first, including alerts that are no longer active.
 */
export function splitAlerts(alerts, feedback) {
  const latest = latestAnswers(feedback);
  const open = alerts.filter((a) => {
    const f = latest.get(a.id);
    return !f || f.answer === "reopened";
  });
  const history = [...latest.values()]
    .filter((f) => f.answer === "confirmed" || f.answer === "dismissed")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { open, history };
}
