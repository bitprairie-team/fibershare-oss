// The jobs the demo runs on the tracker data, named by the work each one
// does. Plain data, so a test can check it against the alert rules.
import { ALERT_RULES } from "./alert-config.js";

const quietHours = ALERT_RULES.quietMinutes / 60;

export const JOBS = [
  { id: "battery", name: "Flags tracker batteries below " + ALERT_RULES.lowBatteryPercent + "%", detail: "Trackers on outside power are skipped." },
  { id: "quiet", name: "Flags trackers that stop reporting", detail: "An alert after " + quietHours + " hours with no check-in." },
  { id: "sos", name: "Raises an alert when a tracker sends an SOS", detail: "The alert names the animal." },
  { id: "predator", name: "Lists predator reports near the herd", detail: "The sample day has one made-up report." },
  { id: "smoke", name: "Lists smoke reports upwind of the herd", detail: "The rancher map also shows public fire, smoke and air quality layers." },
  { id: "trace", name: "Traces a fiber lot back to the goat", detail: "Through the fleece and shearing records." },
];

// Work that is not built yet. Shown once, on the How it works page.
export const PLANNED = [
  "grazing records for each paddock",
  "learning each tracker's normal check-in pattern",
  "tuning the alert rules from rancher answers",
  "sharing a confirmed predator report with nearby ranchers",
];
