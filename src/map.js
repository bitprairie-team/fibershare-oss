import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { cellLabels, cellOf } from "./grid.js";
import { keyMoments, sortEvents, stateAt } from "./herd-state.js";
import { icon } from "./icons.js";
import { spreadPins } from "./pin-spread.js";
import { loadHerd, setHideTrackers, setPreferSample } from "./data.js";
import { lotsForAnimal } from "./records-data.js";
import { ALERT_RULES } from "./alert-config.js";
import { computeAlerts, latestAnswers, splitAlerts } from "./alerts.js";
import { alertScope, createAlertStore } from "./alert-store.js";

const LOW_BATTERY = ALERT_RULES.lowBatteryPercent;
const ALERT_KIND = {
  battery: ["battery", "Low battery"],
  quiet: ["wifiOff", "Quiet tracker"],
  sos: ["alert", "SOS"],
  predator: ["paw", "Predator report"],
  smoke: ["smoke", "Smoke report"],
};
const EVENT_LABELS = {
  checkin: "Check-in",
  battery: "Battery",
  silent: "Missed check-in",
  smoke: "Smoke",
  "smoke-clear": "Smoke cleared",
  predator: "Predator",
  "predator-clear": "Predator cleared",
  sos: "SOS",
};
const FILTERS = [
  ["all", "All"],
  ["alerts", "Alerts"],
  ["battery", "Battery"],
  ["checkin", "Check-ins"],
];

const EVENT_ICONS = {
  checkin: "signal",
  battery: "battery",
  silent: "wifiOff",
  smoke: "smoke",
  "smoke-clear": "check",
  predator: "paw",
  "predator-clear": "check",
  sos: "alert",
};

const STALE_MINUTES = 15;
let view = null;
let rancherMap = null;

function timeOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function ago(iso, nowIso) {
  if (!iso) return "not yet today";
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + (hours === 1 ? " hour ago" : " hours ago");
  return Math.round(hours / 24) + " days ago";
}

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

function matchesFilter(event, filter) {
  if (filter === "alerts") return isAlert(event);
  if (filter === "battery") return event.type === "battery";
  if (filter === "checkin") return event.type === "checkin" || event.type === "silent";
  return true;
}

function stage(data, animals, live, cells) {
  if (data.rancherMap) {
    const placed = animals.filter((a) => Number.isFinite(a.details?.position?.latitude)).length;
    return (
      '<div class="rancher-map" data-rancher-map role="region" aria-label="Map of tracker positions"><p class="muted map-loading">Loading the map…</p></div>' +
      '<p class="pasture-legend map-legend">Real positions · ' + placed + " of " + animals.length + " trackers have one · layers from public agency services</p>"
    );
  }
  const legend = data.mapSpan
    ? "Local map from tracker positions · about " + data.mapSpan + " m across · north is up" +
      (animals.some((a) => !a.onMap) ? " · " + animals.filter((a) => !a.onMap).length + " without a position yet" : "")
    : live
      ? data.privateView
        ? "No positions yet · grid cells from a hash"
        : "Grid cells come from a hash · not GPS"
      : "Virtual grid, not a map";
  return (
    (data.mapSpan
      ? '<div class="paddock paddock-map" id="paddock" role="group" aria-label="Local map of tracker positions">'
      : '<div class="paddock" id="paddock" role="group" aria-label="Paddock grid, 6 by 4 cells. Arrow keys move between animals.">' +
        '<div class="paddock-cells" aria-hidden="true">' + cells + "</div>") +
    '<div class="paddock-haze" data-haze hidden></div>' +
    "<div data-pins></div>" +
    '<div class="pasture-legend">' + legend + "</div></div>"
  );
}

function hours(minutes) {
  return minutes % 60 ? minutes + " minutes" : minutes / 60 + " hours";
}

function alertsSection(data, live) {
  return (
    '<section class="section alerts-section" data-tour="alerts" aria-labelledby="alerts-title">' +
    '<div class="feed-head"><h2 class="section-rule" id="alerts-title">Alerts</h2></div>' +
    '<p class="muted feed-note">A battery alert means below ' + ALERT_RULES.lowBatteryPercent + "% with no outside power. A quiet alert means no check-in for over " + hours(ALERT_RULES.quietMinutes) + "." +
    (live ? "" : " The predator and smoke reports on the sample day are simulated.") +
    " Confirm each alert or dismiss it.</p>" +
    '<p class="notice notice-warn alert-error" data-alert-error role="alert" hidden></p>' +
    '<p class="visually-hidden" data-alert-status role="status"></p>' +
    '<div class="alerts-cols" data-alerts>' +
    '<div><h3 class="alerts-sub">Open <span class="count" data-open-count></span></h3><ol class="alert-list" data-alert-open></ol></div>' +
    '<div><h3 class="alerts-sub">History</h3><ol class="alert-list alert-history" data-alert-history></ol></div>' +
    "</div>" +
    '<p class="fine-print alerts-foot"><span data-alert-where></span> Each answer is stored with the rule that raised the alert.</p>' +
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
  if (data.mode === "sample" && data.liveStatus === "missing" && data.rancherSignedIn) {
    return (
      '<p class="notice notice-warn">' + icon("info", { size: 18 }) +
      "<span>You are signed in, but this server has no live file yet. Run <code>npm run chirpstack:pull</code> on your own hardware, then reload. Until then you see the sample herd.</span></p>"
    );
  }
  return "";
}

function moments(events) {
  const list = keyMoments(events);
  if (!list.length) return "";
  return (
    '<div class="moments" role="group" aria-label="Jump to a moment in the day"><span class="label">Jump to</span>' +
    list
      .map((m) => '<button type="button" class="chip" data-moment="' + m.id + '">' + esc(m.label) + " " + esc(timeOf(m.time)) + "</button>")
      .join("") +
    '<button type="button" class="chip" data-moment="end">End of day</button>' +
    '<button type="button" class="btn btn-text btn-small" data-herd-reset>Reset</button></div>'
  );
}

export async function renderMap() {
  const data = await loadHerd();
  const events = sortEvents(data.events);
  view = {
    data,
    events,
    step: events.length,
    selected: null,
    filter: "all",
    timer: null,
    store: createAlertStore(alertScope(data)),
    feedback: [],
    feedbackReady: false,
    alertError: "",
    saving: false,
  };
  const animals = data.animals;
  view.selected = (animals.find((a) => a.id === "bramble") || animals[0] || {}).id || null;
  const live = data.mode === "live";

  const pulledMinutes = live ? Math.max(0, Math.round((Date.now() - new Date(data.pulledAt).getTime()) / 60000)) : 0;
  const stale = live && pulledMinutes > STALE_MINUTES;
  const sourceBadge = live
    ? '<div class="source-line"><span class="source-label">Live from your ChirpStack server</span>' +
      '<label class="toggle"><input type="checkbox" data-hide' + (data.hide ? " checked" : "") + (data.rancher ? "" : " disabled") + " /> Hide tracker details</label></div>" +
      (data.rancher
        ? '<p class="fine-print source-note">Signed in as the rancher.</p>'
        : '<p class="fine-print source-note">Public view, with tracker details hidden. <a href="#/rancher">Rancher sign-in</a></p>') +
      (data.rancher && !data.hide && data.exportHidden
        ? '<p class="fine-print source-note">This file was written with tracker details hidden. Run the pull with FIBERSHARE_HIDE_TRACKERS=0 to see real values.</p>'
        : "") +
      '<div class="source-line"><span class="muted source-time" data-pulled>Pulled ' + esc(pulledMinutes < 1 ? "just now" : pulledMinutes + " min ago") + " (" + esc(timeOf(data.pulledAt)) + ")" + (data.sources?.includes("mqtt") ? " · REST and MQTT" : " · REST") + "</span>" +
      '<button type="button" class="btn btn-ghost btn-small" data-source="sample">Show sample data</button></div>' +
      (stale ? '<p class="fine-print source-note stale-note">This file is more than ' + STALE_MINUTES + " minutes old. Keep it fresh with <code>npm run chirpstack:pull -- --watch=120</code>.</p>" : "")
    : (data.liveAvailable
        ? '<button type="button" class="btn btn-ghost btn-small" data-source="live">Show live data</button>'
        : "");

  const lede = live
    ? data.privateView
      ? "Your trackers with real names, device IDs, tags and positions. Only a signed-in rancher gets this view."
      : "Trackers from a ChirpStack server, with names, device IDs, tags and positions hidden. Each grid cell comes from a hash, not a position."
    : "8 sample goats on a 6 by 4 paddock grid. The grid is a drawing, not a map. Press Play to step through the sample day.";

  const cells = cellLabels()
    .map((label) => '<div class="cell" data-cell="' + label + '"><span>' + label + "</span></div>")
    .join("");

  const body = animals.length
    ? notices(data) +
      '<div class="stat-row" data-stats></div>' +
      '<div class="herd-layout">' +
      '<div class="herd-main" data-tour="grid">' +
      '<div class="paddock-wrap"><div class="paddock-banner" data-banner hidden></div>' + stage(data, animals, live, cells) + "</div>" +
      (events.length
        ? '<div class="playback">' +
          '<button type="button" class="btn btn-primary btn-small" data-play>' + PLAY + "</button>" +
          '<label class="visually-hidden" for="scrub">Step through the event feed</label>' +
          '<input id="scrub" type="range" min="0" max="' + events.length + '" value="' + events.length + '" data-scrub />' +
          '<output class="clock" for="scrub" data-clock></output>' +
          (live ? "" : moments(events)) +
          "</div>"
        : "") +
      "</div>" +
      '<aside class="detail" data-detail data-tour="detail" aria-label="Animal details">' +
      '<button type="button" class="sheet-handle" data-sheet aria-expanded="false"><span class="avatar" data-sheet-avatar></span><span class="sheet-title"><strong data-sheet-name></strong><small data-sheet-meta></small></span>' +
      icon("chevronUp", { cls: "i-up" }) + icon("chevronDown", { cls: "i-down" }) + "</button>" +
      '<div class="detail-body" data-detail-body aria-live="polite"></div></aside>' +
      "</div>" +
      alertsSection(data, live) +
      '<div class="herd-lower">' +
      '<section class="section" aria-labelledby="herd-list-title"><h2 class="section-rule" id="herd-list-title">' +
      (live ? "Trackers" : "Herd") +
      '</h2><ol class="goat-list" data-list></ol></section>' +
      '<section class="section feed-section" aria-labelledby="feed-title">' +
      '<div class="feed-head" data-tour="feed"><h2 class="section-rule" id="feed-title">Event log</h2></div>' +
      (live
        ? '<p class="muted feed-note">Check-ins, battery readings and SOS from your ChirpStack server. The live pull has no predator or smoke reports.</p>'
        : '<p class="muted feed-note">One made-up day for the sample herd.</p>') +
      '<div class="chips" role="group" aria-label="Filter the event feed">' +
      FILTERS.map(
        ([key, label]) =>
          '<button type="button" class="chip" data-filter="' + key + '" aria-pressed="' + (key === "all") + '">' + label + "</button>"
      ).join("") +
      "</div>" +
      '<ol class="feed" data-feed></ol></section>' +
      "</div>"
    : data.loadFailed
      ? stateBox("error", "alert", "The herd did not load", "The page could not read public/data/herd.json. Check that it is valid JSON, then try again.", '<button type="button" class="btn btn-primary" data-retry>' + icon("reset", { size: 18 }) + "Try again</button>")
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
  const all = computeAlerts({ animals: state.animals, events: state.shown, now: alertNow() });
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
}

function renderStats(root, state, alerts) {
  const holder = root.querySelector("[data-stats]");
  if (!holder) return;
  // Live data counts from the real clock; the sample day from its own clock.
  const now = view.data.mode === "live" ? Date.now() : new Date(clockIso()).getTime();
  const recent = state.animals.filter((a) => a.lastSeen && now - new Date(a.lastSeen).getTime() <= 3600000).length;
  const low = alerts.all.filter((a) => a.kind === "battery").length;
  const open = alerts.open.length;
  const stats = [
    [state.animals.length, view.data.mode === "live" ? "trackers" : "animals", "herd", ""],
    [recent, "checked in, last hour", "signal", ""],
    [low, "low battery", "battery", low > 0 ? " stat-low" : ""],
    [open, open === 1 ? "open alert" : "open alerts", "alert", open > 0 ? " stat-warn" : ""],
  ];
  holder.innerHTML = stats
    .map(([n, label, , cls]) => '<div class="stat' + cls + '"><strong>' + n + "</strong><span>" + label + "</span></div>")
    .join("");
}

function renderGrid(root, state, alerts) {
  root.querySelectorAll(".cell").forEach((cell) => {
    cell.classList.toggle("is-alert", state.alertCells.includes(cell.dataset.cell));
  });
  const haze = root.querySelector("[data-haze]");
  if (haze) haze.hidden = !state.smoke;
  const banner = root.querySelector("[data-banner]");
  if (banner) {
    const cards = [];
    const answers = latestAnswers(view.feedback);
    const answerOf = (kind, cell) => {
      const a = alerts.all.find((x) => x.kind === kind && !x.cleared && (kind !== "predator" || x.title.endsWith(cell)));
      const f = a && answers.get(a.id);
      return f && f.answer !== "reopened" ? f.answer : "";
    };
    for (const cell of state.alertCells) cards.push(["paw", "", "Predator report near " + cell, "The herd is moving away", answerOf("predator", cell)]);
    if (state.smoke) cards.push(["smoke", " is-smoke", "Smoke haze upwind", "No fire reported nearby", answerOf("smoke")]);
    const html = cards
      .map(
        ([name, cls, title, sub, answer]) =>
          '<div class="alert-card' + cls + '" role="status"><span class="alert-icon">' + icon(name, { size: 18 }) + "</span><span><strong>" + esc(title) + "</strong><small>" + esc(sub) + "</small></span>" +
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
  if (clock) clock.innerHTML = "<strong>" + esc(timeOf(clockIso())) + "</strong>" + view.step + " of " + view.events.length + " events";
}

function batteryBar(value) {
  if (!Number.isFinite(value)) return '<span class="muted">not reported</span>';
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    '<span class="battery' + (pct < LOW_BATTERY ? " is-low" : "") + '" role="img" aria-label="Battery ' + pct + ' percent">' +
    '<span style="width:' + pct + '%"></span></span> ' + pct + "%"
  );
}

function uplinkChart(values, hours) {
  if (!Array.isArray(values) || !values.length) return "";
  const max = Math.max(1, ...values);
  const bars = values
    .map((v) => '<span style="height:' + Math.round((v / max) * 100) + '%" title="' + v + '"></span>')
    .join("");
  const span = view.data.mode === "live" ? "the last " + hours + " hours" : "the sample day";
  return (
    '<div class="uplinks"><p class="row-meta">Check-ins per hour, ' + esc(span) + "</p>" +
    '<div class="bars" role="img" aria-label="Check-ins per hour: ' + values.join(", ") + '">' + bars + "</div></div>"
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

function renderDetail(root, state, alerts) {
  const holder = root.querySelector("[data-detail-body]");
  if (!holder) return;
  const animal = state.animals.find((a) => a.id === view.selected);
  const sheetName = root.querySelector("[data-sheet-name]");
  if (!animal) {
    holder.innerHTML = '<p class="muted">Pick an animal on the grid or in the list.</p>';
    if (sheetName) sheetName.textContent = "Pick an animal";
    return;
  }
  if (sheetName) {
    sheetName.textContent = animal.name;
    root.querySelector("[data-sheet-avatar]").textContent = initials(animal.alias || animal.name);
    root.querySelector("[data-sheet-meta]").textContent =
      (Number.isFinite(animal.battery) ? "Battery " + Math.round(animal.battery) + "%" : "Battery not reported") + " · " + (animal.lastSeen ? "seen " + ago(animal.lastSeen, clockIso()) : "not seen yet");
  }
  const live = view.data.mode === "live";
  const full = live && view.data.privateView;
  const lots = live ? [] : lotsForAnimal(animal.id);
  const rows = [
    ...(live ? liveRows(animal, full) : []),
    ...(live ? [] : [["Tracker", esc(animal.tracker || "none")]]),
    ["Battery", batteryBar(animal.battery) + (animal.externalPower ? " · on outside power" : "")],
    ["Last check-in", animal.lastSeen ? esc(timeOf(animal.lastSeen)) + ' <span class="muted">(' + esc(ago(animal.lastSeen, clockIso())) + ")</span>" : '<span class="muted">not yet</span>'],
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
  if (!live) {
    rows.splice(0, 0, ["Breed", esc(animal.breed)], ["Color", esc(animal.color)], ["Fiber", esc(animal.fiber)]);
    rows.push(["Status", esc(animal.silent ? "tracker quiet" : animal.status)]);
  }
  holder.innerHTML =
    '<div class="detail-top"><span class="avatar" aria-hidden="true">' + esc(initials(animal.alias || animal.name)) + "</span><div>" +
    "<h2>" + esc(animal.name) + "</h2></div></div>" +
    '<dl class="facts">' + rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") + "</dl>" +
    uplinkChart(animal.uplinks, view.data.windowHours) +
    (lots.length
      ? '<p class="detail-link"><a href="#/trace">Trace ' + esc(animal.name) + "'s fleece to the " + esc(lots[0]) + " lot</a></p>"
      : "") +
    (live && !full
      ? '<p class="fine-print">' + (view.data.rancher ? "Tracker details are hidden. Turn off Hide tracker details to see them." : "Tracker details are hidden. Only a signed-in rancher can see them.") + "</p>"
      : "") +
    (full ? '<p class="fine-print">This view shows private data. Do not share screenshots of it.</p>' : "");
}

function renderList(root, state, alerts) {
  const holder = root.querySelector("[data-list]");
  if (!holder) return;
  const live = view.data.mode === "live";
  holder.innerHTML = state.animals
    .map((animal) => {
      const on = animal.id === view.selected;
      const meta = live
        ? [view.data.privateView ? animal.alias : view.data.mapSpan ? "" : cellOf(animal.x, animal.y), animal.signal ? "signal " + animal.signal : "", Number.isFinite(animal.battery) ? "battery " + Math.round(animal.battery) + "%" : "battery not reported", "seen " + ago(animal.lastSeen, clockIso())]
        : [animal.status, animal.breed, animal.tracker, Number.isFinite(animal.battery) ? "battery " + animal.battery + "%" : ""];
      return (
        '<li><button type="button" class="goat-row' + (on ? " selected" : "") + '" data-goat-card="' + esc(animal.id) + '" aria-pressed="' + on + '">' +
        '<span class="avatar" aria-hidden="true">' + esc(initials(animal.alias || animal.name)) + "</span>" +
        "<div><h3>" + esc(animal.name) +
        (alerts.all.some((a) => a.animalId === animal.id && a.kind === "battery") ? ' <span class="flag flag-warn">Low battery</span>' : "") +
        (animal.silent || alerts.all.some((a) => a.animalId === animal.id && a.kind === "quiet") ? ' <span class="flag">Quiet</span>' : "") +
        (animal.sos || animal.sensors?.sos ? ' <span class="flag flag-alert">SOS</span>' : "") +
        '</h3><p class="row-meta">' + meta.filter(Boolean).map(esc).join(" · ") + "</p></div></button></li>"
      );
    })
    .join("");
  holder.querySelectorAll("[data-goat-card]").forEach((card) => {
    card.addEventListener("click", () => select(root, card.dataset.goatCard));
  });
}

function renderFeed(root, state) {
  const holder = root.querySelector("[data-feed]");
  if (!holder) return;
  const names = new Map(view.data.animals.map((a) => [a.id, a.name]));
  const items = [...state.shown].reverse().filter((event) => matchesFilter(event, view.filter));
  if (!items.length) {
    holder.innerHTML = '<li class="feed-empty">' + (state.shown.length ? "No events match this filter." : "No events yet. Press Play to start.") + "</li>";
    return;
  }
  holder.innerHTML = items
    .slice(0, 60)
    .map((event) => {
      const kind = event.type === "predator" || event.type === "smoke" || event.type === "sos" || event.severity === "alert" ? "is-alert" : isAlert(event) ? "is-watch" : "";
      const who = names.get(event.animalId);
      const label = EVENT_LABELS[event.type] || event.type;
      const inner =
        '<span class="feed-icon" aria-hidden="true">' + icon(EVENT_ICONS[event.type] || "info", { size: 16 }) + "</span>" +
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

function answeredAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isEvent(kind) {
  return kind === "predator" || kind === "smoke";
}

function openItem(alert) {
  const [iconName, label] = ALERT_KIND[alert.kind];
  const noteId = "note-" + alert.id.replace(/[^A-Za-z0-9_-]/g, "-");
  const who = alert.animalId ? view.data.animals.find((a) => a.id === alert.animalId) : null;
  return (
    '<li class="alert-item kind-' + alert.kind + '" data-alert="' + esc(alert.id) + '">' +
    '<span class="alert-icon" aria-hidden="true">' + icon(iconName, { size: 18 }) + "</span>" +
    '<div class="alert-body">' +
    '<p class="alert-title"><strong>' + esc(alert.title) + "</strong>" +
    "</p>" +
    '<p class="alert-detail">' + esc(alert.detail) + "</p>" +
    '<p class="row-meta">' + (isEvent(alert.kind) ? "" : esc(label) + " · ") + '<time datetime="' + esc(alert.time) + '">' + esc(timeOf(alert.time)) + "</time>" +
    (alert.cleared ? " · cleared" : "") +
    (who ? ' · <button type="button" class="btn-link" data-alert-animal="' + esc(who.id) + '">Show ' + esc(who.name) + "</button>" : "") +
    "</p>" +
    '<div class="alert-answer">' +
    '<label class="visually-hidden" for="' + noteId + '">Note for this answer (optional)</label>' +
    '<input id="' + noteId + '" class="alert-note" type="text" maxlength="' + ALERT_RULES.noteMaxLength + '" placeholder="Note (optional)" autocomplete="off" data-alert-note />' +
    '<button type="button" class="btn btn-primary btn-small" data-answer="confirmed">' + icon("check", { size: 14 }) + "Confirm</button>" +
    '<button type="button" class="btn btn-ghost btn-small" data-answer="dismissed">Dismiss</button>' +
    "</div></div></li>"
  );
}

function historyItem(entry) {
  const [iconName, label] = ALERT_KIND[entry.kind] || ["info", "Alert"];
  const confirmed = entry.answer === "confirmed";
  return (
    '<li class="alert-item is-answered kind-' + esc(entry.kind) + '" data-alert="' + esc(entry.alertId) + '">' +
    '<span class="alert-icon" aria-hidden="true">' + icon(iconName, { size: 18 }) + "</span>" +
    '<div class="alert-body">' +
    '<p class="alert-title"><strong>' + esc(entry.title || label) + '</strong> <span class="alert-state">' + (confirmed ? "Confirmed" : "Dismissed") + "</span></p>" +
    (entry.note ? '<p class="alert-detail alert-note-text">“' + esc(entry.note) + "”</p>" : "") +
    '<p class="row-meta">' + [isEvent(entry.kind) ? "" : label, entry.alertTime ? "alert at " + timeOf(entry.alertTime) : "", "answered " + answeredAt(entry.at)].filter(Boolean).map(esc).join(" · ") +
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
  const where = root.querySelector("[data-alert-where]");
  if (where) where.textContent = view.store.where;
  const count = root.querySelector("[data-open-count]");
  if (count) count.textContent = String(alerts.open.length);
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
  historyList.innerHTML = alerts.history.length ? alerts.history.slice(0, 40).map(historyItem).join("") : '<li class="feed-empty">No answered alerts yet.</li>';
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
  box.addEventListener("click", (event) => {
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

function draw(root) {
  const state = currentState();
  const alerts = alertsFor(state);
  renderPins(root, state, alerts);
  renderStats(root, state, alerts);
  renderGrid(root, state, alerts);
  renderDetail(root, state, alerts);
  renderList(root, state, alerts);
  renderFeed(root, state);
  renderAlerts(root, alerts);
  rancherMap?.setAlerts?.(alerts.open.map((a) => a.animalId).filter(Boolean));
  const scrub = root.querySelector("[data-scrub]");
  if (scrub) scrub.value = String(view.step);
}

function select(root, id, { open = true } = {}) {
  view.selected = id;
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

function reset(root) {
  stop(root);
  view.step = view.events.length;
  view.filter = "all";
  root.querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === "all")));
  const first = view.data.animals.find((a) => a.id === "bramble") || view.data.animals[0];
  view.selected = first?.id || null;
  setSheet(root, false);
  draw(root);
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
  root.querySelector("[data-detail]")?.addEventListener("click", (event) => {
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
  root.querySelectorAll("[data-moment]").forEach((chip) => {
    chip.addEventListener("click", () => setHerdView({ moment: chip.dataset.moment }));
  });
  root.querySelector("[data-herd-reset]")?.addEventListener("click", () => reset(root));
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
    best?.focus();
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
  root.querySelectorAll("[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      view.filter = chip.dataset.filter;
      root.querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      draw(root);
    });
  });
}

/** Stop playback when leaving the page. */
export function leaveMap() {
  if (view?.timer) clearInterval(view.timer);
  if (view) view.timer = null;
  rancherMap?.destroy();
  rancherMap = null;
}
