// Turn raw ChirpStack data into the demo's live format.
//
// toLiveData builds the full record for each tracker: its real name, DevEUI,
// tags, description, battery, signal, last-seen time, and decoded uplink
// values such as position, temperature, light, motion, and SOS. The full
// record is only for your own hardware. hideTrackerDetails (in
// src/live-format.js) cuts it down to aliases, hashed grid cells, and signal
// buckets. Tenant and application IDs, radio receiver IDs, and receiver
// positions are never copied, in either form.
import { createHash } from "node:crypto";
import { LIVE_SOURCE } from "../../src/live-format.js";
import { GRID_COLS, GRID_ROWS } from "../../src/grid.js";

const HASH_PREFIX = "fibershare-grid-v1:";
export const LOW_BATTERY = 25;
export const VERY_LOW_BATTERY = 15;
export const STALE_HOURS = 2;
const MAX_CHECKIN_EVENTS = 40;

/** A stable key for one device. Hex, 12 characters, safe to keep in .local/. */
export function deviceKey(devEui) {
  return createHash("sha256").update(HASH_PREFIX + String(devEui).toLowerCase()).digest("hex").slice(0, 12);
}

/** A stable cell on the virtual grid, picked from a hash of the DevEUI. */
export function gridPosition(devEui) {
  const bytes = createHash("sha256").update(HASH_PREFIX + "pos:" + String(devEui).toLowerCase()).digest();
  const col = bytes[0] % GRID_COLS;
  const row = bytes[1] % GRID_ROWS;
  const jx = 0.2 + (bytes[2] / 255) * 0.6;
  const jy = 0.2 + (bytes[3] / 255) * 0.6;
  return {
    x: Math.round(((col + jx) / GRID_COLS) * 1000) / 10,
    y: Math.round(((row + jy) / GRID_ROWS) * 1000) / 10,
  };
}

/**
 * Give each device a short alias such as "Tracker 3". Aliases already in
 * `known` (device key to number) are kept, so adding a tracker does not
 * renumber the others. New devices get the next free numbers, in hash order.
 */
export function assignAliases(devEuis, known = {}) {
  const numbers = { ...known };
  const used = new Set(Object.values(numbers));
  const keys = [...new Set(devEuis.map(deviceKey))].sort();
  let next = 1;
  for (const key of keys) {
    if (numbers[key]) continue;
    while (used.has(next)) next += 1;
    numbers[key] = next;
    used.add(next);
  }
  return numbers;
}

/** Battery as a whole percent, or null when ChirpStack does not have one. */
export function batteryOf(device) {
  const status = device?.deviceStatus;
  const level = status ? Number(status.batteryLevel) : NaN;
  return {
    battery: Number.isFinite(level) && level >= 0 && level <= 100 ? Math.round(level) : null,
    externalPower: Boolean(status?.externalPowerSource),
  };
}

function firstDataset(metric) {
  const data = metric?.datasets?.[0]?.data;
  return Array.isArray(data) ? data.map((v) => Number(v)) : [];
}

/** Hourly uplink counts with their hour timestamps. */
export function uplinkSeries(linkMetrics) {
  const counts = firstDataset(linkMetrics?.rxPackets).map((v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0));
  const times = Array.isArray(linkMetrics?.rxPackets?.timestamps) ? linkMetrics.rxPackets.timestamps : [];
  return counts.map((count, i) => ({ time: times[i] || null, count }));
}

/**
 * A rough signal bucket from the radio receivers' SNR, or RSSI when SNR is
 * missing, averaged over hours that had uplinks. Only the bucket is kept.
 */
export function signalBucket(linkMetrics) {
  const counts = firstDataset(linkMetrics?.rxPackets);
  const average = (values) => {
    const picked = values.filter((v, i) => Number.isFinite(v) && (counts[i] > 0 || !counts.length) && v !== 0);
    return picked.length ? picked.reduce((a, b) => a + b, 0) / picked.length : null;
  };
  const snr = average(firstDataset(linkMetrics?.gwSnr));
  if (snr !== null) return snr >= 0 ? "good" : snr >= -7 ? "fair" : "weak";
  const strength = average(firstDataset(linkMetrics?.gwRssi));
  if (strength !== null) return strength >= -100 ? "good" : strength >= -115 ? "fair" : "weak";
  return null;
}

const SENSOR_NAMES = [
  ["latitude", /^(lat|latitude)$/],
  ["longitude", /^(lon|lng|long|longitude)$/],
  ["temperature", /temp/],
  ["light", /^(light|lux|illuminance|light ?intensity)$/],
  ["battery", /^(battery|battery ?level|battery ?percent)$/],
  ["motion", /motion/],
  ["sos", /^(sos|sos ?event|sos ?status)$/],
];

function sensorName(label) {
  const key = String(label).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();
  const compact = key.replace(/\s+/g, "");
  for (const [name, pattern] of SENSOR_NAMES) {
    if (pattern.test(key) || pattern.test(compact)) return name;
  }
  return null;
}

/**
 * Pull known values out of a decoded uplink "object". Codecs differ, so this
 * looks for plain keys (latitude, temperature, ...) and for lists of
 * { type, measurementValue } items, which is how some tracker codecs report
 * their readings. Not checked against every codec.
 */
export function decodeObject(object) {
  const out = {};
  const visit = (value, depth) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    if ("type" in value && "measurementValue" in value) {
      const name = sensorName(value.type);
      if (name && !(name in out)) out[name] = value.measurementValue;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const name = sensorName(key);
      if (name && (typeof child === "number" || typeof child === "boolean" || typeof child === "string") && !(name in out)) {
        out[name] = child;
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(object, 0);
  const num = (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);
  const result = {};
  const lat = num(out.latitude);
  const lon = num(out.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    result.latitude = lat;
    result.longitude = lon;
  }
  const round = { temperature: 10, light: 1, battery: 1 };
  for (const key of ["temperature", "light", "battery"]) {
    const v = num(out[key]);
    if (Number.isFinite(v)) result[key] = Math.round(v * round[key]) / round[key];
  }
  if (out.motion !== undefined) {
    const v = num(out.motion);
    if (typeof v === "boolean") result.motion = v ? 1 : 0;
    else if (Number.isFinite(v)) result.motion = Math.round(v);
  }
  if (out.sos !== undefined) {
    const v = out.sos;
    result.sos = v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
  }
  return result;
}

function hoursBetween(laterIso, earlierIso) {
  return (new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 3600000;
}

function validTime(value) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanTags(tags) {
  if (!tags || typeof tags !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(tags)) out[String(key)] = String(value);
  return out;
}

function average(values) {
  const picked = values.filter((v) => Number.isFinite(v));
  return picked.length ? Math.round((picked.reduce((a, b) => a + b, 0) / picked.length) * 10) / 10 : null;
}

/**
 * Map raw pull results to the live format, with full tracker details.
 * raw: {
 *   devices: DeviceListItem[] from GET /api/devices,
 *   linkMetrics: { [devEui]: GetDeviceLinkMetricsResponse },
 *   uplinks: parsed MQTT up events (see mqtt.js), optional,
 *   now, hours
 * }
 * Returns { data, aliases } where aliases is the device key to number table.
 * Pass data through hideTrackerDetails before writing a hidden export.
 */
export function toLiveData(raw, { knownAliases = {}, staleHours = STALE_HOURS } = {}) {
  const now = validTime(raw.now) || new Date().toISOString();
  const hours = Number.isFinite(raw.hours) ? raw.hours : 24;
  const byEui = new Map();
  for (const device of raw.devices || []) {
    if (device && device.devEui) byEui.set(String(device.devEui).toLowerCase(), device);
  }
  const uplinksByEui = new Map();
  for (const up of raw.uplinks || []) {
    if (!up || !up.devEui) continue;
    const eui = String(up.devEui).toLowerCase();
    if (!byEui.has(eui)) byEui.set(eui, { devEui: up.devEui, name: up.deviceName, tags: up.tags, lastSeenAt: up.time });
    if (!uplinksByEui.has(eui)) uplinksByEui.set(eui, []);
    uplinksByEui.get(eui).push(up);
  }
  const devices = [...byEui.values()];
  const aliases = assignAliases(devices.map((d) => d.devEui), knownAliases);
  const animals = [];
  const checkins = [];
  const notices = [];

  for (const device of devices) {
    const eui = String(device.devEui).toLowerCase();
    const n = aliases[deviceKey(device.devEui)];
    const alias = "Tracker " + n;
    const id = "tracker-" + n;
    const { x, y } = gridPosition(device.devEui);
    let { battery, externalPower } = batteryOf(device);
    const ups = (uplinksByEui.get(eui) || [])
      .map((up) => ({ ...up, time: validTime(up.time) }))
      .filter((up) => up.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    let lastSeen = validTime(device.lastSeenAt);
    const lastUp = ups[ups.length - 1];
    if (lastUp && (!lastSeen || lastUp.time > lastSeen)) lastSeen = lastUp.time;

    // Latest decoded values, newest uplink first.
    const sensors = {};
    let position = null;
    for (const up of [...ups].reverse()) {
      const decoded = decodeObject(up.object);
      if (!position && Number.isFinite(decoded.latitude)) {
        position = { latitude: decoded.latitude, longitude: decoded.longitude, at: up.time };
      }
      for (const key of ["temperature", "light", "motion"]) {
        if (!(key in sensors) && Number.isFinite(decoded[key])) sensors[key] = decoded[key];
      }
      if (!("sos" in sensors) && typeof decoded.sos === "boolean") sensors.sos = decoded.sos;
      if (battery === null && Number.isFinite(decoded.battery) && decoded.battery >= 0 && decoded.battery <= 100) {
        battery = Math.round(decoded.battery);
      }
    }
    if (Object.keys(sensors).length && lastUp) sensors.at = lastUp.time;

    const metrics = raw.linkMetrics?.[device.devEui] || raw.linkMetrics?.[eui];
    const series = uplinkSeries(metrics);
    const uplinks24h = series.length ? series.reduce((sum, item) => sum + item.count, 0) : ups.length;
    const quietHours = lastSeen ? hoursBetween(now, lastSeen) : null;
    const status = !lastSeen ? "never seen" : quietHours > staleHours ? "stale" : "online";
    const upSnr = average(ups.map((up) => up.snr));
    const upRssi = average(ups.map((up) => up.rssi));
    const snr = average(firstDataset(metrics?.gwSnr).filter((v) => v !== 0)) ?? upSnr;
    const strength = average(firstDataset(metrics?.gwRssi).filter((v) => v !== 0)) ?? upRssi;
    let signal = signalBucket(metrics);
    if (!signal && (upSnr !== null || upRssi !== null)) {
      signal = signalBucket({ gwSnr: { datasets: [{ data: upSnr === null ? [] : [upSnr] }] }, gwRssi: { datasets: [{ data: upRssi === null ? [] : [upRssi] }] } });
    }

    animals.push({
      id,
      alias,
      name: String(device.name || alias),
      tracker: alias,
      x,
      y,
      battery,
      externalPower,
      lastSeen,
      status,
      silent: status !== "online",
      uplinks: series.map((item) => item.count),
      uplinks24h,
      signal,
      sensors: Object.keys(sensors).length ? sensors : null,
      details: {
        deviceName: device.name ? String(device.name) : null,
        devEui: String(device.devEui),
        profile: device.deviceProfileName ? String(device.deviceProfileName) : null,
        description: device.description ? String(device.description) : null,
        tags: cleanTags(device.tags),
        snr,
        rssi: strength,
        position,
      },
    });

    for (const item of series) {
      const time = validTime(item.time);
      if (!item.count || !time) continue;
      checkins.push({
        time,
        type: "checkin",
        animalId: id,
        text: alias + " sent " + item.count + (item.count === 1 ? " uplink" : " uplinks") + " this hour.",
      });
    }
    if (!series.length) {
      for (const up of ups) checkins.push({ time: up.time, type: "checkin", animalId: id, text: alias + " sent an uplink." });
      if (!ups.length && lastSeen && hoursBetween(now, lastSeen) <= hours) {
        checkins.push({ time: lastSeen, type: "checkin", animalId: id, text: alias + " checked in." });
      }
    }
    for (const up of ups) {
      if (decodeObject(up.object).sos === true) {
        notices.push({ time: up.time, type: "sos", severity: "alert", animalId: id, text: alias + " sent an SOS." });
      }
    }
    if (battery !== null && battery < LOW_BATTERY) {
      notices.push({
        time: now,
        type: "battery",
        severity: battery < VERY_LOW_BATTERY ? "alert" : "watch",
        animalId: id,
        battery,
        text: alias + " battery is at " + battery + "%.",
      });
    }
    if (status === "stale") {
      notices.push({
        time: now,
        type: "silent",
        severity: "watch",
        animalId: id,
        text: alias + " has not checked in for " + Math.floor(quietHours) + " hours.",
      });
    } else if (status === "never seen") {
      notices.push({ time: now, type: "silent", severity: "watch", animalId: id, text: alias + " has never checked in." });
    }
  }

  animals.sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]));
  checkins.sort((a, b) => a.time.localeCompare(b.time));
  const events = [...checkins.slice(-MAX_CHECKIN_EVENTS), ...notices]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((event, i) => ({ id: "live-" + String(i + 1).padStart(3, "0"), ...event }));

  return {
    data: {
      source: LIVE_SOURCE,
      hidden: false,
      generatedAt: now,
      pulledAt: now,
      windowHours: hours,
      note: "Full tracker details from your own ChirpStack server. Keep this file on your own hardware.",
      sources: raw.uplinks ? ["rest", "mqtt"] : ["rest"],
      animals,
      events,
    },
    aliases,
  };
}

// leakProblems lives in src/live-format.js so the Pages push endpoint can use it too.
export { leakProblems } from "../../src/live-format.js";

/** Counts for the pull summary. No names, IDs, or values. */
export function summarize(data) {
  const count = (fn) => data.animals.filter(fn).length;
  return {
    trackers: data.animals.length,
    withPosition: count((a) => Boolean(a.details?.position)),
    sos: data.events.filter((e) => e.type === "sos").length,
    online: count((a) => a.status === "online"),
    stale: count((a) => a.status === "stale"),
    neverSeen: count((a) => a.status === "never seen"),
    lowBattery: count((a) => a.battery !== null && a.battery < LOW_BATTERY),
    noBattery: count((a) => a.battery === null),
    uplinks: data.animals.reduce((sum, a) => sum + a.uplinks24h, 0),
    events: data.events.length,
  };
}
