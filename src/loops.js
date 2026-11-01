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
      plain: "low batteries",
    },
    {
      id: "quiet",
      name: "Flags trackers that stop reporting",
      detail: "An alert after " + minutesText(rules.quietMinutes) + " with no check-in.",
      off: "No quiet-tracker alerts. Each animal still shows its last check-in.",
      plain: "quiet trackers",
    },
    {
      id: "still",
      name: "Flags animals that stop moving",
      detail: "An alert after " + minutesText(rules.stillMinutes) + " checking in near the same spot.",
      off: "No not-moving alerts. Each animal still shows its last check-in.",
      plain: "animals that stop moving",
    },
    {
      id: "paddock",
      name: "Flags animals outside the paddock",
      detail: "An alert when a position falls outside the active paddock bounds.",
      off: "No out-of-paddock alerts. Positions still show on the grid.",
      plain: "animals that leave the paddock",
    },
    {
      id: "sos",
      name: "Raises an alert when a tracker sends an SOS",
      detail: "The alert names the animal.",
      off: "No SOS alerts. An SOS still shows in the event list.",
      plain: "SOS",
    },
    {
      id: "predator",
      name: "Lists Predator Watch reports near the herd",
      detail: "The sample day has one made-up report.",
      off: "Reports stay in the event list, with no alert or grid marker.",
      plain: "Predator Watch reports",
    },
    {
      id: "smoke",
      name: "Lists Wildfire Watch smoke reports upwind",
      detail: "The rancher map also shows public fire, smoke and air quality layers.",
      off: "Reports stay in the event list, with no alert or haze.",
      plain: "Wildfire Watch reports",
    },
    {
      id: "trace",
      name: "Traces a fiber lot back to the goat",
      detail: "Through the fleece and shearing records.",
      off: "The trace page lists each record as entered, to follow by hand.",
      plain: "a fiber lot traced back to the goat",
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
  plain: "a check for a new live file",
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

function englishList(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + ", or " + items[items.length - 1];
}

export function alertsOffNoticeText(rules = ALERT_RULES) {
  return (
    "Automatic alerts are off. FiberShare will not flag " +
    englishList(alertJobList(rules).map((job) => job.plain)) +
    " until you turn them back on. FiberShare is an aid, not a guarantee. In an emergency, call 911."
  );
}

export const ALERTS_OFF_NOTICE = alertsOffNoticeText();

/** True when every automated job is off. */
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
  const ids = Object.keys(ALERT_JOB_LABELS);
  const on = ids.filter((id) => jobs[id]);
  const off = ids.filter((id) => !jobs[id]);
  if (alertJobsAreOff(jobs)) return "Add alerts by hand below.";
  if (!on.length) return "Automatic alerts are off. Add alerts by hand below.";
  return "Automatic alerts on: " + on.map((id) => ALERT_JOB_LABELS[id](rules)).join(", ") + "." + (off.length ? " Off: " + off.map((id) => OFF_LABELS[id]).join(", ") + "." : "");
}
