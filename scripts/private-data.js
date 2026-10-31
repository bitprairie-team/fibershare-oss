// Shared checks for private data in sample files and draft schemas.
// Used by the tests in test/. Kept here so node --test does not run it as a test file.

export const FORBIDDEN_KEYS = new Set(["price", "usd", "currency"]);

// Keys that point at a real place, device, or radio site. Matched without
// regard to case or separators, so gateway_id, gatewayId, and GATEWAY all fail.
const PRIVATE_KEY_WORDS = ["latitude", "longitude", "deveui", "rssi", "gateway", "geolocation", "coordinate"];
// Short words are matched as a whole word part only, so "translate" is fine
// but lat, lat_deg, and latDeg are not.
const PRIVATE_KEY_PARTS = new Set(["lat", "lng", "lon", "eui", "gps", "coords", "geo"]);
// Keys that usually hold a secret.
const SECRET_KEY_PATTERN = /^(api_?key|apikey|secret|secret_?key|access_?key|access_?token|auth_?token|private_?key)$/;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const SECRET_VALUE_PATTERNS = [
  { name: "sk_/pk_ style key", pattern: /\b(sk|pk|rk)_[A-Za-z0-9_]{8,}/ },
  {
    name: "api_key style value",
    pattern: /\b(api[_-]?key|apikey|secret[_-]?key|access[_-]?key|access[_-]?token|auth[_-]?token|bearer)\b\s*[:=]?\s*["']?[A-Za-z0-9._\-+/]{8,}/i,
  },
  { name: "long hex token", pattern: /\b[0-9a-f]{32,}\b/i },
  {
    name: "long base64 token",
    pattern: /(?=[A-Za-z0-9+/_-]*[0-9])(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])[A-Za-z0-9+/_-]{32,}={0,2}/,
  },
];

// A DevEUI is 8 bytes: 16 hex digits, or 8 pairs split by colons or dashes.
const DEVICE_ID_PATTERNS = [
  { name: "DevEUI-like hex string", pattern: /\b[0-9a-f]{16}\b/i },
  { name: "DevEUI-like hex string", pattern: /\b(?:[0-9a-f]{2}[:-]){7}[0-9a-f]{2}\b/i },
];
const COORDINATE_PATTERNS = [
  { name: "coordinate pair", pattern: /-?\b\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/ },
  { name: "degrees and minutes", pattern: /\b\d{1,3}\s*°\s*\d{1,2}\s*['′]/ },
  { name: "geo: link", pattern: /\bgeo:\s*-?\d/i },
];

export function deviceIdProblem(text) {
  for (const { name, pattern } of DEVICE_ID_PATTERNS) if (pattern.test(text)) return name;
  return null;
}

export function coordinateProblem(text) {
  for (const { name, pattern } of COORDINATE_PATTERNS) if (pattern.test(text)) return name;
  return null;
}

/** A number with four or more decimals in the range of a latitude or longitude. */
export function preciseNumberProblem(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isInteger(value)) return null;
  if (Math.abs(value) > 180) return null;
  const decimals = (String(value).split(".")[1] || "").replace(/e.*$/i, "").length;
  return decimals >= 4 ? "precise decimal number, may be a coordinate" : null;
}

/**
 * Check every line of a committed text file for coordinates and DevEUI-like
 * hex strings. Used on all tracked files, code and docs included.
 */
export function committedTextProblems(text, path, found = []) {
  String(text)
    .split("\n")
    .forEach((line, index) => {
      const problem = deviceIdProblem(line) || coordinateProblem(line);
      if (problem) found.push(`${path}:${index + 1}: ${problem}`);
    });
  return found;
}

export function forbiddenKeys(value, path, found) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) found.push(`${path}.${key}`);
      forbiddenKeys(child, `${path}.${key}`, found);
    }
  }
}

/** Split a key like gatewayId, gateway_id, or GATEWAY-ID into lower-case parts. */
export function keyParts(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

export function isPrivateKey(key) {
  const parts = keyParts(key);
  const joined = parts.join("");
  if (PRIVATE_KEY_WORDS.some((word) => joined.includes(word))) return true;
  if (parts.some((part) => PRIVATE_KEY_PARTS.has(part))) return true;
  return SECRET_KEY_PATTERN.test(parts.join("_")) || SECRET_KEY_PATTERN.test(joined);
}

export function privateValueProblem(text) {
  if (EMAIL_PATTERN.test(text)) return "email-like string";
  const place = coordinateProblem(text) || deviceIdProblem(text);
  if (place) return place;
  for (const { name, pattern } of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

/** Walk parsed JSON and report private keys and private-looking string values. */
export function privateDataProblems(value, path, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => privateDataProblems(item, `${path}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (isPrivateKey(key)) found.push(`${path}.${key}: private key name`);
      const keyProblem = privateValueProblem(key);
      if (keyProblem) found.push(`${path}.${key}: ${keyProblem} in key`);
      privateDataProblems(child, `${path}.${key}`, found);
    }
  } else if (typeof value === "string") {
    const problem = privateValueProblem(value);
    if (problem) found.push(`${path}: ${problem}`);
  } else if (typeof value === "number") {
    const problem = preciseNumberProblem(value);
    if (problem) found.push(`${path}: ${problem}`);
  }
  return found;
}

/** Scan JavaScript source text for private key names and private-looking strings. */
export function privateSourceProblems(source, path, found = []) {
  const keyPattern = /(?:["'`]([A-Za-z_$][\w$-]*)["'`]|([A-Za-z_$][\w$]*))\s*:/g;
  for (const match of source.matchAll(keyPattern)) {
    const key = match[1] ?? match[2];
    if (isPrivateKey(key)) found.push(`${path}: private key name "${key}"`);
  }
  const memberPattern = /\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
  for (const match of source.matchAll(memberPattern)) {
    if (isPrivateKey(match[1])) found.push(`${path}: private key name "${match[1]}"`);
  }
  const stringPattern = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const match of source.matchAll(stringPattern)) {
    const problem = privateValueProblem(match[0].slice(1, -1));
    if (problem) found.push(`${path}: ${problem} in ${match[0].slice(0, 40)}`);
  }
  return found;
}
