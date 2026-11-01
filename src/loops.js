// The jobs the demo runs on the tracker data, named by the work each one
// does. Each can be turned off; `off` says what still works without it.
// Plain data, so a test can check it against the alert rules.
import { ALERT_RULES } from "./alert-config.js";
import { minutesText } from "./settings.js";

export const PULL_SECONDS = 120;

export function jobsFor(rules = ALERT_RULES) {
  return [
    {
      id: "battery",
      name: "Flags tracker batteries below " + rules.lowBatteryPercent + "%",
      detail: "Trackers on outside power are skipped.",
      off: "No battery alerts. Each animal still shows its battery.",
      kind: "safety",
      plain: "low batteries",
    },
    {
      id: "quiet",
      name: "Flags trackers that stop reporting",
      detail: "An alert after " + minutesText(rules.quietMinutes) + " with no check-in.",
      off: "No quiet-tracker alerts. Each animal still shows its last check-in.",
      kind: "safety",
      plain: "quiet trackers",
    },
    {
      id: "still",
      name: "Flags animals that stop moving",
      detail: "An alert after " + minutesText(rules.stillMinutes) + " checking in near the same spot.",
      off: "No not-moving alerts. Each animal still shows its last check-in.",
      kind: "safety",
      phraseGroup: "moving",
      plain: "animals that stop moving",
    },
    {
      id: "paddock",
      name: "Flags animals outside the paddock",
      detail: "An alert when a position falls outside the active paddock bounds.",
      off: "No out-of-paddock alerts. Positions still show on the grid.",
      kind: "safety",
      phraseGroup: "moving",
      plain: "leave the paddock",
    },
    {
      id: "sos",
      name: "Raises an alert when a tracker sends an SOS",
      detail: "The alert names the animal.",
      off: "No SOS alerts. An SOS still shows in the event list.",
      kind: "safety",
      plain: "SOS",
    },
    {
      id: "predator",
      name: "Lists Predator Watch reports near the herd",
      detail: "The sample day has one made-up report.",
      off: "Reports stay in the event list, with no alert or grid marker.",
      kind: "safety",
      plain: "Predator Watch reports",
    },
    {
      id: "smoke",
      name: "Lists Wildfire Watch smoke reports upwind",
      detail: "The rancher map also shows public fire, smoke and air quality layers.",
      off: "Reports stay in the event list, with no alert or haze.",
      kind: "safety",
      plain: "Wildfire Watch reports",
    },
    {
      id: "trace",
      name: "Traces a fiber lot back to the goat",
      detail: "Through the fleece and shearing records.",
      off: "The trace page lists each record as entered, to follow by hand.",
      kind: "other",
      plain: "Fiber lot tracing",
    },
  ];
}

export const JOBS = jobsFor(ALERT_RULES);

// The herd view's check for a new live file. The pull script itself runs on
// your own hardware, only when you start it.
export const PULL_JOB = {
  id: "pull",
  name: "Checks for a new live file every " + PULL_SECONDS / 60 + " minutes",
  detail: "Live data only. The pull script on your hardware runs only when you start it.",
  off: "The herd view keeps the data it opened with. Use Check now to load a newer file.",
  kind: "other",
  plain: "live file checks",
};

// Work that is not built yet. Shown once, on the How it works page.
export const PLANNED = [
  "grazing records for each paddock",
  "learning each tracker's normal check-in pattern",
  "tuning the alert rules from rancher answers",
  "sharing a confirmed predator report with nearby ranchers",
];

const ALERT_JOB_LABELS = {
  battery: (r) => "battery below " + r.lowBatteryPercent + "%",
  quiet: (r) => "no check-in for " + minutesText(r.quietMinutes),
  still: (r) => "not moving for " + minutesText(r.stillMinutes),
  paddock: () => "outside the paddock",
  sos: () => "SOS",
  predator: () => "Predator Watch",
  smoke: () => "Wildfire Watch",
};
const OFF_LABELS = {
  battery: "battery",
  quiet: "quiet tracker",
  still: "not moving",
  paddock: "out of paddock",
  sos: "SOS",
  predator: "Predator Watch",
  smoke: "Wildfire Watch",
};

/** Every automated job, in definition order. Trace and the live-file check count. */
export function alertJobList(rules = ALERT_RULES) {
  return [...jobsFor(rules), PULL_JOB];
}

export const ALERT_JOB_IDS = alertJobList().map((job) => job.id);

/** Join list items with "or" before the last one, and no comma before that or. */
function joinOr(items) {
  if (items.length < 2) return items.join("");
  if (items.length === 2) return items[0] + " or " + items[1];
  return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
}

/** Jobs that share phraseGroup, in a row, become one "or" phrase. */
function noticeClauses(jobs) {
  const clauses = [];
  for (const job of jobs) {
    const prev = clauses[clauses.length - 1];
    if (job.phraseGroup && prev && prev.group === job.phraseGroup) prev.parts.push(job.plain);
    else clauses.push({ group: job.phraseGroup || "", parts: [job.plain] });
  }
  return clauses.map((clause) => clause.parts.join(" or "));
}

function pausedSentence(clauses) {
  if (!clauses.length) return "";
  const list = clauses.length === 1 ? clauses[0] : clauses.length === 2 ? clauses[0] + " and " + clauses[1] : clauses.slice(0, -1).join(", ") + " and " + clauses[clauses.length - 1];
  return list + (clauses.length === 1 ? " is paused too." : " are paused too.");
}

export function alertsOffNoticeText(state, rules = ALERT_RULES) {
  const defs = alertJobList(rules);
  const safety = noticeClauses(defs.filter((job) => job.kind === "safety"));
  const other = noticeClauses(defs.filter((job) => job.kind === "other" && state?.[job.id] === false));
  const sentences = ["Automatic alerts are off. FiberShare will not flag " + joinOr(safety) + " until you turn them back on."];
  if (other.length) sentences.push(pausedSentence(other));
  sentences.push("FiberShare is an aid, not a guarantee. In an emergency, call 911.");
  return sentences.join(" ");
}

const ALL_OFF = Object.fromEntries(ALERT_JOB_IDS.map((id) => [id, false]));
export const ALERTS_OFF_NOTICE = alertsOffNoticeText(ALL_OFF);

/** True when every safety job is off. Trace and the live-file check do not count. */
export function alertJobsAreOff(jobs) {
  return alertJobList().filter((j) => j.kind === "safety").every((j) => jobs?.[j.id] === false);
}

export function alertsOffNoticeHtml(jobs) {
  const off = alertJobsAreOff(jobs);
  return '<p class="notice notice-warn alerts-off" data-alerts-off role="status"' + (off ? "" : " hidden") + ">" + (off ? alertsOffNoticeText(jobs) : "") + "</p>";
}

/** Show or clear the notice. `el` is the [data-alerts-off] paragraph, or null. */
export function paintAlertsOffNotice(el, jobs) {
  if (!el) return;
  const off = alertJobsAreOff(jobs);
  el.hidden = !off;
  el.textContent = off ? alertsOffNoticeText(jobs) : "";
}

/** One plain line on the herd view: which automated alerts run right now. */
export function jobsLine(jobs, rules = ALERT_RULES) {
  const ids = Object.keys(ALERT_JOB_LABELS);
  const on = ids.filter((id) => jobs[id]);
  const off = ids.filter((id) => !jobs[id]);
  if (alertJobsAreOff(jobs)) return "Add alerts by hand below.";
  return "Automatic alerts on: " + on.map((id) => ALERT_JOB_LABELS[id](rules)).join(", ") + "." + (off.length ? " Off: " + off.map((id) => OFF_LABELS[id]).join(", ") + "." : "");
}
