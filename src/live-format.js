// The shape of .local/live.json, written by `npm run chirpstack:pull`.
// Shared by the browser, the Node scripts, the local server, and the Pages
// Functions, so all of them agree on what is valid and on what "Hide tracker
// details" removes. No Node-only imports here.

export const LIVE_SOURCE = "chirpstack";

/** True when a parsed object looks like a live file this demo can show. */
export function isLiveData(data) {
  if (!data || typeof data !== "object") return false;
  if (data.source !== LIVE_SOURCE) return false;
  if (typeof data.generatedAt !== "string") return false;
  if (!Array.isArray(data.animals) || !Array.isArray(data.events)) return false;
  return data.animals.every(
    (animal) =>
      animal &&
      typeof animal.id === "string" &&
      typeof animal.alias === "string" &&
      Number.isFinite(animal.x) &&
      Number.isFinite(animal.y)
  );
}

const SENSOR_KEYS = ["temperature", "light", "motion", "sos", "at"];
const SIGNAL_BUCKETS = new Set(["good", "fair", "weak"]);

function keepSensors(sensors) {
  if (!sensors || typeof sensors !== "object") return null;
  const out = {};
  for (const key of SENSOR_KEYS) {
    const value = sensors[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (key === "at" && typeof value === "string") out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Hide tracker details. Copies only an allow list of fields, so anything new
 * in the full record is dropped by default: real names become the alias, the
 * DevEUI, tags, description, profile, and position go, the signal becomes a
 * bucket, and the grid cell from a hash stays.
 */
export function hideTrackerDetails(data) {
  const animals = (data.animals || []).map((animal) => ({
    id: String(animal.id),
    alias: String(animal.alias),
    name: String(animal.alias),
    tracker: String(animal.alias),
    x: finite(animal.x) ?? 50,
    y: finite(animal.y) ?? 50,
    battery: finite(animal.battery),
    externalPower: Boolean(animal.externalPower),
    lastSeen: typeof animal.lastSeen === "string" ? animal.lastSeen : null,
    status: ["online", "stale", "never seen"].includes(animal.status) ? animal.status : "unknown",
    silent: Boolean(animal.silent),
    uplinks: Array.isArray(animal.uplinks) ? animal.uplinks.map((n) => finite(n) ?? 0) : [],
    uplinks24h: finite(animal.uplinks24h) ?? 0,
    signal: SIGNAL_BUCKETS.has(animal.signal) ? animal.signal : null,
    sensors: keepSensors(animal.sensors),
  }));
  const ids = new Set(animals.map((a) => a.id));
  const events = (data.events || []).map((event) => ({
    id: String(event.id),
    time: String(event.time),
    type: String(event.type),
    ...(event.severity ? { severity: String(event.severity) } : {}),
    ...(ids.has(event.animalId) ? { animalId: event.animalId } : {}),
    ...(finite(event.battery) !== null ? { battery: event.battery } : {}),
    text: String(event.text),
  }));
  return {
    source: LIVE_SOURCE,
    hidden: true,
    generatedAt: String(data.generatedAt),
    pulledAt: String(data.pulledAt || data.generatedAt),
    windowHours: finite(data.windowHours) ?? 24,
    note: "Tracker details were hidden: aliases in place of names, no device IDs, tags, or positions, and grid cells from a hash.",
    sources: Array.isArray(data.sources) ? data.sources.filter((s) => s === "rest" || s === "mqtt") : ["rest"],
    animals,
    events,
  };
}

/**
 * Strings and numbers from the full records that must never show up in a
 * hidden export. Returns a list of problem kinds, never the values.
 */
export function leakProblems(hiddenData, fullData) {
  const text = JSON.stringify(hiddenData).toLowerCase();
  const problems = new Set();
  for (const animal of fullData.animals || []) {
    const d = animal.details || {};
    const strings = [
      ["device name", d.deviceName],
      ["DevEUI", d.devEui],
      ["profile name", d.profile],
      ["description", d.description],
      ...Object.entries(d.tags || {}).flatMap(([k, v]) => [["tag", k], ["tag", v]]),
    ];
    for (const [kind, value] of strings) {
      if (typeof value !== "string") continue;
      const v = value.trim().toLowerCase();
      if (v.length < 4 || /^tracker \d+$/.test(v)) continue;
      if (text.includes(JSON.stringify(v).slice(1, -1))) problems.add(kind);
    }
    if (d.position) {
      for (const n of [d.position.latitude, d.position.longitude]) {
        const digits = String(n).split(".")[1] || "";
        if (digits.length >= 3 && text.includes(String(n))) problems.add("position");
      }
    }
  }
  if (/"details"|"deveui"|"latitude"|"longitude"|"tags"/.test(text)) problems.add("detail field");
  return [...problems];
}
