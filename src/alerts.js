// Alert rules and rancher answers. Plain functions with no browser or Node
// imports, so the herd view, the local server, the Pages Functions, and the
// tests all use the same rules.
import { ALERT_RULES } from "./alert-config.js";
import { timeOf } from "./time.js";

export const ALERT_KINDS = ["battery", "quiet", "still", "paddock", "sos", "predator", "smoke", "manual"];
export const ANSWERS = ["confirmed", "dismissed", "reopened"];
const KIND_ORDER = { sos: 0, manual: 1, predator: 2, smoke: 3, paddock: 4, still: 5, quiet: 6, battery: 7 };
// Every automated alert job, on unless a setting turns it off.
const ALL_ON = { battery: true, quiet: true, still: true, paddock: true, sos: true, predator: true, smoke: true };

function ms(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// Times in the reader's own clock, the same way every page writes them.
const hm = timeOf;

function duration(minutes) {
  if (minutes < 60) return minutes + " min";
  if (minutes >= 48 * 60) return Math.floor(minutes / 1440) + " days";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + (h === 1 ? " hour" : " hours") + (m ? " " + m + " min" : "");
}

/** True when x,y sit inside the active paddock bounds. */
export function inPaddock(x, y, paddock = ALERT_RULES.paddock) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= paddock.minX &&
    x <= paddock.maxX &&
    y >= paddock.minY &&
    y <= paddock.maxY
  );
}

/** Distance between two grid (or meter) points. */
export function displacement(a, b) {
  if (!Number.isFinite(a?.x) || !Number.isFinite(a?.y) || !Number.isFinite(b?.x) || !Number.isFinite(b?.y)) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}


/**
 * Alerts from the tracker data: low battery, quiet, not-moving, out-of-paddock, or SOS.
 * animals: [{ id, name, battery, externalPower, lastSeen, lastMoved, lastFix, x, y, status, sos, sensors }]
 * now: ISO time to measure "quiet" from.
 * jobs: which jobs run. A job that is off adds nothing.
 * Each alert has `why`: the rule and the reading that raised it.
 */
export function trackerAlerts(animals, now, rules = ALERT_RULES, jobs = ALL_ON) {
  const out = [];
  const nowMs = ms(now);
  for (const a of animals || []) {
    const name = String(a.name || a.alias || a.id);
    if (jobs.battery && Number.isFinite(a.battery) && a.battery < rules.lowBatteryPercent && !a.externalPower) {
      out.push({
        id: "battery:" + a.id,
        kind: "battery",
        animalId: a.id,
        title: name + ": battery at " + Math.round(a.battery) + "%",
        detail: "Below " + rules.lowBatteryPercent + "%. Charge or swap the tracker soon.",
        why: "Battery " + Math.round(a.battery) + "%, below the " + rules.lowBatteryPercent + "% limit, not on outside power.",
        time: a.lastSeen || now,
      });
    }
    const seen = ms(a.lastSeen);
    if (!jobs.quiet) {
      // The quiet-tracker job is off.
    } else if (seen !== null && nowMs !== null) {
      const quiet = Math.round((nowMs - seen) / 60000);
      if (quiet > rules.quietMinutes) {
        out.push({
          id: "quiet:" + a.id + ":" + a.lastSeen,
          kind: "quiet",
          animalId: a.id,
          title: name + ": no check-in for " + duration(quiet),
          detail: "Last heard at " + hm(a.lastSeen) + ". The tracker may be out of range, off, or out of battery.",
          why: "Last check-in " + hm(a.lastSeen) + ", " + duration(quiet) + " before " + hm(now) + ", over the limit of " + duration(rules.quietMinutes) + ".",
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
        why: "No check-in from this tracker since it was added.",
        time: now,
      });
    }

    if (jobs.still) {
      const moved = ms(a.lastMoved);
      // Prefer lastFix (last positioned reading). Fall back to lastSeen for live
      // trackers that set lastSeen on every fix and do not send lastFix.
      const fix = ms(a.lastFix) ?? seen;
      if (fix !== null && nowMs !== null && moved !== null) {
        const quietGap = Math.round((nowMs - fix) / 60000);
        const stillFor = Math.round((nowMs - moved) / 60000);
        // Still getting position fixes (not quiet on fixes) but has not moved enough.
        if (quietGap <= rules.quietMinutes && stillFor > rules.stillMinutes) {
          out.push({
            id: "still:" + a.id + ":" + a.lastMoved,
            kind: "still",
            animalId: a.id,
            title: name + ": not moving for " + duration(stillFor),
            detail: "The tracker keeps checking in near the same spot. Look in on the animal when you can.",
            why:
              "Last real move at " +
              hm(a.lastMoved) +
              ", " +
              duration(stillFor) +
              " before " +
              hm(now) +
              ", over the limit of " +
              duration(rules.stillMinutes) +
              ". Still checking in.",
            time: a.lastMoved,
          });
        }
      }
    }
    if (jobs.paddock && Number.isFinite(a.x) && Number.isFinite(a.y) && !inPaddock(a.x, a.y, rules.paddock)) {
      const at = a.lastSeen || now;
      out.push({
        id: "paddock:" + a.id + ":" + Math.round(a.x) + ":" + Math.round(a.y),
        kind: "paddock",
        animalId: a.id,
        title: name + ": outside the paddock",
        detail: "Last position is outside the active paddock. Confirm the fence or the animal.",
        why:
          "Position " +
          Math.round(a.x) +
          "," +
          Math.round(a.y) +
          " is outside the paddock (" +
          rules.paddock.minX +
          "-" +
          rules.paddock.maxX +
          " x " +
          rules.paddock.minY +
          "-" +
          rules.paddock.maxY +
          ").",
        time: at,
      });
    }

    if (jobs.sos && (a.sos || a.sensors?.sos === true)) {
      const at = a.sensors?.at || a.lastSeen || now;
      out.push({
        id: "sos:" + a.id + ":" + at,
        kind: "sos",
        animalId: a.id,
        title: name + ": SOS",
        detail: "The tracker sent an SOS. Find the animal.",
        why: "The tracker sent its SOS flag at " + hm(at) + ".",
        time: at,
      });
    }
  }
  return out;
}

/** Predator Watch and Wildfire Watch alerts from the events shown so far. */
export function eventAlerts(events, jobs = ALL_ON) {
  const out = [];
  const list = events || [];
  list.forEach((e, i) => {
    if (e.type !== "predator" && e.type !== "smoke") return;
    if (!jobs[e.type]) return;
    const clearType = e.type + "-clear";
    const cleared = list.slice(i + 1).some((x) => x.type === clearType && (!e.cell || x.cell === e.cell));
    out.push({
      id: "event:" + e.id,
      kind: e.type,
      eventId: e.id,
      title: e.type === "predator" ? "Predator Watch reported activity near " + (e.cell || "the herd") : "Wildfire Watch reported smoke upwind",
      detail: String(e.text || ""),
      why:
        (e.type === "predator" ? "Predator Watch report" + (e.cell ? " for cell " + e.cell : "") : "Wildfire Watch report") +
        " at " + hm(e.time) + (e.text ? ": " + String(e.text).replace(/\.?$/, ".") : "."),
      time: e.time,
      cleared,
    });
  });
  return out;
}

/**
 * Alerts a rancher added by hand, from the ranch log. They stay open until
 * the rancher answers them, whatever the jobs are set to.
 */
export function manualAlerts(log, animals = []) {
  const names = new Map((animals || []).map((a) => [a.id, String(a.name || a.alias || a.id)]));
  return (log || [])
    .filter((e) => e.type === "alert")
    .map((e) => ({
      id: "manual:" + e.id,
      kind: "manual",
      animalId: e.animalId || undefined,
      title: (e.animalId && names.has(e.animalId) ? names.get(e.animalId) + ": " : "") + e.text,
      why: "Added by hand.",
      time: e.at,
      manual: true,
    }));
}

/**
 * Every alert, newest first within each kind. Automated alerts carry `ranAt`,
 * the time the rules were checked.
 */
export function computeAlerts({ animals, events, now, rules = ALERT_RULES, jobs = ALL_ON, log = [] }) {
  const auto = [...eventAlerts(events, jobs), ...trackerAlerts(animals, now, rules, jobs)].map((a) => ({ ...a, ranAt: now }));
  return [...auto, ...manualAlerts(log, animals)].sort(
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
  if (!/^(battery|quiet|still|paddock|sos|event|manual):[A-Za-z0-9:._-]{1,100}$/.test(alertId)) return { ok: false, error: "Unknown alert." };
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
    rule:
      input.kind === "battery"
        ? { lowBatteryPercent: rules.lowBatteryPercent }
        : input.kind === "quiet"
          ? { quietMinutes: rules.quietMinutes }
          : input.kind === "still"
            ? { stillMinutes: rules.stillMinutes, stillDistance: rules.stillDistance }
            : input.kind === "paddock"
              ? { paddock: rules.paddock }
              : {},
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
