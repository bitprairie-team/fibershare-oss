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
    },
    {
      id: "quiet",
      name: "Flags trackers that stop reporting",
      detail: "An alert after " + minutesText(rules.quietMinutes) + " with no check-in.",
      off: "No quiet-tracker alerts. Each animal still shows its last check-in.",
    },
    {
      id: "sos",
      name: "Raises an alert when a tracker sends an SOS",
      detail: "The alert names the animal.",
      off: "No SOS alerts. An SOS still shows in the event list.",
    },
    {
      id: "predator",
      name: "Lists Predator Watch reports near the herd",
      detail: "The sample day has one made-up report.",
      off: "Reports stay in the event list, with no alert or grid marker.",
    },
    {
      id: "smoke",
      name: "Lists Wildfire Watch smoke reports upwind",
      detail: "The rancher map also shows public fire, smoke and air quality layers.",
      off: "Reports stay in the event list, with no alert or haze.",
    },
    {
      id: "trace",
      name: "Traces a fiber lot back to the goat",
      detail: "Through the fleece and shearing records.",
      off: "The trace page lists each record as entered, to follow by hand.",
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
  sos: () => "SOS",
  predator: () => "Predator Watch",
  smoke: () => "Wildfire Watch",
};
const OFF_LABELS = { battery: "battery", quiet: "quiet tracker", sos: "SOS", predator: "Predator Watch", smoke: "Wildfire Watch" };

// Alert jobs only. The trace page and the live-file check are separate jobs.
export const ALERT_JOB_IDS = Object.keys(ALERT_JOB_LABELS);

export const ALERTS_OFF_NOTICE =
  "Automatic alerts are off. FiberShare will not flag low batteries, quiet trackers, SOS or Predator Watch and Wildfire Watch reports until you turn them back on. " +
  "FiberShare is an aid, not a guarantee. In an emergency, call 911.";

/** True when every alert job is off. Trace and the live-file check do not count. */
export function alertJobsAreOff(jobs) {
  return ALERT_JOB_IDS.every((id) => jobs?.[id] === false);
}

export function alertsOffNoticeHtml(jobs) {
  const off = alertJobsAreOff(jobs);
  return '<p class="notice notice-warn alerts-off" data-alerts-off role="status"' + (off ? "" : " hidden") + ">" + (off ? ALERTS_OFF_NOTICE : "") + "</p>";
}

/** Show or clear the notice. `el` is the [data-alerts-off] paragraph, or null. */
export function paintAlertsOffNotice(el, jobs) {
  if (!el) return;
  const off = alertJobsAreOff(jobs);
  el.hidden = !off;
  el.textContent = off ? ALERTS_OFF_NOTICE : "";
}

/** One plain line on the herd view: which automated alerts run right now. */
export function jobsLine(jobs, rules = ALERT_RULES) {
  const on = ALERT_JOB_IDS.filter((id) => jobs[id]);
  const off = ALERT_JOB_IDS.filter((id) => !jobs[id]);
  if (!on.length) return "Add alerts by hand below.";
  return "Automatic alerts on: " + on.map((id) => ALERT_JOB_LABELS[id](rules)).join(", ") + "." + (off.length ? " Off: " + off.map((id) => OFF_LABELS[id]).join(", ") + "." : "");
}
