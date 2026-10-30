import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const FORBIDDEN_KEYS = new Set(["price", "usd", "currency"]);

// Keys that point at a real place, device, or radio site. Matched without
// regard to case or separators, so gateway_id, gatewayId, and GATEWAY all fail.
const PRIVATE_KEY_WORDS = ["latitude", "longitude", "deveui", "rssi", "gateway"];
// Short words are matched as a whole word part only, so "translate" is fine
// but lat, lat_deg, and latDeg are not.
const PRIVATE_KEY_PARTS = new Set(["lat", "lng"]);
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

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const DATA_EXTENSIONS = new Set([".json", ".js", ".mjs", ".cjs"]);

function readJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

function requireText(object, key) {
  assert.equal(typeof object[key], "string", `${key} must be a string`);
  assert.ok(object[key].trim().length > 0, `${key} must not be empty`);
}

function forbiddenKeys(value, path, found) {
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
function keyParts(key) {
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

function dataFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...dataFiles(path));
    else if (DATA_EXTENSIONS.has(extname(name).toLowerCase())) files.push(path);
  }
  return files.sort();
}

test("herd.json has the sample herd fields", () => {
  const data = readJson("../public/data/herd.json");
  requireText(data, "ranch");
  requireText(data, "note");
  requireText(data, "updated");
  assert.ok(Array.isArray(data.goats) && data.goats.length > 0, "goats must be a non-empty array");

  const ids = new Set();
  for (const goat of data.goats) {
    for (const key of ["id", "name", "breed", "color", "status", "fiber"]) {
      requireText(goat, key);
    }
    assert.equal(typeof goat.x, "number");
    assert.equal(typeof goat.y, "number");
    assert.ok(Number.isFinite(goat.x) && Number.isFinite(goat.y));
    assert.ok(!ids.has(goat.id), `duplicate goat id ${goat.id}`);
    ids.add(goat.id);
  }
});

test("shop.json has sample lots and no price fields", () => {
  const data = readJson("../public/data/shop.json");
  requireText(data, "note");
  assert.ok(
    Array.isArray(data.products) && data.products.length > 0,
    "products must be a non-empty array"
  );

  const ids = new Set();
  for (const product of data.products) {
    for (const key of ["id", "name", "fiber"]) requireText(product, key);
    assert.equal(typeof product.grams, "number");
    assert.ok(Number.isFinite(product.grams) && product.grams > 0);
    assert.equal(typeof product.inStock, "boolean");
    assert.ok(!ids.has(product.id), `duplicate product id ${product.id}`);
    ids.add(product.id);
  }

  const found = [];
  forbiddenKeys(data, "shop", found);
  assert.deepEqual(found, []);
});

test("price, usd, and currency keys are rejected", () => {
  const sample = {
    currency: "sample",
    products: [{ price: null, details: { usd: null } }],
  };
  const found = [];
  forbiddenKeys(sample, "sample", found);
  assert.deepEqual(found.sort(), ["sample.currency", "sample.products[0].details.usd", "sample.products[0].price"]);
});

test("no JSON or JS data in public/ has location, device, contact, or secret data", () => {
  const files = dataFiles(PUBLIC_DIR);
  assert.ok(files.length > 0, "expected data files in public/");
  const found = [];
  for (const file of files) {
    const name = relative(PUBLIC_DIR, file);
    const text = readFileSync(file, "utf8");
    if (extname(file).toLowerCase() === ".json") {
      privateDataProblems(JSON.parse(text), name, found);
    } else {
      privateSourceProblems(text, name, found);
    }
  }
  assert.deepEqual(found, [], "private data found in public/:\n" + found.join("\n"));
});

test("location, device, and radio keys are rejected in any case or form", () => {
  const rejected = [
    "lat", "LAT", "lng", "Lng", "latitude", "Latitude", "LONGITUDE", "longitude",
    "lat_deg", "latDeg", "home_lng", "devEUI", "dev_eui", "DevEui", "deveui",
    "rssi", "RSSI", "rssi_dbm", "lastRssi", "gateway", "Gateway", "gateway_id",
    "gatewayId", "GATEWAY_ID", "gateway-id", "nearestGateway", "api_key", "apiKey", "secret",
  ];
  for (const key of rejected) assert.ok(isPrivateKey(key), `${key} should be rejected`);

  const allowed = ["x", "y", "translate", "plateau", "collar", "status", "name", "inStock", "updated"];
  for (const key of allowed) assert.ok(!isPrivateKey(key), `${key} should be allowed`);

  const found = privateDataProblems(
    { goats: [{ Latitude: 0, gps: { lng: 0 } }], node: { gatewayId: "", devEUI: "", RSSI: 0 } },
    "sample"
  );
  assert.equal(found.length, 5);

  const sourceFound = privateSourceProblems(
    'export const pin = { lat: 1, "gateway_id": "g", devEui: "d" };\npin.rssi = -90;',
    "sample.js"
  );
  assert.equal(sourceFound.length, 4);
});

test("email-like and key-like strings are rejected", () => {
  const rejected = [
    "someone@example.com",
    "write to Ranch.Hand+herd@mail.example.org today",
    "sk_live_51HxAbCdEfGhIjKl",
    "pk_test_abcdefgh12345678",
    "api_key=abcd1234efgh5678",
    "apiKey: 'Zx9Lm2Np4Qr6St8V'",
    "0123456789abcdef0123456789abcdef",
    "dGhpcyBpcyBhIHNlY3JldCB0b2tlbiB2YWx1ZQ1234==",
  ];
  for (const value of rejected) {
    assert.ok(privateValueProblem(value), `${value} should be rejected`);
  }

  const allowed = [
    "Sample goats for this demo. This is not a real ranch herd.",
    "long staple mohair-blend",
    "Community collar kit (demo)",
    "2026-09-06",
    "roving-juniper",
  ];
  for (const value of allowed) {
    assert.equal(privateValueProblem(value), null, `${value} should be allowed`);
  }

  const found = privateDataProblems({ contact: "someone@example.com", nested: ["sk_live_51HxAbCdEfGh"] }, "sample");
  assert.equal(found.length, 2);
});
