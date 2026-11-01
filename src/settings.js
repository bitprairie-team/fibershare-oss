// Demo settings saved in this browser: which automated jobs run, and the
// alert limits. Every job is on until the rancher turns it off. With every
// job off the herd view still works by hand.
import { ALERT_RULES } from "./alert-config.js";

export const JOB_IDS = ["battery", "quiet", "sos", "predator", "smoke", "trace", "pull"];
export const SETTINGS_KEYS = { jobs: "fs-jobs", limits: "fs-alert-limits" };

// The limits a rancher may set, so a typo cannot turn an alert into noise.
export const LIMITS = Object.freeze({
  lowBatteryPercent: { min: 5, max: 90 },
  quietMinutes: { min: 15, max: 1440 },
});

function readJson(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private windows may block storage. The change then lasts one page load.
    return false;
  }
}

const store = () => globalThis.localStorage;

/** { battery: true, quiet: false, ... } for every job. */
export function readJobs(storage = store()) {
  const saved = readJson(storage, SETTINGS_KEYS.jobs);
  return Object.fromEntries(JOB_IDS.map((id) => [id, saved[id] !== false]));
}

export function setJob(id, on, storage = store()) {
  if (!JOB_IDS.includes(id)) return readJobs(storage);
  const jobs = readJobs(storage);
  jobs[id] = Boolean(on);
  writeJson(storage, SETTINGS_KEYS.jobs, jobs);
  return jobs;
}

export function setAllJobs(on, storage = store()) {
  const jobs = Object.fromEntries(JOB_IDS.map((id) => [id, Boolean(on)]));
  writeJson(storage, SETTINGS_KEYS.jobs, jobs);
  return jobs;
}

function clampLimit(key, value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return ALERT_RULES[key];
  return Math.min(LIMITS[key].max, Math.max(LIMITS[key].min, n));
}

/** The alert rules with the rancher's own limits applied. */
export function readRules(storage = store()) {
  const saved = readJson(storage, SETTINGS_KEYS.limits);
  const rules = { ...ALERT_RULES };
  for (const key of Object.keys(LIMITS)) if (key in saved) rules[key] = clampLimit(key, saved[key]);
  return rules;
}

export function setLimit(key, value, storage = store()) {
  if (!(key in LIMITS)) return readRules(storage);
  const saved = readJson(storage, SETTINGS_KEYS.limits);
  const next = clampLimit(key, value);
  if (next === ALERT_RULES[key]) delete saved[key];
  else saved[key] = next;
  writeJson(storage, SETTINGS_KEYS.limits, saved);
  return readRules(storage);
}

/** "2 hours", "90 min", "1 hour 30 min". */
export function minutesText(minutes) {
  if (minutes < 60) return minutes + " min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + (h === 1 ? " hour" : " hours") + (m ? " " + m + " min" : "");
}
