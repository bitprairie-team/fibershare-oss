import { ago, dateTime, dayTime, timeOf } from "./time.js";
import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { cellLabels, cellOf } from "./grid.js";
import { herdStats, keyMoments, sortEvents, stateAt } from "./herd-state.js";
import { icon } from "./icons.js";
import { spreadPins } from "./pin-spread.js";
import { loadHerd, setHideTrackers, setPreferSample } from "./data.js";
import { lotsForAnimal } from "./records-data.js";
import { ALERT_RULES } from "./alert-config.js";
import { computeAlerts, latestAnswers, splitAlerts } from "./alerts.js";
import { alertScope, createAlertStore } from "./alert-store.js";
import { LIMITS, readJobs, readRules, setJob, setLimit } from "./settings.js";
import { createRanchLog, entriesFor, lastChecked } from "./ranch-log.js";
import { PULL_SECONDS, alertsOffNoticeHtml, jobsLine, paintAlertsOffNotice } from "./loops.js";

const ALERT_KIND = {
  manual: ["info", "Added by hand"],
  battery: ["battery", "Low battery"],
  quiet: ["wifiOff", "Quiet tracker"],
  sos: ["alert", "SOS"],
  predator: ["paw", "Predator Watch"],
  smoke: ["smoke", "Wildfire Watch"],
};
const EVENT_LABELS = {
  checkin: "Check-in",
  battery: "Battery",
  silent: "Missed check-in",
  smoke: "Wildfire Watch",
  "smoke-clear": "Wildfire Watch, cleared",
  predator: "Predator Watch",
  "predator-clear": "Predator Watch, cleared",
  sos: "SOS",
};
const STALE_MINUTES = 15;
let view = null;
let rancherMap = null;
// The picked animal, kept when the page draws again after a new live file.
let keepSelected = null;

// The sample day has no "today" before the first check-in.
const agoOf = (iso, nowIso) => ago(iso, nowIso, "not yet today");

function initials(name) {
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    return parts[0][0].toUpperCase() + parts[parts.length - 1];
  }
  return String(name).slice(0, 2);
}

function isAlert(event) {
  return event.severity === "alert" || event.severity === "watch";
}

function stage(data, animals, live, cells) {
  if (data.rancherMap) {
    const placed = animals.filter((a) => Number.isFinite(a.details?.position?.latitude)).length;
    return (
      '<div class="rancher-map" data-rancher-map role="region" aria-label="Map of tracker positions"><p class="muted map-loading">Loading the map…</p></div>' +
      '<p class="pasture-legend map-legend">' + placed + " of " + animals.length + " trackers have a position. Map layers come from public agencies, plus Esri basemaps when an ArcGIS key is set.</p>"
    );
  }
  const legend = data.mapSpan
    ? "Local map from tracker positions · about " + data.mapSpan + " m across · north is up" +
      (animals.some((a) => !a.onMap) ? " · " + animals.filter((a) => !a.onMap).length + " without a position yet" : "")
    : live
      ? data.privateView
        ? "No positions yet · grid cells from a hash"
        : "Grid cells come from a hash · not GPS"
      : "";
  return (
    (data.mapSpan
      ? '<div class="paddock paddock-map" id="paddock" role="group" aria-label="Local map of tracker positions">'
      : '<div class="paddock" id="paddock" role="group" aria-label="Paddock grid, 6 by 4 cells. Arrow keys move between animals, Enter shows one.">' +
        '<div class="paddock-cells" aria-hidden="true">' + cells + "</div>") +
    '<div class="paddock-haze" data-haze hidden></div>' +
    "<div data-pins></div>" +
    (legend ? '<div class="pasture-legend">' + legend + "</div>" : "") +
    "</div>"
  );
}

const SETTING_ROWS = [
  ["battery", "Battery alerts", "lowBatteryPercent", "Below", "%"],
  ["quiet", "Quiet-tracker alerts", "quietMinutes", "After", "minutes with no check-in"],
  ["sos", "SOS alerts"],
  ["predator", "Predator Watch reports"],
  ["smoke", "Wildfire Watch reports"],
];

function settingRow(id, label, limitKey, before, after) {
  const on = view.jobs[id];
  return (
    '<li class="setting-row">' +
    '<label class="toggle"><input type="checkbox" data-job="' + id + '"' + (on ? " checked" : "") + " /> " + label + "</label>" +
    '<span class="job-state" data-job-state="' + id + '">' + (on ? "On" : "Off") + "</span>" +
    (limitKey
      ? '<label class="limit">' + before + ' <input type="number" inputmode="numeric" data-limit="' + limitKey + '" min="' + LIMITS[limitKey].min + '" max="' + LIMITS[limitKey].max + '" step="1" value="' + view.rules[limitKey] + '" /> ' + after + "</label>"
      : "") +
    "</li>"
  );
}

function settingsHtml(live) {
  const rows = SETTING_ROWS.map((r) => settingRow(...r));
  if (live) rows.push(settingRow("pull", "Check for a new live file every " + PULL_SECONDS / 60 + " minutes"));
  return (
    '<details class="disclosure settings" data-settings id="alert-settings"><summary>Alert settings</summary>' +
    '<p class="fine-print settings-note">Each job runs only while it is on. Answers, notes and alerts you add by hand work either way. Saved in this browser.</p>' +
    '<ul class="settings-list">' + rows.join("") + "</ul>" +
    '<p class="fine-print"><a href="#/architecture">Every automated job</a></p>' +
    "</details>"
  );
}

function addAlertForm(animals) {
  const options = ['<option value="">No animal</option>', ...animals.map((a) => '<option value="' + esc(a.id) + '">' + esc(a.name) + "</option>")].join("");
  return (
    '<form class="add-alert" data-add-alert>' +
    '<p class="add-alert-title" id="add-alert-title">Add an alert by hand</p>' +
    '<div class="alert-answer">' +
    '<label class="visually-hidden" for="add-alert-animal">Animal</label>' +
    '<select id="add-alert-animal" class="alert-note add-alert-animal" data-add-animal>' + options + "</select>" +
    '<label class="visually-hidden" for="add-alert-text">What needs attention</label>' +
    '<input id="add-alert-text" class="alert-note" type="text" maxlength="' + ALERT_RULES.noteMaxLength + '" placeholder="What needs attention" autocomplete="off" data-add-text />' +
    '<button type="submit" class="btn btn-ghost btn-small" aria-describedby="add-alert-title">Add alert</button>' +
    "</div></form>"
  );
}

function alertsSection(data, live) {
  return (
    '<section class="section alerts-section" data-tour="alerts" aria-labelledby="alerts-title">' +
    '<h2 class="section-rule" id="alerts-title">Open alerts <span class="count" data-open-count></span></h2>' +
    '<p class="jobs-line"><span data-jobs-line>' + esc(jobsLine(view.jobs, view.rules)) + '</span> <button type="button" class="btn-link" data-open-settings>Change</button></p>' +
    alertsOffNoticeHtml(view.jobs) +
    (live ? "" : '<p class="muted feed-note">Predator Watch and Wildfire Watch reports on the sample day are simulated.</p>') +
    '<p class="notice notice-warn alert-error" data-alert-error role="alert" hidden></p>' +
    '<p class="visually-hidden" data-alert-status role="status"></p>' +
    '<div data-alerts>' +
    settingsHtml(live) +
    '<ol class="alert-list" data-alert-open></ol>' +
    addAlertForm(data.animals) +
    '<details class="disclosure" data-history-box><summary>Answered alerts <span class="count" data-history-count></span></summary>' +
    '<ol class="alert-list alert-history" data-alert-history></ol></details>' +
    "</div>" +
    "</section>"
  );
}

const PLAY = icon("play", { size: 16 }) + "<span>Play</span>";
const PAUSE = icon("pause", { size: 16 }) + "<span>Pause</span>";

function stateBox(kind, iconName, title, text, action) {
  return (
    '<div class="state state-' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '">' +
    '<span class="state-icon">' + icon(iconName, { size: 22 }) + "</span>" +
    "<h2>" + esc(title) + "</h2><p>" + esc(text) + "</p>" + action + "</div>"
  );
}

function notices(data) {
  if (data.mode === "sample" && data.liveStatus === "unreadable") {
    return (
      '<p class="notice notice-warn">' + icon("info", { size: 18 }) +
      "<span>The live file on this server could not be read. Run <code>npm run chirpstack:pull</code> again, then reload. Until then you see the sample herd.</span></p>"
    );
  }
  if (data.mode === "sample" && data.liveStatus === "missing" && data.rancherSignedIn) {
    return (
      '<p class="notice notice-warn">' + icon("info", { size: 18 }) +
      "<span>You are signed in, but this server has no live file yet. Run <code>npm run chirpstack:pull</code> on your own hardware, then reload. Until then you see the sample herd.</span></p>"
    );
  }
  return "";
}

export async function renderMap() {
  const data = await loadHerd();
  const events = sortEvents(data.events);
  view = {
    data,
    events,
    step: events.length,
    selected: null,
    timer: null,
    store: createAlertStore(alertScope(data)),
    feedback: [],
    feedbackReady: false,
    alertError: "",
    saving: false,
    jobs: readJobs(),
    rules: readRules(),
    logStore: createRanchLog(alertScope(data)),
    log: [],
    pullTimer: null,
  };
  view.log = view.logStore.load();
  const animals = data.animals;
  view.selected =
    (animals.find((a) => a.id === keepSelected) || animals.find((a) => a.id === "bramble") || animals[0] || {}).id || null;
  const live = data.mode === "live";

  const pulledMs = live ? new Date(data.pulledAt).getTime() : NaN;
  const stale = live && Number.isFinite(pulledMs) && Date.now() - pulledMs > STALE_MINUTES * 60000;
  const pulled = live ? (Number.isFinite(pulledMs) ? "Pulled " + agoOf(data.pulledAt, new Date().toISOString()) : "Pull time unknown") : "";
  const sourceBadge = live
    ? '<div class="source-line"><span class="source-label">Live from your network server</span>' +
      '<span class="muted source-time" data-pulled title="' + esc(dateTime(data.pulledAt)) + '">' + esc(pulled) + "</span></div>" +
      '<p class="fine-print source-note" data-pull-line>' +
      (view.jobs.pull ? "Checks for a new file every " + PULL_SECONDS / 60 + " minutes." : "Automatic check is off.") +
      ' <button type="button" class="btn-link" data-pull-now>Check now</button></p>' +
      '<div class="source-line">' +
      '<label class="toggle"><input type="checkbox" data-hide' + (data.hide ? " checked" : "") + (data.rancher ? "" : " disabled") + " /> Hide tracker details</label>" +
      '<button type="button" class="btn btn-ghost btn-small" data-source="sample">Show sample data</button></div>' +
      (data.rancher ? "" : '<p class="fine-print source-note">Tracker details are hidden for the public. <a href="#/rancher">Rancher sign-in</a></p>') +
      (data.rancher && !data.hide && data.exportHidden
        ? '<p class="fine-print source-note">This file was written with tracker details hidden. Run the pull with <code>FIBERSHARE_HIDE_TRACKERS=0</code> to see real values.</p>'
        : "") +
      (stale
        ? '<p class="fine-print source-note stale-note">This file is more than ' + STALE_MINUTES + " minutes old, so check-ins may look missed." +
          (data.rancher ? " Keep it fresh with <code>npm run chirpstack:pull -- --watch=120</code>." : "") + "</p>"
        : "")
    : data.liveAvailable
      ? '<button type="button" class="btn btn-ghost btn-small" data-source="live">Show live data</button>'
      : "";

  const lede = live
    ? data.privateView
      ? "Your trackers with real names, device IDs, tags and positions. Only a signed-in rancher gets this view."
      : "Trackers from your LoRaWAN network server, with names, device IDs, tags and positions hidden. Each grid cell comes from a hash, not a position."
    : "Check each goat's battery and last check-in, and answer open alerts. The 8 sample goats sit on a paddock grid, which is a drawing, not a map.";

  const cells = cellLabels()
    .map((label) => '<div class="cell" data-cell="' + label + '"><span>' + label + "</span></div>")
    .join("");

  const body = animals.length
    ? notices(data) +
      '<dl class="stat-row" data-stats></dl>' +
      '<div class="herd-layout">' +
      '<div class="herd-main" data-tour="grid">' +
      '<div class="paddock-wrap"><div class="paddock-banner" data-banner hidden></div>' + stage(data, animals, live, cells) + "</div>" +
      (events.length
        ? '<div class="playback">' +
          '<button type="button" class="btn btn-ghost btn-small" data-play>' + PLAY + "</button>" +
          '<label class="visually-hidden" for="scrub">Time of day</label>' +
          '<input id="scrub" type="range" min="0" max="' + events.length + '" value="' + events.length + '" data-scrub />' +
          '<output class="clock" for="scrub" data-clock></output>' +
          "</div>"
        : "") +
      "</div>" +
      '<aside class="detail" data-detail data-tour="detail" aria-label="Animal details">' +
      '<button type="button" class="sheet-handle" data-sheet aria-expanded="false"><span class="avatar" data-sheet-avatar></span><span class="sheet-title"><strong data-sheet-name></strong><small data-sheet-meta></small></span>' +
      icon("chevronUp", { cls: "i-up" }) + icon("chevronDown", { cls: "i-down" }) + "</button>" +
      '<div class="detail-body" data-detail-body aria-live="polite"></div></aside>' +
      "</div>" +
      alertsSection(data, live) +
      '<details class="disclosure feed-section" data-tour="feed"><summary>Show all events <span class="count">' + events.length + "</span></summary>" +
      '<ol class="feed" data-feed></ol></details>'
    : data.loadFailed
      ? stateBox(
          "error",
          "alert",
          "The herd did not load",
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "This device is offline. Reconnect, then try again."
            : "The sample herd file could not be read. Try again in a moment.",
          '<button type="button" class="btn btn-primary" data-retry>' + icon("reset", { size: 18 }) + "Try again</button>"
        )
      : live
        ? stateBox("empty", "herd", "No trackers in the live file", "The last pull found no trackers. Check the network server, then run the pull again.", '<button type="button" class="btn btn-ghost" data-source="sample">Show sample data</button>')
        : stateBox("empty", "herd", "No animals yet", "Add goats to public/data/herd.json, then reload.", "");

  return (
    nav("/map") +
    '<main class="wrap wrap-wide herd-page" id="main">' +
    '<section class="page-head head-row"><div>' +
    "<h1>" +
    esc(data.ranch) +
    '</h1><p class="lede">' +
    (data.loadFailed && !animals.length ? "The herd view needs the sample herd file." : lede) +
    '</p></div><div class="source-box">' +
    sourceBadge +
    "</div></section>" +
    body +
    "</main>" +
    footer()
  );
}

let resizeObserver = null;

function currentState() {
  const sample = view.data.mode !== "live";
  return stateAt(view.data.animals, view.events, view.step, sample ? { uplinksStart: view.data.uplinksStart, now: clockIso() } : {});
}

// The time alerts are measured from: the sample day's clock, or the real
// clock for live data at the end of the feed.
function alertNow() {
  if (view.data.mode === "live" && view.step >= view.events.length) return new Date().toISOString();
  return clockIso();
}

function alertsFor(state) {
  const all = computeAlerts({ animals: state.animals, events: state.shown, now: alertNow(), rules: view.rules, jobs: view.jobs, log: view.log });
  return { all, ...splitAlerts(all, view.feedback) };
}

function clockIso() {
  if (view.step >= view.events.length) return view.data.now;
  const event = view.events[Math.max(0, view.step - 1)];
  return event ? event.time : view.data.now;
}

function renderPins(root, state, alerts) {
  const holder = root.querySelector("[data-pins]");
  if (!holder) return;
  const existing = new Map([...holder.querySelectorAll(".goat")].map((el) => [el.dataset.id, el]));
  const box = holder.parentElement?.getBoundingClientRect();
  const shown = state.animals.filter((animal) => !(view.data.mapSpan && !animal.onMap));
  const drawAt = new Map(spreadPins(shown, box?.width || 0, box?.height || 0).map((p) => [p.id, p]));
  for (const animal of state.animals) {
    if (view.data.mapSpan && !animal.onMap) continue;
    let pin = existing.get(animal.id);
    if (!pin) {
      pin = document.createElement("button");
      pin.type = "button";
      pin.className = "goat";
      pin.dataset.id = animal.id;
      pin.innerHTML =
        '<span class="goat-short" aria-hidden="true">' + esc(initials(animal.alias || animal.name)) + "</span>" +
        '<span class="goat-full" aria-hidden="true">' + esc(animal.name) + "</span>" +
        '<span class="visually-hidden" data-pin-label></span>';
      pin.addEventListener("click", () => select(root, animal.id));
      holder.appendChild(pin);
    }
    const at = drawAt.get(animal.id) || animal;
    pin.style.left = at.x.toFixed(2) + "%";
    pin.style.top = at.y.toFixed(2) + "%";
    const on = animal.id === view.selected;
    pin.classList.toggle("is-active", on);
    const mine = alerts.all.filter((a) => a.animalId === animal.id);
    pin.classList.toggle("is-low", mine.some((a) => a.kind === "battery"));
    pin.classList.toggle("is-silent", animal.silent || mine.some((a) => a.kind === "quiet"));
    pin.classList.toggle("has-alert", alerts.open.some((a) => a.animalId === animal.id));
    pin.classList.toggle("is-sos", Boolean(animal.sos || animal.sensors?.sos));
    pin.setAttribute("aria-pressed", String(on));
    // The accessible name is the full name, which the pin shows when picked.
    const open = alerts.open.filter((a) => a.animalId === animal.id).map((a) => ALERT_KIND[a.kind][1].toLowerCase());
    const label = animal.name + (view.data.mapSpan ? "" : ", cell " + cellOf(animal.x, animal.y)) + (open.length ? ", open alert: " + open.join(", ") : "");
    const holderLabel = pin.querySelector("[data-pin-label]");
    if (holderLabel && holderLabel.textContent !== label) holderLabel.textContent = label;
    pin.title = animal.name;
  }
  // One tab stop for the whole grid: the picked animal. Arrow keys move
  // between pins from there.
  const pins = [...holder.querySelectorAll(".goat")];
  const current = pins.find((pin) => pin.dataset.id === view.selected) || pins[0];
  for (const pin of pins) pin.tabIndex = pin === current ? 0 : -1;
}

function renderStats(root, state, alerts) {
  const holder = root.querySelector("[data-stats]");
  if (!holder) return;
  // Live data counts from the real clock; the sample day from its own clock.
  const nowMs = view.data.mode === "live" ? Date.now() : new Date(clockIso()).getTime();
  const stats = herdStats({ animals: state.animals, openAlerts: alerts.open.length, nowMs });
  const html = stats
    .map((st) => {
      const value = st.id === "last" ? (st.value ? dayTime(st.value, nowMs) : "not yet") : st.value;
      return '<div class="stat' + ((st.warn && st.id === "open") || (st.id === "reporting" && /^0 of [1-9]/.test(st.value)) ? " stat-warn" : "") + '"><dt>' + esc(st.label) + "</dt><dd>" + esc(value) + "</dd></div>";
    })
    .join("");
  if (holder.dataset.html !== html) {
    holder.dataset.html = html;
    holder.innerHTML = html;
  }
}

function renderGrid(root, state, alerts) {
  // Predator and smoke markers come from their jobs. Off means no marker.
  const alertCells = view.jobs.predator ? state.alertCells : [];
  const smoke = view.jobs.smoke && state.smoke;
  root.querySelectorAll(".cell").forEach((cell) => {
    cell.classList.toggle("is-alert", alertCells.includes(cell.dataset.cell));
  });
  const haze = root.querySelector("[data-haze]");
  if (haze) haze.hidden = !smoke;
  const banner = root.querySelector("[data-banner]");
  if (banner) {
    const cards = [];
    const answers = latestAnswers(view.feedback);
    const answerOf = (kind, cell) => {
      const a = alerts.all.find((x) => x.kind === kind && !x.cleared && (kind !== "predator" || x.title.endsWith(cell)));
      const f = a && answers.get(a.id);
      return f && f.answer !== "reopened" ? f.answer : "";
    };
    for (const cell of alertCells) cards.push(["", "Predator Watch reported activity near " + cell, answerOf("predator", cell)]);
    if (smoke) cards.push([" is-smoke", "Wildfire Watch reported smoke upwind", answerOf("smoke")]);
    const html = cards
      .map(
        ([cls, title, answer]) =>
          '<div class="alert-card' + cls + '" role="status"><strong>' + esc(title) + "</strong>" +
          (answer ? '<span class="alert-state">' + (answer === "confirmed" ? "Confirmed" : "Dismissed") + "</span>" : "") +
          "</div>"
      )
      .join("");
    banner.hidden = cards.length === 0;
    // Only touch the DOM when the alerts change, so the cards do not flicker.
    if (banner.dataset.html !== html) {
      banner.dataset.html = html;
      banner.innerHTML = html;
    }
  }
  const clock = root.querySelector("[data-clock]");
  if (clock) clock.textContent = timeOf(clockIso());
  // Screen readers hear the time of day, not the event number.
  const scrubber = root.querySelector("[data-scrub]");
  if (scrubber) scrubber.setAttribute("aria-valuetext", timeOf(clockIso()) + ", event " + view.step + " of " + view.events.length);
}

function batteryBar(value) {
  if (!Number.isFinite(value)) return '<span class="muted">not reported</span>';
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    '<span class="battery' + (pct < view.rules.lowBatteryPercent ? " is-low" : "") + '" role="img" aria-label="Battery ' + pct + ' percent">' +
    '<span style="width:' + pct + '%"></span></span> ' + pct + "%"
  );
}

function mask() {
  return '<span class="muted">hidden</span>';
}

function liveRows(animal, full) {
  const d = full ? animal.details || {} : {};
  const tags = Object.entries(d.tags || {});
  const signalParts = [d.snr !== null && d.snr !== undefined ? "SNR " + d.snr + " dB" : "", d.rssi !== null && d.rssi !== undefined ? "RSSI " + d.rssi + " dBm" : ""].filter(Boolean);
  const signal = animal.signal ? esc(animal.signal) : '<span class="muted">no reading</span>';
  const rows = [
    ["Alias", esc(animal.alias)],
    ["DevEUI", full ? "<code>" + esc(d.devEui || "") + "</code>" : mask()],
    ["Signal", signal + (full && signalParts.length ? ' <span class="muted">(' + esc(signalParts.join(", ")) + ")</span>" : "")],
    ["Uplinks", esc(String(animal.uplinks24h ?? 0)) + " in " + esc(String(view.data.windowHours)) + " h"],
  ];
  if (full) {
    if (d.profile) rows.push(["Profile", esc(d.profile)]);
    if (d.description) rows.push(["Description", esc(d.description)]);
    rows.push(["Tags", tags.length ? tags.map(([k, v]) => "<code>" + esc(k) + "=" + esc(v) + "</code>").join(" ") : '<span class="muted">none</span>']);
    const pos = d.position;
    rows.push([
      "Position",
      pos
        ? "<code>" + esc(pos.latitude.toFixed(5)) + ", " + esc(pos.longitude.toFixed(5)) + "</code>" + ' <span class="muted">(' + esc(timeOf(pos.at)) + ")</span>"
        : '<span class="muted">no fix yet</span>',
    ]);
  }
  rows.push(["Status", esc(animal.status || "unknown")]);
  return rows;
}

function sensorRows(animal) {
  const s = animal.sensors || {};
  const rows = [];
  if (Number.isFinite(s.temperature)) rows.push(["Temperature", esc(String(s.temperature)) + " °C"]);
  if (Number.isFinite(s.light)) rows.push(["Light", esc(String(s.light))]);
  if (Number.isFinite(s.motion)) rows.push(["Motion", esc(String(s.motion))]);
  if (s.sos || animal.sos) rows.push(["SOS", "SOS sent"]);
  return rows;
}

// Notes and checks for the picked animal. Drawn only when the animal or the
// log changes, so a note being typed survives playback.
function renderLog(holder, animal) {
  const entries = entriesFor(view.log, animal.id);
  const key = animal.id + ":" + entries.length + ":" + (view.logError || "");
  if (holder.dataset.key === key) return;
  const typed = holder.querySelector("[data-note-text]");
  const keepText = typed && holder.dataset.key?.startsWith(animal.id + ":") ? typed.value : "";
  const hadFocus = typed && document.activeElement === typed;
  holder.dataset.key = key;
  const items = entries
    .slice(0, 5)
    .map(
      (e) =>
        '<li><time datetime="' + esc(e.at) + '">' + esc(dateTime(e.at)) + "</time> " +
        (e.type === "checked" ? "Checked by hand" + (e.text ? ": " + esc(e.text) : "") : esc(e.text)) +
        "</li>"
    )
    .join("");
  holder.innerHTML =
    '<form class="note-form" data-note-form>' +
    '<label class="note-label" for="note-text">Note on ' + esc(animal.name) + "</label>" +
    '<input id="note-text" class="alert-note" type="text" maxlength="' + ALERT_RULES.noteMaxLength + '" autocomplete="off" placeholder="What you saw" data-note-text />' +
    '<div class="note-actions"><button type="submit" class="btn btn-ghost btn-small">Save note</button>' +
    '<button type="button" class="btn btn-ghost btn-small" data-mark-checked>Mark checked</button></div>' +
    (view.logError ? '<p class="notice notice-warn" role="alert">' + esc(view.logError) + "</p>" : "") +
    "</form>" +
    (items ? '<ol class="note-list" aria-label="Notes and checks on ' + esc(animal.name) + '">' + items + "</ol>" : "");
  const input = holder.querySelector("[data-note-text]");
  if (keepText) input.value = keepText;
  if (hadFocus) input.focus();
}

function addLog(root, entry, message) {
  try {
    view.log = view.logStore.add(entry);
    view.logError = "";
    const status = root.querySelector("[data-alert-status]");
    if (status) status.textContent = message;
    return true;
  } catch (error) {
    view.logError = error?.message || "Not saved.";
    return false;
  } finally {
    draw(root);
  }
}

function renderDetail(root, state, alerts) {
  const body = root.querySelector("[data-detail-body]");
  if (!body) return;
  if (!body.querySelector("[data-detail-facts]")) body.innerHTML = '<div data-detail-facts></div><div class="detail-log" data-detail-log></div>';
  const holder = body.querySelector("[data-detail-facts]");
  const logHolder = body.querySelector("[data-detail-log]");
  const animal = state.animals.find((a) => a.id === view.selected);
  const sheetName = root.querySelector("[data-sheet-name]");
  if (!animal) {
    holder.innerHTML = '<p class="muted">Pick an animal on the grid or in the list.</p>';
    logHolder.innerHTML = "";
    logHolder.dataset.key = "";
    if (sheetName) sheetName.textContent = "Pick an animal";
    return;
  }
  if (sheetName) {
    sheetName.textContent = animal.name;
    root.querySelector("[data-sheet-avatar]").textContent = initials(animal.alias || animal.name);
    root.querySelector("[data-sheet-meta]").textContent =
      (Number.isFinite(animal.battery) ? "Battery " + Math.round(animal.battery) + "%" : "Battery not reported") + " · " + (animal.lastSeen ? "seen " + agoOf(animal.lastSeen, clockIso()) : "not seen yet");
  }
  const live = view.data.mode === "live";
  const full = live && view.data.privateView;
  const lots = live ? [] : lotsForAnimal(animal.id);
  const rows = [
    ...(live ? liveRows(animal, full) : []),
    ["Battery", batteryBar(animal.battery) + (animal.externalPower ? " · on outside power" : "")],
    ["Last check-in", animal.lastSeen ? esc(dayTime(animal.lastSeen, new Date(clockIso()).getTime())) + ' <span class="muted">(' + esc(ago(animal.lastSeen, clockIso())) + ")</span>" : '<span class="muted">not yet</span>'],
    ["Checked by hand", lastChecked(view.log, animal.id) ? esc(dateTime(lastChecked(view.log, animal.id))) : '<span class="muted">not yet</span>'],
    ...(full && animal.onMap ? [] : [["Grid cell", esc(cellOf(animal.x, animal.y))]]),
    ...(live ? sensorRows(animal) : []),
    [
      "Alerts",
      alerts.open.some((a) => a.animalId === animal.id)
        ? alerts.open
            .filter((a) => a.animalId === animal.id)
            .map((a) => esc(ALERT_KIND[a.kind][1]))
            .join(", ") + ' <button type="button" class="btn-link" data-jump-alerts>Answer</button>'
        : '<span class="muted">none open</span>',
    ],
  ];
  if (!live) rows.splice(0, 0, ["Breed", esc(animal.breed)]);
  holder.innerHTML =
    '<div class="detail-top"><span class="avatar" aria-hidden="true">' + esc(initials(animal.alias || animal.name)) + "</span><div>" +
    "<h2>" + esc(animal.name) + "</h2></div></div>" +
    '<dl class="facts">' + rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") + "</dl>" +
    (lots.length
      ? '<p class="detail-link"><a href="#/trace">Trace ' + esc(animal.name) + "'s fleece</a></p>"
      : "") +
    (live && !full
      ? '<p class="fine-print">' + (view.data.rancher ? "Tracker details are hidden. Turn off Hide tracker details to see them." : "Tracker details are hidden. Only a signed-in rancher can see them.") + "</p>"
      : "") +
    (full ? '<p class="fine-print">This view shows private data. Do not share screenshots of it.</p>' : "");
  renderLog(logHolder, animal);
}

function renderFeed(root, state) {
  const holder = root.querySelector("[data-feed]");
  if (!holder) return;
  const names = new Map(view.data.animals.map((a) => [a.id, a.name]));
  const items = [...state.shown].reverse();
  if (!items.length) {
    holder.innerHTML = '<li class="feed-empty">No events yet at this time of day.</li>';
    return;
  }
  holder.innerHTML = items
    .map((event) => {
      const kind = event.type === "predator" || event.type === "smoke" || event.type === "sos" || event.severity === "alert" ? "is-alert" : isAlert(event) ? "is-watch" : "";
      const who = names.get(event.animalId);
      const label = EVENT_LABELS[event.type] || event.type;
      const inner =
        '<time datetime="' + esc(event.time) + '">' + esc(timeOf(event.time)) + "</time>" +
        '<span class="feed-text"><span class="feed-type">' + esc(label) + (who && view.data.mode !== "live" ? " · " + esc(who) : "") + "</span>" +
        '<span class="feed-body">' + esc(event.text) + "</span></span>";
      // A row with an animal is a button that selects it. Its name is the visible text.
      return (
        '<li class="feed-item ' + kind + '">' +
        (event.animalId
          ? '<button type="button" class="feed-row" data-event-animal="' + esc(event.animalId) + '">' + inner + "</button>"
          : '<div class="feed-row">' + inner + "</div>") +
        "</li>"
      );
    })
    .join("");
  holder.querySelectorAll("[data-event-animal]").forEach((item) => {
    item.addEventListener("click", () => select(root, item.dataset.eventAnimal));
  });
}


function isEvent(kind) {
  return kind === "predator" || kind === "smoke";
}

function openItem(alert) {
  const label = ALERT_KIND[alert.kind][1];
  const noteId = "note-" + alert.id.replace(/[^A-Za-z0-9_-]/g, "-");
  const who = alert.animalId ? view.data.animals.find((a) => a.id === alert.animalId) : null;
  const titleId = "title-" + alert.id.replace(/[^A-Za-z0-9_-]/g, "-");
  return (
    '<li class="alert-item kind-' + alert.kind + '" data-alert="' + esc(alert.id) + '">' +
    '<div class="alert-body">' +
    '<p class="alert-title" id="' + titleId + '"><strong>' + esc(alert.title) + "</strong></p>" +
    (alert.manual ? "" : '<p class="alert-why"><span class="visually-hidden">Why: </span>' + esc(alert.why || "") + "</p>") +
    '<p class="row-meta">' +
    (alert.manual
      ? esc(label) + ' · <time datetime="' + esc(alert.time) + '">' + esc(dateTime(alert.time)) + "</time>"
      : (isEvent(alert.kind) ? "" : esc(label) + " · ") + "rules checked " + '<time datetime="' + esc(alert.ranAt) + '">' + esc(timeOf(alert.ranAt)) + "</time>") +
    (alert.cleared ? " · cleared" : "") +
    (who ? ' · <button type="button" class="btn-link" data-alert-animal="' + esc(who.id) + '">Show ' + esc(who.name) + "</button>" : "") +
    (alert.kind === "battery" || alert.kind === "quiet" ? ' · <button type="button" class="btn-link" data-change-limit="' + (alert.kind === "battery" ? "lowBatteryPercent" : "quietMinutes") + '">Change limit</button>' : "") +
    "</p>" +
    '<div class="alert-answer">' +
    '<label class="visually-hidden" for="' + noteId + '">Note for this answer (optional)</label>' +
    '<input id="' + noteId + '" class="alert-note" type="text" maxlength="' + ALERT_RULES.noteMaxLength + '" placeholder="Note (optional)" autocomplete="off" data-alert-note />' +
    '<button type="button" class="btn btn-ghost btn-small" data-answer="confirmed" aria-describedby="' + titleId + '">Confirm</button>' +
    '<button type="button" class="btn btn-ghost btn-small" data-answer="dismissed" aria-describedby="' + titleId + '">Dismiss</button>' +
    "</div></div></li>"
  );
}

function historyItem(entry) {
  const label = (ALERT_KIND[entry.kind] || ["info", "Alert"])[1];
  const confirmed = entry.answer === "confirmed";
  return (
    '<li class="alert-item is-answered kind-' + esc(entry.kind) + '" data-alert="' + esc(entry.alertId) + '">' +
    '<div class="alert-body">' +
    '<p class="alert-title"><strong>' + esc(entry.title || label) + '</strong> <span class="alert-state">' + (confirmed ? "Confirmed" : "Dismissed") + "</span></p>" +
    (entry.note ? '<p class="alert-detail alert-note-text">“' + esc(entry.note) + "”</p>" : "") +
    '<p class="row-meta">' + [isEvent(entry.kind) ? "" : label, entry.alertTime ? "alert at " + (entry.kind === "manual" ? dateTime(entry.alertTime) : timeOf(entry.alertTime)) : "", "answered " + dateTime(entry.at)].filter(Boolean).map(esc).join(" · ") +
    ' · <button type="button" class="btn-link" data-reopen>Reopen</button></p>' +
    "</div></li>"
  );
}

function renderAlerts(root, alerts) {
  const openList = root.querySelector("[data-alert-open]");
  const historyList = root.querySelector("[data-alert-history]");
  if (!openList || !historyList) return;
  const err = root.querySelector("[data-alert-error]");
  if (err) {
    err.hidden = !view.alertError;
    err.textContent = view.alertError;
  }
  const count = root.querySelector("[data-open-count]");
  if (count) count.textContent = String(alerts.open.length);
  const historyCount = root.querySelector("[data-history-count]");
  if (historyCount) historyCount.textContent = String(alerts.history.length);
  const key = JSON.stringify([alerts.open.map((a) => a.id + a.cleared), alerts.history.map((f) => f.alertId + f.answer + f.at), view.feedbackReady, view.saving]);
  // Redraw only when the lists change, so a note being typed is kept.
  if (openList.dataset.key === key) return;
  openList.dataset.key = key;
  const notes = new Map([...openList.querySelectorAll("[data-alert]")].map((li) => [li.dataset.alert, li.querySelector("[data-alert-note]")?.value || ""]));
  const focusId = document.activeElement?.closest?.("[data-alert]")?.dataset.alert;
  if (!view.feedbackReady) {
    openList.innerHTML = '<li class="feed-empty">Loading answers…</li>';
    historyList.innerHTML = "";
    return;
  }
  openList.innerHTML = alerts.open.length
    ? alerts.open.map((a) => openItem(a)).join("")
    : '<li class="feed-empty">' + (view.step < view.events.length ? "No open alerts at this time of day." : "No open alerts.") + "</li>";
  historyList.innerHTML = alerts.history.length ? alerts.history.slice(0, 40).map(historyItem).join("") : '<li class="feed-empty">None yet.</li>';
  for (const li of openList.querySelectorAll("[data-alert]")) {
    const input = li.querySelector("[data-alert-note]");
    if (input && notes.get(li.dataset.alert)) input.value = notes.get(li.dataset.alert);
    li.querySelectorAll("button[data-answer]").forEach((b) => (b.disabled = view.saving));
    if (li.dataset.alert === focusId) input?.focus();
  }
}

async function answer(root, alertId, value, note) {
  const state = currentState();
  const alerts = alertsFor(state);
  const alert = alerts.all.find((a) => a.id === alertId);
  const past = latestAnswers(view.feedback).get(alertId);
  const base = alert
    ? { kind: alert.kind, title: alert.title, animalId: alert.animalId, alertTime: alert.time }
    : past
      ? { kind: past.kind, title: past.title, animalId: past.animalId, alertTime: past.alertTime }
      : null;
  if (!base) return;
  view.saving = true;
  view.alertError = "";
  draw(root);
  try {
    view.feedback = await view.store.add({ alertId, answer: value, note: note || "", ...base });
  } catch (error) {
    view.alertError = "The answer was not saved. " + (error?.message || "");
  }
  view.saving = false;
  draw(root);
  const status = root.querySelector("[data-alert-status]");
  if (status && !view.alertError) status.textContent = value === "reopened" ? "Alert reopened." : value === "confirmed" ? "Alert confirmed." : "Alert dismissed.";
}

async function loadFeedback(root) {
  try {
    view.feedback = await view.store.load();
  } catch (error) {
    view.feedback = [];
    view.alertError = "Answers did not load. " + (error?.message || "");
  }
  view.feedbackReady = true;
  if (document.body.contains(root.querySelector("[data-alerts]"))) draw(root);
}

function bindAlerts(root) {
  const box = root.querySelector("[data-alerts]");
  if (!box) return;
  box.addEventListener("change", (event) => {
    const job = event.target.closest("[data-job]");
    if (job) {
      view.jobs = setJob(job.dataset.job, job.checked);
      const state = root.querySelector('[data-job-state="' + job.dataset.job + '"]');
      if (state) state.textContent = job.checked ? "On" : "Off";
      if (job.dataset.job === "pull") startPull(root);
      settingsChanged(root, (job.checked ? "Turned on: " : "Turned off: ") + job.closest("label").textContent.trim() + ".");
      return;
    }
    const limit = event.target.closest("[data-limit]");
    if (limit) {
      view.rules = setLimit(limit.dataset.limit, limit.value);
      limit.value = String(view.rules[limit.dataset.limit]);
      settingsChanged(root, "Limit saved.");
    }
  });
  box.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-add-alert]");
    if (!form) return;
    event.preventDefault();
    const text = form.querySelector("[data-add-text]");
    const animalId = form.querySelector("[data-add-animal]").value;
    try {
      view.log = view.logStore.add({ type: "alert", animalId, text: text.value });
      text.value = "";
      view.alertError = "";
      const status = root.querySelector("[data-alert-status]");
      if (status) status.textContent = "Alert added.";
    } catch (error) {
      view.alertError = error?.message || "The alert was not added.";
      text.focus();
    }
    draw(root);
  });
  box.addEventListener("click", (event) => {
    const change = event.target.closest("[data-change-limit]");
    if (change) {
      openSettings(root, '[data-limit="' + change.dataset.changeLimit + '"]');
      return;
    }
    const li = event.target.closest("[data-alert]");
    const show = event.target.closest("[data-alert-animal]");
    if (show) {
      select(root, show.dataset.alertAnimal);
      root.querySelector("#paddock, [data-rancher-map]")?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    if (!li || view.saving) return;
    const btn = event.target.closest("[data-answer]");
    if (btn) return answer(root, li.dataset.alert, btn.dataset.answer, li.querySelector("[data-alert-note]")?.value);
    if (event.target.closest("[data-reopen]")) return answer(root, li.dataset.alert, "reopened", "");
  });
  box.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("[data-alert-note]")) return;
    event.preventDefault();
    const li = event.target.closest("[data-alert]");
    answer(root, li.dataset.alert, "confirmed", event.target.value);
  });
  loadFeedback(root);
}

function openSettings(root, focus) {
  const box = root.querySelector("[data-settings]");
  if (!box) return;
  box.open = true;
  box.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  (focus ? box.querySelector(focus) : box.querySelector("[data-job]"))?.focus();
}

function settingsChanged(root, message) {
  const line = root.querySelector("[data-jobs-line]");
  if (line) line.textContent = jobsLine(view.jobs, view.rules);
  paintAlertsOffNotice(root.querySelector("[data-alerts-off]"), view.jobs);
  const pull = root.querySelector("[data-pull-line]");
  if (pull) pull.firstChild.textContent = view.jobs.pull ? "Checks for a new file every " + PULL_SECONDS / 60 + " minutes. " : "Automatic check is off. ";
  const status = root.querySelector("[data-alert-status]");
  if (status) status.textContent = message;
  draw(root);
}

// The pull loop, browser side: look for a newer live file and redraw with it.
async function checkLive(root, { force = false } = {}) {
  try {
    const res = await fetch("/api/live", { cache: "no-store" });
    const body = await res.json();
    const pulledAt = body?.live?.pulledAt || body?.live?.generatedAt;
    const typing = document.activeElement?.matches?.("input[type=text], select");
    if (pulledAt && pulledAt !== view.data.pulledAt && (!typing || force)) {
      keepSelected = view.selected;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    const line = root.querySelector("[data-pulled]");
    if (force && line) line.textContent = "No newer file. Checked " + timeOf(new Date().toISOString());
  } catch {
    const line = root.querySelector("[data-pulled]");
    if (force && line) line.textContent = "The check did not reach the server.";
  }
}

function startPull(root) {
  if (view.pullTimer) clearInterval(view.pullTimer);
  view.pullTimer = null;
  if (view.data.mode !== "live" || !view.jobs.pull) return;
  view.pullTimer = setInterval(() => {
    if (!document.body.contains(root.querySelector("[data-pull-now]"))) return clearInterval(view.pullTimer);
    checkLive(root);
  }, PULL_SECONDS * 1000);
}

function draw(root) {
  const state = currentState();
  const alerts = alertsFor(state);
  renderPins(root, state, alerts);
  renderStats(root, state, alerts);
  renderGrid(root, state, alerts);
  renderDetail(root, state, alerts);
  renderFeed(root, state);
  renderAlerts(root, alerts);
  rancherMap?.setAlerts?.(alerts.open.map((a) => a.animalId).filter(Boolean));
  const scrub = root.querySelector("[data-scrub]");
  if (scrub) scrub.value = String(view.step);
}

function select(root, id, { open = true } = {}) {
  view.selected = id;
  keepSelected = id;
  if (open) setSheet(root, true);
  draw(root);
  rancherMap?.select(id);
}

function setSheet(root, open) {
  const aside = root.querySelector("[data-detail]");
  const handle = root.querySelector("[data-sheet]");
  if (!aside || !handle) return;
  aside.classList.toggle("is-open", open);
  handle.setAttribute("aria-expanded", String(open));
  syncSheetInert(root);
}

// On phones the detail is a bottom sheet. While it is closed, its links and
// buttons sit off screen, so keep them out of the tab order.
const SHEET_QUERY = "(max-width: 860px)";
let sheetWatch = null;

function syncSheetInert(root) {
  const aside = root?.querySelector("[data-detail]");
  const body = aside?.querySelector("[data-detail-body]");
  if (!body) return;
  body.inert = !aside.classList.contains("is-open") && window.matchMedia(SHEET_QUERY).matches;
}

function watchSheet() {
  if (sheetWatch || !window.matchMedia) return;
  sheetWatch = window.matchMedia(SHEET_QUERY);
  sheetWatch.addEventListener?.("change", () => syncSheetInert(document.getElementById("app")));
}

/**
 * Set the herd view from outside, for the guided tour: jump to a moment
 * ("smoke", "predator", or "end"), pick an animal, open the bottom sheet.
 */
export function setHerdView({ moment, select: id, openSheet = false } = {}) {
  const root = document.getElementById("app");
  if (!view || !root?.querySelector("[data-scrub]")) return false;
  stop(root);
  if (moment === "end") view.step = view.events.length;
  else if (moment) {
    const m = keyMoments(view.events).find((x) => x.id === moment);
    if (m) view.step = m.step;
  }
  if (id && view.data.animals.some((a) => a.id === id)) view.selected = id;
  setSheet(root, openSheet);
  draw(root);
  return true;
}

// Load Leaflet only for a signed-in rancher with details showing. If it
// cannot load, fall back to the small local map with no tiles.
async function mountMap(root) {
  const el = root.querySelector("[data-rancher-map]");
  if (!el) return;
  try {
    const { mountRancherMap } = await import("./rancher-map.js");
    if (!document.body.contains(el)) return;
    rancherMap = mountRancherMap(el, {
      animals: view.data.animals,
      apiKey: view.data.arcgisApiKey,
      now: view.data.now,
      onSelect: (id) => select(root, id),
    });
    rancherMap.select(view.selected);
  } catch {
    el.innerHTML = '<p class="muted map-loading">The map did not load. Showing positions as coordinates in the tracker details.</p>';
  }
}

function stop(root) {
  if (view.timer) clearInterval(view.timer);
  view.timer = null;
  const btn = root.querySelector("[data-play]");
  if (btn) btn.innerHTML = PLAY;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function bindMap(root) {
  if (!view) return;
  root.querySelectorAll("[data-source]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPreferSample(btn.dataset.source === "sample");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  });
  root.querySelector("[data-hide]")?.addEventListener("change", (event) => {
    setHideTrackers(event.target.checked);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  root.querySelector("[data-pull-now]")?.addEventListener("click", () => checkLive(root, { force: true }));
  startPull(root);
  root.querySelector("[data-open-settings]")?.addEventListener("click", () => openSettings(root));
  if (!view.data.animals.length) return;
  bindAlerts(root);
  draw(root);
  // Spread the pins again when the paddock changes size (rotation, resize).
  const paddock = root.querySelector("#paddock");
  if (paddock && "ResizeObserver" in window) {
    resizeObserver?.disconnect();
    let last = paddock.clientWidth;
    resizeObserver = new ResizeObserver(() => {
      if (!paddock.isConnected) return resizeObserver.disconnect();
      if (Math.abs(paddock.clientWidth - last) < 2) return;
      last = paddock.clientWidth;
      const state = currentState();
      renderPins(root, state, alertsFor(state));
    });
    resizeObserver.observe(paddock);
  }
  root.querySelector("[data-detail]")?.addEventListener("submit", (event) => {
    if (!event.target.closest("[data-note-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector("[data-note-text]");
    const name = view.data.animals.find((a) => a.id === view.selected)?.name || "";
    if (addLog(root, { type: "note", animalId: view.selected, text: input.value }, "Note saved on " + name + ".")) {
      const fresh = root.querySelector("[data-note-text]");
      if (fresh) {
        fresh.value = "";
        fresh.focus();
      }
    } else root.querySelector("[data-note-text]")?.focus();
  });
  root.querySelector("[data-detail]")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-mark-checked]")) {
      const input = root.querySelector("[data-note-text]");
      const name = view.data.animals.find((a) => a.id === view.selected)?.name || "";
      // A typed note goes with the check.
      if (addLog(root, { type: "checked", animalId: view.selected, text: input?.value || "" }, name + " marked checked.")) {
        const fresh = root.querySelector("[data-note-text]");
        if (fresh) fresh.value = "";
        root.querySelector("[data-mark-checked]")?.focus();
      }
      return;
    }
    if (!event.target.closest("[data-jump-alerts]")) return;
    event.preventDefault();
    setSheet(root, false);
    root.querySelector("#alerts-title")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  });
  watchSheet();
  syncSheetInert(root);
  root.querySelector("[data-sheet]")?.addEventListener("click", () => {
    setSheet(root, !root.querySelector("[data-detail]").classList.contains("is-open"));
    draw(root);
  });
  // Arrow keys move between pins, toward the nearest one in that direction.
  root.querySelector("[data-pins]")?.addEventListener("keydown", (event) => {
    const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const dir = dirs[event.key];
    const from = event.target.closest(".goat");
    if (!dir || !from) return;
    event.preventDefault();
    const pos = (el) => [parseFloat(el.style.left), parseFloat(el.style.top)];
    const [fx, fy] = pos(from);
    let best = null;
    let bestScore = Infinity;
    for (const pin of root.querySelectorAll("[data-pins] .goat")) {
      if (pin === from) continue;
      const [x, y] = pos(pin);
      const along = (x - fx) * dir[0] + (y - fy) * dir[1];
      if (along <= 0) continue;
      const across = Math.abs((x - fx) * dir[1]) + Math.abs((y - fy) * dir[0]);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = pin;
      }
    }
    if (best) {
      from.tabIndex = -1;
      best.tabIndex = 0;
      best.focus();
    }
  });
  if (view.data.rancherMap) mountMap(root);
  const scrub = root.querySelector("[data-scrub]");
  scrub?.addEventListener("input", () => {
    stop(root);
    view.step = Number(scrub.value);
    draw(root);
  });
  const play = root.querySelector("[data-play]");
  play?.addEventListener("click", () => {
    if (view.timer) {
      stop(root);
      return;
    }
    if (view.step >= view.events.length) view.step = 0;
    play.innerHTML = PAUSE;
    draw(root);
    view.timer = setInterval(
      () => {
        if (!document.body.contains(root.querySelector("[data-scrub]"))) {
          stop(root);
          return;
        }
        view.step += 1;
        draw(root);
        if (view.step >= view.events.length) stop(root);
      },
      reducedMotion() ? 1200 : 700
    );
  });
}

/** Stop playback when leaving the page. */
export function leaveMap() {
  if (view?.timer) clearInterval(view.timer);
  if (view?.pullTimer) clearInterval(view.pullTimer);
  if (view) view.timer = view.pullTimer = null;
  rancherMap?.destroy();
  rancherMap = null;
}
