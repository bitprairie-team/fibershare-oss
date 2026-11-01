import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ALERT_RULES } from "../src/alert-config.js";
import { computeAlerts, normalizeFeedback, splitAlerts, trackerAlerts } from "../src/alerts.js";
import { sortEvents, stateAt } from "../src/herd-state.js";
import { JOBS, PULL_JOB, jobsFor } from "../src/loops.js";
import { createRanchLog, entriesFor, lastChecked, normalizeEntry } from "../src/ranch-log.js";
import { JOB_IDS, LIMITS, SETTINGS_KEYS, readJobs, readRules, setAllJobs, setJob, setLimit } from "../src/settings.js";

function memory() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

const herd = JSON.parse(readFileSync(new URL("../public/data/herd.json", import.meta.url)));
const day = JSON.parse(readFileSync(new URL("../public/data/events.json", import.meta.url)));
const END = "2026-09-06T18:05:00";
const events = sortEvents(day.events);
const endState = stateAt(herd.goats, events, events.length, { uplinksStart: herd.uplinksStart, now: END });
const OFF = Object.fromEntries(JOB_IDS.map((id) => [id, false]));

// ---- toggles ------------------------------------------------------------------

test("jobs: every job is on until turned off, and the choice is saved", () => {
  const s = memory();
  assert.deepEqual(readJobs(s), Object.fromEntries(JOB_IDS.map((id) => [id, true])));
  setJob("battery", false, s);
  assert.equal(readJobs(s).battery, false);
  assert.equal(readJobs(s).quiet, true);
  assert.equal(JSON.parse(s.getItem(SETTINGS_KEYS.jobs)).battery, false);
  setJob("battery", true, s);
  assert.equal(readJobs(s).battery, true);
  setJob("not-a-job", false, s);
  assert.ok(!("not-a-job" in readJobs(s)));
  assert.deepEqual(setAllJobs(false, s), OFF);
  assert.deepEqual(readJobs(s), OFF);
});

test("jobs: broken or blocked storage falls back to every job on", () => {
  const s = memory();
  s.setItem(SETTINGS_KEYS.jobs, "{not json");
  assert.equal(readJobs(s).sos, true);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readJobs(blocked).quiet, true);
  assert.doesNotThrow(() => setJob("quiet", false, blocked));
});

test("jobs: the How it works list covers the six jobs and the pull loop", () => {
  assert.deepEqual([...JOBS, PULL_JOB].map((j) => j.id), JOB_IDS);
  for (const job of [...JOBS, PULL_JOB]) assert.ok(job.off && job.off.length < 90, job.id + " says what still works when off");
});

test("limits: a rancher can change them, within sane bounds", () => {
  const s = memory();
  assert.equal(readRules(s).lowBatteryPercent, ALERT_RULES.lowBatteryPercent);
  assert.equal(setLimit("lowBatteryPercent", 30, s).lowBatteryPercent, 30);
  assert.equal(setLimit("quietMinutes", 90, s).quietMinutes, 90);
  assert.equal(setLimit("lowBatteryPercent", 500, s).lowBatteryPercent, LIMITS.lowBatteryPercent.max);
  assert.equal(setLimit("quietMinutes", 1, s).quietMinutes, LIMITS.quietMinutes.min);
  assert.equal(setLimit("quietMinutes", "abc", s).quietMinutes, ALERT_RULES.quietMinutes);
  assert.equal(readRules(s).noteMaxLength, ALERT_RULES.noteMaxLength, "only the limits change");
  const jobs = jobsFor(readRules(s));
  assert.equal(jobs[0].name, "Flags tracker batteries below " + LIMITS.lowBatteryPercent.max + "%");
});

test("limits: a higher battery limit raises more alerts, a lower one fewer", () => {
  const count = (pct) => trackerAlerts(endState.animals, END, { ...ALERT_RULES, lowBatteryPercent: pct }).filter((a) => a.kind === "battery").length;
  assert.ok(count(90) > count(20));
  assert.equal(count(5), 0);
});

test("toggles: a job that is off raises nothing of its kind", () => {
  const all = computeAlerts({ animals: endState.animals, events: endState.shown, now: END });
  const kinds = new Set(all.map((a) => a.kind));
  assert.ok(kinds.has("battery") && kinds.has("quiet") && kinds.has("predator") && kinds.has("smoke"), "the sample day raises each kind");
  for (const id of ["battery", "quiet", "predator", "smoke"]) {
    const some = computeAlerts({ animals: endState.animals, events: endState.shown, now: END, jobs: { ...readJobs(memory()), [id]: false } });
    assert.ok(!some.some((a) => a.kind === id), id + " off");
    assert.ok(some.length > 0, "the other jobs still run");
  }
  const sos = [{ id: "t", name: "T", lastSeen: END, sos: true }];
  assert.equal(trackerAlerts(sos, END, ALERT_RULES, { ...OFF, sos: true }).length, 1);
  assert.equal(trackerAlerts(sos, END, ALERT_RULES, OFF).length, 0);
  assert.deepEqual(computeAlerts({ animals: endState.animals, events: endState.shown, now: END, jobs: OFF }), []);
});

// ---- why ----------------------------------------------------------------------

test("why: each automated alert names the rule, the reading, and when it ran", () => {
  const all = computeAlerts({ animals: endState.animals, events: endState.shown, now: END });
  for (const a of all) {
    assert.ok(a.why && a.why.endsWith("."), a.id + " has a why");
    assert.equal(a.ranAt, END, a.id + " says when the rules ran");
  }
  const battery = trackerAlerts([{ id: "t", name: "T", battery: 14, lastSeen: END }], END);
  assert.equal(battery[0].why, "Battery 14%, below the 20% limit, not on outside power.");
  const quiet = trackerAlerts([{ id: "t", name: "T", battery: 80, lastSeen: "2026-09-06T14:40:00" }], END)[0];
  assert.equal(quiet.why, "Last check-in 14:40, 3 hours 25 min before 18:05, over the limit of 2 hours.");
  const ninety = trackerAlerts([{ id: "t", name: "T", lastSeen: "2026-09-06T16:00:00" }], END, { ...ALERT_RULES, quietMinutes: 90 })[0];
  assert.match(ninety.why, /over the limit of 1 hour 30 min\.$/);
  const sos = trackerAlerts([{ id: "t", name: "T", lastSeen: "2026-09-06T16:40:00", sos: true }], END).find((a) => a.kind === "sos");
  assert.equal(sos.why, "The tracker sent its SOS flag at 16:40.");
  const predator = all.find((a) => a.kind === "predator");
  assert.match(predator.why, /^Predator Watch report for cell [A-F][1-4] at \d\d:\d\d: .+\.$/);
  assert.match(all.find((a) => a.kind === "smoke").why, /^Wildfire Watch report at \d\d:\d\d: .+\.$/);
});

// ---- by hand ------------------------------------------------------------------

test("by hand: notes, checks and alerts work with every job off", () => {
  const s = memory();
  const log = createRanchLog("demo", { storage: s });
  assert.throws(() => log.add({ type: "note", animalId: "bramble", text: "  " }), /Write a note/);
  assert.throws(() => log.add({ type: "checked" }), /Pick an animal/);
  log.add({ type: "note", animalId: "bramble", text: "Limping on the left front." }, { now: "2026-09-06T17:00:00.000Z" });
  log.add({ type: "checked", animalId: "bramble" }, { now: "2026-09-06T17:30:00.000Z" });
  const list = log.add({ type: "alert", animalId: "hazel", text: "Fence down by the gate" }, { now: "2026-09-06T17:45:00.000Z" });
  assert.equal(list.length, 3);
  assert.equal(entriesFor(list, "bramble").length, 2);
  assert.equal(entriesFor(list, "bramble")[0].type, "checked", "newest first");
  assert.equal(lastChecked(list, "bramble"), "2026-09-06T17:30:00.000Z");
  assert.equal(lastChecked(list, "hazel"), null);

  const alerts = computeAlerts({ animals: endState.animals, events: endState.shown, now: END, jobs: OFF, log: list });
  assert.equal(alerts.length, 1, "only the hand-made alert");
  const [mine] = alerts;
  assert.equal(mine.kind, "manual");
  assert.equal(mine.title, "Hazel: Fence down by the gate");
  assert.equal(mine.why, "Added by hand.");
  assert.equal(mine.ranAt, undefined, "no job ran");

  // It can be answered like any other alert.
  const answer = normalizeFeedback({ alertId: mine.id, kind: "manual", answer: "dismissed", title: mine.title });
  assert.ok(answer.ok);
  assert.equal(splitAlerts(alerts, [answer.entry]).open.length, 0);
  assert.equal(createRanchLog("demo", { storage: s }).load().length, 3, "saved across loads");
  assert.equal(createRanchLog("public", { storage: s }).load().length, 0, "sample notes stay apart from live ones");
});

test("by hand: entries are tidied and checked", () => {
  const { entry } = normalizeEntry({ type: "note", animalId: "bramble", text: "a\n\nb  " + "x".repeat(400), extra: 1 }, { now: "2026-09-06T17:00:00.000Z", id: "n1" });
  assert.equal(entry.text.length, ALERT_RULES.noteMaxLength);
  assert.ok(entry.text.startsWith("a b "));
  assert.equal(entry.extra, undefined);
  assert.equal(normalizeEntry({ type: "note", animalId: "<script>", text: "x" }).ok, false);
  assert.equal(normalizeEntry({ type: "alert", text: "Water trough empty" }).ok, true, "an alert needs no animal");
  assert.equal(normalizeEntry({ type: "delete" }).ok, false);
});
