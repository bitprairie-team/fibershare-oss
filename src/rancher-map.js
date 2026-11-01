// The signed-in rancher's map: real tracker positions on a basemap, with
// public fire, weather, smoke, air, and land layers. Loaded only in that view,
// so the public bundle never fetches Leaflet or any map tiles.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dynamicMapLayer, featureLayer } from "esri-leaflet";
import { availableLayers, customLayer, DEFAULT_BASEMAP, KEYED_DEFAULT_BASEMAP, LAYERS, tileUrl } from "./map-layers.js";
import { esc } from "./util.js";
import { ALERT_RULES } from "./alert-config.js";

const STATE_KEY = "fs-rancher-map";
const FALLBACK_BASEMAP = "osm-streets";
const CUSTOM_KEY = "fs-rancher-layers";

function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

function ago(iso, now) {
  if (!iso) return "not yet";
  const minutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  return hours < 48 ? hours + (hours === 1 ? " hour ago" : " hours ago") : Math.round(hours / 24) + " days ago";
}

function trackerPopup(animal, now) {
  const s = animal.sensors || {};
  const rows = [
    ["Tracker", animal.alias],
    ["Battery", Number.isFinite(animal.battery) ? Math.round(animal.battery) + "%" + (animal.externalPower ? ", outside power" : "") : "not reported"],
    ["Last seen", ago(animal.lastSeen, now)],
    ["Position from", ago(animal.details?.position?.at, now)],
  ];
  if (Number.isFinite(s.temperature)) rows.push(["Temperature", s.temperature + " °C"]);
  if (Number.isFinite(s.light)) rows.push(["Light", String(s.light)]);
  if (Number.isFinite(s.motion)) rows.push(["Motion", String(s.motion)]);
  if (s.sos) rows.push(["SOS", "sent"]);
  if (animal.signal) rows.push(["Signal", animal.signal]);
  return (
    '<div class="map-popup"><strong>' + esc(animal.name) + "</strong><dl>" +
    rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") +
    "</dl></div>"
  );
}

function fieldValue(value) {
  if (typeof value === "number" && value > 1e11 && value < 1e14) return new Date(value).toLocaleString();
  return value === null || value === undefined || value === "" ? "not given" : String(value);
}

function featurePopup(layer, feature) {
  const props = feature.properties || {};
  const wrap = document.createElement("div");
  wrap.className = "map-popup";
  const title = document.createElement("strong");
  title.textContent = layer.name + (layer.popup?.title && props[layer.popup.title] ? ": " + props[layer.popup.title] : "");
  wrap.append(title);
  const fields = layer.popup?.fields || Object.keys(props).slice(0, 6).map((k) => [k, k]);
  const dl = document.createElement("dl");
  for (const [field, label] of fields) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    const value = props[field];
    if (typeof value === "string" && /^https:\/\//.test(value)) {
      const a = document.createElement("a");
      a.href = value;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open";
      dd.append(a);
    } else dd.textContent = fieldValue(value);
    dl.append(dt, dd);
  }
  wrap.append(dl);
  const small = document.createElement("p");
  small.className = "map-popup-source";
  small.textContent = layer.attribution.replace(/<[^>]+>/g, "");
  wrap.append(small);
  return wrap;
}

function makeLayer(layer, apiKey) {
  if (layer.type === "tile") {
    const url = tileUrl(layer, apiKey);
    if (!url) return null;
    return L.tileLayer(url, {
      maxNativeZoom: layer.maxNativeZoom || 18,
      maxZoom: 19,
      opacity: layer.opacity ?? 1,
      attribution: layer.attribution,
      crossOrigin: true,
    });
  }
  if (layer.type === "dynamic") {
    return dynamicMapLayer({ url: layer.url, layers: layer.layers, opacity: layer.opacity ?? 0.6, attribution: layer.attribution });
  }
  if (layer.type === "feature") {
    const style = layer.style || {};
    const out = featureLayer({
      url: layer.url,
      attribution: layer.attribution,
      style: () => style,
      pointToLayer: (_geojson, latlng) => L.circleMarker(latlng, { radius: style.radius || 5, ...style }),
    });
    out.bindPopup((item) => featurePopup(layer, item.feature));
    return out;
  }
  if (layer.type === "geojson") {
    const style = layer.style || {};
    const group = L.geoJSON(null, {
      style: () => style,
      pointToLayer: (_geojson, latlng) => L.circleMarker(latlng, { radius: style.radius || 6, ...style }),
      onEachFeature: (feature, item) => item.bindPopup(() => featurePopup(layer, feature)),
      attribution: layer.attribution,
    });
    fetch(layer.url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => group.addData(data))
      .catch(() => group.fire("loaderror"));
    return group;
  }
  return null;
}

function panelHtml(layers, hasKey, state, custom) {
  // Basemaps that need a key are left out until a key is set.
  const basemaps = LAYERS.filter((l) => l.group === "basemap" && (hasKey || !l.needsKey));
  const overlays = layers.filter((l) => l.group === "overlay");
  const radio = (l) => {
    return (
      '<label class="layer-row"><input type="radio" name="basemap" value="' + esc(l.id) + '"' +
      (state.basemap === l.id ? " checked" : "") + " /> " + esc(l.name) + "</label>"
    );
  };
  const box = (l) =>
    '<div class="layer-row"><label><input type="checkbox" value="' + esc(l.id) + '"' + (state.overlays.includes(l.id) ? " checked" : "") + " /> " + esc(l.name) + "</label>" +
    (l.source ? ' <a class="layer-src" href="' + esc(l.source) + '" target="_blank" rel="noopener noreferrer" title="' + esc(l.terms || "") + '">source</a>' : "") +
    (l.custom ? ' <button type="button" class="layer-remove" data-remove="' + esc(l.id) + '" aria-label="Remove ' + esc(l.name) + '">remove</button>' : "") +
    '<span class="layer-error" data-layer-error="' + esc(l.id) + '" hidden> did not load</span></div>';
  return (
    '<details class="layer-panel" open><summary>Layers</summary>' +
    '<fieldset><legend>Basemap</legend>' + basemaps.map(radio).join("") + "</fieldset>" +
    '<fieldset><legend>Overlays</legend>' + overlays.map(box).join("") + custom.map(box).join("") + "</fieldset>" +
    '<form class="layer-add" data-add-layer><label for="layer-url">Add your own layer</label>' +
    '<input id="layer-url" name="url" type="url" placeholder="https://…/FeatureServer/0" required />' +
    '<input name="name" type="text" placeholder="Name, such as Paddocks" maxlength="60" />' +
    '<button type="submit" class="btn btn-ghost btn-small">Add</button>' +
    '<p class="layer-error" data-add-error hidden></p></form>' +
    (hasKey ? '<p class="layer-note">Using your ArcGIS key for Esri basemaps.</p>' : "") +
    "</details>"
  );
}

/**
 * Show the map in el. options: { animals, apiKey, now, onSelect }.
 * Returns { select(id), setAlerts(ids), destroy() }.
 */
export function mountRancherMap(el, { animals, apiKey, now, onSelect }) {
  const hasKey = Boolean(apiKey);
  const layers = availableLayers(hasKey);
  const saved = readStore(STATE_KEY, {});
  const state = {
    basemap: layers.some((l) => l.id === saved.basemap && l.group === "basemap") ? saved.basemap : hasKey ? KEYED_DEFAULT_BASEMAP : DEFAULT_BASEMAP,
    overlays: Array.isArray(saved.overlays) ? saved.overlays.filter((id) => typeof id === "string") : ["fire-perimeters", "weather-alerts"],
  };
  let custom = readStore(CUSTOM_KEY, [])
    .map((item) => customLayer(item.url, item.name).layer)
    .filter(Boolean);

  el.innerHTML = '<div class="rancher-map-canvas" data-canvas></div>';
  const map = L.map(el.querySelector("[data-canvas]"), { zoomControl: true, worldCopyJump: true });
  const live = new Map();
  const byId = (id) => [...layers, ...custom].find((l) => l.id === id);

  const showError = (id, on) => {
    const flag = el.querySelector('[data-layer-error="' + id + '"]');
    if (flag) flag.hidden = !on;
  };
  const enable = (id) => {
    const layer = byId(id);
    if (!layer || live.has(id)) return;
    const made = makeLayer(layer, apiKey);
    if (!made) return;
    // Tile caches can skip empty tiles, so flag a tile layer only when
    // no tile has loaded yet. Feature and dynamic layers flag on any error.
    let loaded = false;
    made.on?.("tileload load", () => {
      loaded = true;
      showError(id, false);
    });
    let failed = 0;
    made.on?.("tileerror", () => {
      if (loaded) return;
      showError(id, true);
      // A basemap with no tiles for this area (the USGS maps cover the US
      // only) falls back to Streets once, so the map is never blank.
      failed += 1;
      if (id === state.basemap && id !== FALLBACK_BASEMAP && failed >= 4) {
        disable(id);
        state.basemap = FALLBACK_BASEMAP;
        enable(FALLBACK_BASEMAP);
        live.get(FALLBACK_BASEMAP)?.bringToBack?.();
        drawPanel();
      }
    });
    made.on?.("requesterror loaderror", () => showError(id, true));
    made.addTo(map);
    live.set(id, made);
  };
  const disable = (id) => {
    const made = live.get(id);
    if (made) map.removeLayer(made);
    live.delete(id);
    showError(id, false);
  };
  const save = () => writeStore(STATE_KEY, state);

  const Panel = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-control layer-panel-wrap");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  const panel = new Panel().addTo(map);
  const drawPanel = () => {
    const holder = panel.getContainer();
    holder.innerHTML = panelHtml(layers, hasKey, state, custom);
    holder.querySelectorAll('input[name="basemap"]').forEach((input) =>
      input.addEventListener("change", () => {
        disable(state.basemap);
        state.basemap = input.value;
        enable(state.basemap);
        live.get(state.basemap)?.bringToBack?.();
        save();
      })
    );
    holder.querySelectorAll('input[type="checkbox"]').forEach((input) =>
      input.addEventListener("change", () => {
        if (input.checked) {
          enable(input.value);
          if (!state.overlays.includes(input.value)) state.overlays.push(input.value);
        } else {
          disable(input.value);
          state.overlays = state.overlays.filter((id) => id !== input.value);
        }
        save();
      })
    );
    holder.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", () => {
        disable(button.dataset.remove);
        custom = custom.filter((l) => l.id !== button.dataset.remove);
        state.overlays = state.overlays.filter((id) => id !== button.dataset.remove);
        writeStore(CUSTOM_KEY, custom.map((l) => ({ url: l.url, name: l.name })));
        save();
        drawPanel();
      })
    );
    const form = holder.querySelector("[data-add-layer]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const result = customLayer(form.url.value, form.name.value);
      const out = form.querySelector("[data-add-error]");
      if (result.error) {
        out.textContent = result.error;
        out.hidden = false;
        return;
      }
      if (!custom.some((l) => l.id === result.layer.id)) custom.push(result.layer);
      writeStore(CUSTOM_KEY, custom.map((l) => ({ url: l.url, name: l.name })));
      if (!state.overlays.includes(result.layer.id)) state.overlays.push(result.layer.id);
      save();
      drawPanel();
      enable(result.layer.id);
    });
  };
  drawPanel();
  enable(state.basemap);
  for (const id of state.overlays) enable(id);

  const markers = new Map();
  const points = [];
  for (const animal of animals) {
    const pos = animal.details?.position;
    if (!Number.isFinite(pos?.latitude) || !Number.isFinite(pos?.longitude)) continue;
    const latlng = [pos.latitude, pos.longitude];
    points.push(latlng);
    const classes = ["rancher-pin"];
    if (Number.isFinite(animal.battery) && animal.battery < ALERT_RULES.lowBatteryPercent && !animal.externalPower) classes.push("is-low");
    if (animal.silent) classes.push("is-silent");
    if (animal.sensors?.sos) classes.push("is-sos");
    const marker = L.marker(latlng, {
      icon: L.divIcon({ className: classes.join(" "), html: "<span>" + esc(animal.alias) + "</span>", iconSize: null }),
      title: animal.alias,
      keyboard: true,
    });
    marker.bindPopup(() => trackerPopup(animal, now));
    marker.on("click", () => onSelect?.(animal.id));
    marker.addTo(map);
    markers.set(animal.id, marker);
  }
  if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.4), { maxZoom: 16 });
  else map.setView([0, 0], 2);

  return {
    select(id) {
      for (const [key, marker] of markers) marker.getElement()?.classList.toggle("is-active", key === id);
    },
    // Ring the trackers that have an open alert.
    setAlerts(ids) {
      const open = new Set(ids);
      for (const [key, marker] of markers) marker.getElement()?.classList.toggle("has-alert", open.has(key));
    },
    destroy() {
      map.remove();
    },
  };
}
