import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ALERT_RULES } from "../src/alert-config.js";
import { computeAlerts, normalizeFeedback, splitAlerts, trackerAlerts } from "../src/alerts.js";
import { sortEvents, stateAt } from "../src/herd-state.js";
import { ALERTS_OFF_NOTICE, ALERT_JOB_IDS, JOBS, PULL_JOB, alertJobsAreOff, alertsOffNoticeHtml, jobsFor, jobsLine, paintAlertsOffNotice } from "../src/loops.js";
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

// ---- the herd view ------------------------------------------------------------

const mapSrc = readFileSync(new URL("../src/map.js", import.meta.url), "utf8");

test("herd view: one plain line says which automated alerts run", () => {
  const on = readJobs(memory());
  assert.equal(jobsLine(on, ALERT_RULES), "Automatic alerts on: battery below 20%, no check-in for 2 hours, SOS, Predator Watch, Wildfire Watch.");
  assert.equal(jobsLine({ ...on, battery: false, smoke: false }, ALERT_RULES), "Automatic alerts on: no check-in for 2 hours, SOS, Predator Watch. Off: battery, Wildfire Watch.");
  assert.equal(jobsLine(OFF, ALERT_RULES), "Automatic alerts are off. Add alerts by hand below.");
  assert.match(jobsLine(on, { ...ALERT_RULES, lowBatteryPercent: 35, quietMinutes: 90 }), /battery below 35%, no check-in for 1 hour 30 min/);
});

test("herd view: a switch for each job, the limits, and the manual tools", () => {
  for (const id of ["battery", "quiet", "sos", "predator", "smoke"]) assert.ok(mapSrc.includes('["' + id + '",'), id + " has a switch");
  assert.match(mapSrc, /settingRow\("pull"/, "the pull loop has a switch in live mode");
  assert.match(mapSrc, /data-job-state=/, "each switch shows On or Off in words");
  assert.match(mapSrc, /data-limit="' \+ limitKey/, "limits are editable");
  assert.match(mapSrc, /data-add-alert/, "add an alert by hand");
  assert.match(mapSrc, /data-note-form/, "add a note by hand");
  assert.match(mapSrc, /data-mark-checked/, "mark an animal checked");
  assert.match(mapSrc, /Checked by hand/, "the check shows on the animal");
  assert.match(mapSrc, /class="alert-why"/, "each automated alert shows why");
  assert.match(mapSrc, /rules checked /, "and when the rules ran");
  assert.match(mapSrc, /data-change-limit/, "an alert links to its limit");
  assert.match(mapSrc, /view\.jobs\.predator \? state\.alertCells : \[\]/, "no predator marker with the job off");
  assert.match(mapSrc, /view\.jobs\.smoke && state\.smoke/, "no haze with the job off");
  assert.match(mapSrc, /alertsOffNoticeHtml\(view\.jobs\)/);
  assert.match(mapSrc, /paintAlertsOffNotice\(root\.querySelector\("\[data-alerts-off\]"\), view\.jobs\)/);
  assert.match(
    readFileSync(new URL("../src/architecture.js", import.meta.url), "utf8"),
    /alertsOffNoticeHtml\(state\)[\s\S]*paintAlertsOffNotice\(root\.querySelector\("\[data-alerts-off\]"\), state\)/
  );
});

test("notice: shown only when every alert job is off", () => {
  const on = readJobs(memory());
  assert.equal(alertJobsAreOff(on), false);
  assert.equal(alertJobsAreOff({ ...on, trace: false, pull: false }), false, "trace and the live-file check are not alert jobs");
  assert.match(alertsOffNoticeHtml(on), /data-alerts-off role="status" hidden><\/p>/);
  assert.ok(!alertsOffNoticeHtml(on).includes(ALERTS_OFF_NOTICE));

  const alertsOff = { ...on };
  for (const id of ALERT_JOB_IDS) alertsOff[id] = false;
  assert.equal(alertsOff.trace, true, "the trace job can stay on");
  assert.equal(alertsOff.pull, true, "the live-file check can stay on");
  assert.equal(alertJobsAreOff(alertsOff), true);
  const shown = alertsOffNoticeHtml(alertsOff);
  assert.equal(shown.includes(ALERTS_OFF_NOTICE), true);
  assert.ok(!/hidden/.test(shown));
  for (const id of ALERT_JOB_IDS) {
    assert.match(alertsOffNoticeHtml({ ...alertsOff, [id]: true }), / hidden>/, id + " on hides the notice");
    assert.ok(!alertsOffNoticeHtml({ ...alertsOff, [id]: true }).includes("call 911"));
  }

  const el = { hidden: true, textContent: "" };
  paintAlertsOffNotice(el, alertsOff);
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, ALERTS_OFF_NOTICE);
  paintAlertsOffNotice(el, { ...alertsOff, quiet: true });
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, "");
  assert.doesNotThrow(() => paintAlertsOffNotice(null, alertsOff));
});

// ---- How it works and the fleece trace ----------------------------------------

test("How it works: a switch for each job and the pull loop, with its state in words", async () => {
  const { renderArchitecture } = await import("../src/architecture.js");
  const saved = globalThis.localStorage;
  try {
    globalThis.localStorage = memory();
    let html = renderArchitecture();
    for (const id of JOB_IDS) assert.match(html, new RegExp('data-job="' + id + '" checked'), id + " is on by default");
    assert.equal((html.match(/data-job-what="[a-z]+">On\. /g) || []).length, JOB_IDS.length);
    assert.match(html, />Turn every job off</);
    assert.match(html, /data-alerts-off role="status" hidden><\/p>/, "the notice is hidden while an alert job is on");
    assert.ok(!html.includes(ALERTS_OFF_NOTICE));
    setAllJobs(false, globalThis.localStorage);
    setLimit("lowBatteryPercent", 30, globalThis.localStorage);
    html = renderArchitecture();
    assert.ok(!/data-job="[a-z]+" checked/.test(html), "every switch shows off");
    assert.equal((html.match(/data-job-what="[a-z]+">Off\. /g) || []).length, JOB_IDS.length);
    assert.match(html, />Turn every job on</);
    assert.match(html, /Flags tracker batteries below 30%/, "the list reads the rancher's own limit");
    assert.match(html, /still works by hand/);
    assert.ok(html.includes(ALERTS_OFF_NOTICE), "every alert job off shows the notice");
    assert.match(html, /data-alerts-off role="status">Automatic alerts are off/);
    setJob("sos", true, globalThis.localStorage);
    html = renderArchitecture();
    assert.match(html, /data-alerts-off role="status" hidden><\/p>/, "one alert job on hides the notice");
    assert.ok(!html.includes("call 911"));
  } finally {
    globalThis.localStorage = saved;
  }
});

test("fleece trace: says why the records are linked, and works by hand with tracing off", () => {
  const trace = readFileSync(new URL("../src/trace.js", import.meta.url), "utf8");
  assert.match(trace, /readJobs\(\)\.trace/, "the trace job can be off");
  assert.match(trace, /Tracing is off, so the records are not linked/);
  assert.match(trace, /data-link-once/, "link once by hand");
  assert.match(trace, /Linked by hand at /);
  assert.match(trace, /Linked by the trace job at /);
  assert.match(trace, /the lot lists fleece /);
  assert.match(trace, /viewer !== "rancher"/, "no record IDs in the reason for buyers or the public");
});

test("copy: pages lead with the job, and Reset demo keeps a rancher's own notes", () => {
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.match(read("src/home.js"), /checks each tracker\\?'s battery and check-ins/);
  assert.match(read("src/home.js"), /Each of those jobs can be turned off\. When a job is off, its alerts stop, and you can still add alerts, notes and checks by hand/);
  assert.match(mapSrc, /Check each goat's battery and last check-in, and answer open alerts/);
  assert.match(read("src/tour.js"), /key !== LOG_KEYS\.rancher/);
  assert.match(read("README.md"), /Battery 14%, below the 20% limit, not on outside power/);
  assert.match(read("README.md"), /With every job off, a rancher can still/);
  const license = "The code is MIT licensed, so anyone may use it. Joining the community network through a self-hosted or co-op server is free for non-commercial and research use.";
  assert.ok(read("src/home.js").includes(license));
  assert.ok(read("src/architecture.js").includes(license));
  assert.ok(read("README.md").includes(license));
  assert.match(read("README.md"), /Open models that BitPrairie builds on keep their own licenses\./);
  assert.match(mapSrc, /Map layers come from public agencies, plus Esri basemaps when an ArcGIS key is set\./);
  assert.match(read(".env.example"), /referrer-restricted key limited to basemaps and features/);
  assert.match(read("docs/rancher-access.md"), /The sign-in rate limiter is kept in memory, so it resets when the server restarts/);
  assert.match(read("docs/rancher-access.md"), /Limit it to basemaps and features/);
});
