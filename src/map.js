import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { cellLabels, cellOf } from "./grid.js";
import { sortEvents, stateAt } from "./herd-state.js";
import { loadHerd, setHideTrackers, setPreferSample } from "./data.js";
import { lotsForAnimal } from "./records-data.js";

const LOW_BATTERY = 25;
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

let view = null;

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
  };
  const animals = data.animals;
  view.selected = (animals.find((a) => a.id === "bramble") || animals[0] || {}).id || null;
  const live = data.mode === "live";

  const sourceBadge = live
    ? '<div class="source-line"><span class="badge badge-live">Live from your ChirpStack</span>' +
      '<label class="toggle"><input type="checkbox" data-hide' + (data.hide ? " checked" : "") + " /> Hide tracker details</label></div>" +
      (data.privateView ? '<span class="badge badge-private">Private: only on your own hardware</span>' : "") +
      (!data.hide && data.exportHidden
        ? '<p class="fine-print source-note">This file was written with tracker details hidden, so there is nothing more to show. Run the pull with FIBERSHARE_HIDE_TRACKERS=0 on your own hardware to see real values.</p>'
        : "") +
      '<div class="source-line"><span class="muted source-time">Pulled at ' + esc(timeOf(data.generatedAt)) + (data.sources?.includes("mqtt") ? " · REST and MQTT" : " · REST") + "</span>" +
      '<button type="button" class="btn btn-ghost btn-small" data-source="sample">Show sample data</button></div>'
    : '<span class="badge">Sample data</span>' +
      (data.liveAvailable
        ? '<button type="button" class="btn btn-ghost btn-small" data-source="live">Show live data</button>'
        : "");

  const lede = live
    ? data.privateView
      ? "Your own trackers with their real names, device IDs, tags, and positions, read from your ChirpStack server. This page runs on your own hardware and sends none of it anywhere."
      : "Your own trackers, read from your ChirpStack server. Names, device IDs, tags, and positions are hidden. Each tracker sits on a grid cell picked by a hash, not by where it is."
    : data.loadFailed
      ? "The herd list did not load. Check public/data/herd.json, then reload this page."
      : "Sample goats on a virtual paddock grid. The grid is a drawing, not a map, and this is not a real ranch herd.";

  const cells = cellLabels()
    .map((label) => '<div class="cell" data-cell="' + label + '"><span>' + label + "</span></div>")
    .join("");

  const body = animals.length
    ? '<div class="stat-row" data-stats></div>' +
      '<div class="herd-layout">' +
      '<div class="herd-main">' +
      '<div class="paddock-banner" data-banner hidden></div>' +
      (data.mapSpan
        ? '<div class="paddock paddock-map" id="paddock" role="group" aria-label="Local map of tracker positions">'
        : '<div class="paddock" id="paddock" role="group" aria-label="Virtual paddock grid, 6 by 4 cells">' +
          '<div class="paddock-cells" aria-hidden="true">' +
          cells +
          "</div>") +
      '<div class="paddock-haze" data-haze hidden></div>' +
      '<div data-pins></div>' +
      '<div class="pasture-legend">' +
      (data.mapSpan
        ? "Local map from tracker positions · about " + data.mapSpan + " m across · north is up" +
          (animals.some((a) => !a.onMap) ? " · " + animals.filter((a) => !a.onMap).length + " without a position yet" : "")
        : live
          ? data.privateView
            ? "No tracker has sent a position yet · grid cells from a hash"
            : "Grid cells come from a hash · not GPS"
          : "Virtual grid · not GPS · sample herd") +
      "</div></div>" +
      (events.length
        ? '<div class="playback">' +
          '<button type="button" class="btn btn-primary btn-small" data-play>Play the day</button>' +
          '<label class="visually-hidden" for="scrub">Step through the event feed</label>' +
          '<input id="scrub" type="range" min="0" max="' + events.length + '" value="' + events.length + '" data-scrub />' +
          '<output class="clock" for="scrub" data-clock></output>' +
          "</div>"
        : "") +
      "</div>" +
      '<aside class="detail" data-detail aria-live="polite"></aside>' +
      "</div>" +
      '<div class="herd-lower">' +
      '<section class="section" aria-labelledby="herd-list-title"><h2 class="section-rule" id="herd-list-title">' +
      (live ? "Trackers" : "Herd") +
      '</h2><ol class="goat-list" data-list></ol></section>' +
      '<section class="section feed-section" aria-labelledby="feed-title">' +
      '<div class="feed-head"><h2 class="section-rule" id="feed-title">Event feed</h2>' +
      (live ? '<span class="badge badge-live">Live</span>' : '<span class="badge badge-sim">Simulated</span>') +
      "</div>" +
      (live
        ? '<p class="muted feed-note">Check-ins, battery readings, and SOS from your ChirpStack server. Predator and smoke alerts are not part of the live pull.</p>'
        : '<p class="muted feed-note">One made-up day for the sample herd. None of these events happened.</p>') +
      '<div class="chips" role="group" aria-label="Filter the event feed">' +
      FILTERS.map(
        ([key, label]) =>
          '<button type="button" class="chip" data-filter="' + key + '" aria-pressed="' + (key === "all") + '">' + label + "</button>"
      ).join("") +
      "</div>" +
      '<ol class="feed" data-feed></ol></section>' +
      "</div>"
    : '<div class="empty">No goats are listed yet. Add them in public/data/herd.json and reload.</div>';

  return (
    nav("/map") +
    '<main class="wrap wrap-wide" id="main">' +
    '<section class="page-head head-row"><div>' +
    "<h1>" +
    esc(data.ranch) +
    '</h1><p class="lede">' +
    lede +
    '</p></div><div class="source-box">' +
    sourceBadge +
    "</div></section>" +
    body +
    "</main>" +
    footer()
  );
}

function currentState() {
  return stateAt(view.data.animals, view.events, view.step);
}

function clockIso() {
  if (view.step >= view.events.length) return view.data.now;
  const event = view.events[Math.max(0, view.step - 1)];
  return event ? event.time : view.data.now;
}

function renderPins(root, state) {
  const holder = root.querySelector("[data-pins]");
  if (!holder) return;
  const existing = new Map([...holder.querySelectorAll(".goat")].map((el) => [el.dataset.id, el]));
  for (const animal of state.animals) {
    if (view.data.mapSpan && !animal.onMap) continue;
    let pin = existing.get(animal.id);
    if (!pin) {
      pin = document.createElement("button");
      pin.type = "button";
      pin.className = "goat";
      pin.dataset.id = animal.id;
      pin.innerHTML = '<span aria-hidden="true">' + esc(initials(animal.alias || animal.name)) + "</span>";
      pin.addEventListener("click", () => select(root, animal.id));
      holder.appendChild(pin);
    }
    pin.style.left = animal.x + "%";
    pin.style.top = animal.y + "%";
    const on = animal.id === view.selected;
    pin.classList.toggle("is-active", on);
    pin.classList.toggle("is-low", Number.isFinite(animal.battery) && animal.battery < LOW_BATTERY);
    pin.classList.toggle("is-silent", animal.silent);
    pin.classList.toggle("is-sos", Boolean(animal.sos || animal.sensors?.sos));
    pin.setAttribute("aria-pressed", String(on));
    pin.setAttribute("aria-label", animal.name + (view.data.mapSpan ? "" : ", cell " + cellOf(animal.x, animal.y)));
  }
}

function renderStats(root, state) {
  const holder = root.querySelector("[data-stats]");
  if (!holder) return;
  const now = new Date(clockIso()).getTime();
  const recent = state.animals.filter((a) => a.lastSeen && now - new Date(a.lastSeen).getTime() <= 3600000).length;
  const low = state.animals.filter((a) => Number.isFinite(a.battery) && a.battery < LOW_BATTERY).length;
  const alerts = state.alertCells.length + (state.smoke ? 1 : 0) + state.animals.filter((a) => a.silent || a.sos).length;
  const stats = [
    [state.animals.length, view.data.mode === "live" ? "trackers" : "animals"],
    [recent, "checked in, last hour"],
    [low, "low battery"],
    [alerts, "open alerts"],
  ];
  holder.innerHTML = stats
    .map(([n, label], i) => '<div class="stat' + (i === 3 && n > 0 ? " stat-warn" : "") + '"><strong>' + n + "</strong><span>" + label + "</span></div>")
    .join("");
}

function renderGrid(root, state) {
  root.querySelectorAll(".cell").forEach((cell) => {
    cell.classList.toggle("is-alert", state.alertCells.includes(cell.dataset.cell));
  });
  const haze = root.querySelector("[data-haze]");
  if (haze) haze.hidden = !state.smoke;
  const banner = root.querySelector("[data-banner]");
  if (banner) {
    const lines = [];
    for (const cell of state.alertCells) lines.push("Predator alert at " + cell);
    if (state.smoke) lines.push("Smoke haze rising upwind");
    banner.hidden = lines.length === 0;
    banner.innerHTML = lines.map((line) => "<span>" + esc(line) + "</span>").join("") + (lines.length ? '<span class="badge badge-sim">Simulated</span>' : "");
  }
  const clock = root.querySelector("[data-clock]");
  if (clock) clock.textContent = timeOf(clockIso()) + " · " + view.step + " of " + view.events.length + " events";
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
  const span = view.data.mode === "live" ? "the last " + hours + " hours" : "the sample day, one bar per hour";
  return (
    '<div class="uplinks"><p class="row-meta">Check-ins across ' + esc(span) + "</p>" +
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
  if (s.sos || animal.sos) rows.push(["SOS", '<span class="badge badge-warn">SOS sent</span>']);
  return rows;
}

function renderDetail(root, state) {
  const holder = root.querySelector("[data-detail]");
  if (!holder) return;
  const animal = state.animals.find((a) => a.id === view.selected);
  if (!animal) {
    holder.innerHTML = '<p class="muted">Pick an animal on the grid or in the list.</p>';
    return;
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
  ];
  if (!live) {
    rows.splice(0, 0, ["Breed", esc(animal.breed)], ["Color", esc(animal.color)], ["Fiber", esc(animal.fiber)]);
    rows.push(["Status", esc(animal.silent ? "tracker quiet" : animal.status)]);
  }
  holder.innerHTML =
    '<p class="detail-kicker">' + (live ? (full ? "Tracker · private" : "Tracker") : "Animal") + "</p>" +
    "<h2>" + esc(animal.name) + "</h2>" +
    '<dl class="facts">' + rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") + "</dl>" +
    uplinkChart(animal.uplinks, view.data.windowHours) +
    (lots.length
      ? '<p class="detail-link"><a class="btn btn-ghost btn-small" href="#/trace">Follow ' + esc(animal.name) + "'s fleece to the " + esc(lots[0]) + " lot</a></p>"
      : "") +
    (live && !full ? '<p class="fine-print">Tracker details are hidden. Turn off Hide tracker details to see the real name, ID, and position on your own hardware.</p>' : "") +
    (full ? '<p class="fine-print">Private: only on your own hardware. Do not share a screenshot of this view.</p>' : "");
}

function renderList(root, state) {
  const holder = root.querySelector("[data-list]");
  if (!holder) return;
  const live = view.data.mode === "live";
  holder.innerHTML = state.animals
    .map((animal, i) => {
      const on = animal.id === view.selected;
      const meta = live
        ? [view.data.privateView ? animal.alias : view.data.mapSpan ? "" : cellOf(animal.x, animal.y), animal.signal ? "signal " + animal.signal : "", Number.isFinite(animal.battery) ? "battery " + Math.round(animal.battery) + "%" : "battery not reported", "seen " + ago(animal.lastSeen, clockIso())]
        : [animal.status, animal.breed, animal.tracker, Number.isFinite(animal.battery) ? "battery " + animal.battery + "%" : ""];
      return (
        '<li><button type="button" class="goat-row' + (on ? " selected" : "") + '" data-goat-card="' + esc(animal.id) + '" aria-pressed="' + on + '">' +
        '<span class="feature-num" aria-hidden="true">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<div><h3>" + esc(animal.name) +
        (Number.isFinite(animal.battery) && animal.battery < LOW_BATTERY ? ' <span class="badge badge-warn">low battery</span>' : "") +
        (animal.silent ? ' <span class="badge badge-warn">quiet</span>' : "") +
        (animal.sos || animal.sensors?.sos ? ' <span class="badge badge-warn">SOS</span>' : "") +
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
    holder.innerHTML = '<li class="feed-empty muted">' + (state.shown.length ? "No events match this filter yet." : "Press Play the day to start.") + "</li>";
    return;
  }
  holder.innerHTML = items
    .slice(0, 60)
    .map((event) => {
      const kind = event.type === "predator" || event.type === "smoke" || event.type === "sos" || event.severity === "alert" ? "is-alert" : isAlert(event) ? "is-watch" : "";
      const who = names.get(event.animalId);
      return (
        '<li class="feed-item ' + kind + '"' + (event.animalId ? ' data-event-animal="' + esc(event.animalId) + '"' : "") + ">" +
        '<time datetime="' + esc(event.time) + '">' + esc(timeOf(event.time)) + "</time>" +
        '<div><span class="feed-type">' + esc(EVENT_LABELS[event.type] || event.type) + (who && view.data.mode !== "live" ? " · " + esc(who) : "") + "</span>" +
        "<p>" + esc(event.text) + "</p></div></li>"
      );
    })
    .join("");
  holder.querySelectorAll("[data-event-animal]").forEach((item) => {
    item.addEventListener("click", () => select(root, item.dataset.eventAnimal));
  });
}

function draw(root) {
  const state = currentState();
  renderPins(root, state);
  renderStats(root, state);
  renderGrid(root, state);
  renderDetail(root, state);
  renderList(root, state);
  renderFeed(root, state);
  const scrub = root.querySelector("[data-scrub]");
  if (scrub) scrub.value = String(view.step);
}

function select(root, id) {
  view.selected = id;
  draw(root);
}

function stop(root) {
  if (view.timer) clearInterval(view.timer);
  view.timer = null;
  const btn = root.querySelector("[data-play]");
  if (btn) btn.textContent = "Play the day";
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
  draw(root);
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
    play.textContent = "Pause";
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
}
