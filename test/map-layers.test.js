import assert from "node:assert/strict";
import test from "node:test";
import { availableLayers, customLayer, DEFAULT_BASEMAP, KEYED_DEFAULT_BASEMAP, LAYERS, tileUrl } from "../src/map-layers.js";
import { plainHttpOk, readConfig } from "../scripts/chirpstack/config.js";
import { pushLive, readPushConfig } from "../scripts/chirpstack/push.js";
import { hideTrackerDetails } from "../src/live-format.js";
import { fakeFullLive } from "./fixtures/live.js";

test("layer config: unique ids, https only, no keys in URLs, attribution and terms on every layer", () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const layer of LAYERS) {
    assert.ok(["basemap", "overlay"].includes(layer.group), layer.id);
    assert.ok(["tile", "feature", "dynamic"].includes(layer.type), layer.id);
    assert.match(layer.url, /^https:\/\//, layer.id);
    assert.doesNotMatch(layer.url, /token=|key=|apikey|secret/i, layer.id);
    assert.ok(layer.attribution && layer.terms && layer.source, layer.id);
    assert.equal(typeof layer.needsKey, "boolean", layer.id);
    if (layer.type === "tile") assert.match(layer.url, /\{z\}.*\{(x|y)\}.*\{(x|y)\}/, layer.id);
    if (layer.type === "feature") assert.match(layer.url, /\/FeatureServer\/\d+$/, layer.id);
    if (layer.popup) assert.ok(layer.popup.title && layer.popup.fields.length, layer.id);
  }
});

test("basemaps: imagery, topo, and streets with or without a key; Esri ones need the key", () => {
  const names = (list) => list.filter((l) => l.group === "basemap").map((l) => l.name.toLowerCase());
  for (const hasKey of [false, true]) {
    const basemaps = names(availableLayers(hasKey));
    for (const kind of ["imagery", "topo", "streets"]) assert.ok(basemaps.some((n) => n.startsWith(kind)), kind + " with key=" + hasKey);
  }
  assert.ok(availableLayers(false).every((l) => !l.needsKey));
  assert.ok(LAYERS.filter((l) => l.needsKey).every((l) => /Powered by Esri/.test(l.attribution)), "Esri layers carry Powered by Esri");
  assert.ok(LAYERS.filter((l) => l.needsKey).every((l) => l.group === "basemap"), "every overlay works without a key");
  assert.equal(LAYERS.find((l) => l.id === DEFAULT_BASEMAP).needsKey, false);
  assert.equal(LAYERS.find((l) => l.id === KEYED_DEFAULT_BASEMAP).needsKey, true);
  const overlays = availableLayers(false).filter((l) => l.group === "overlay").map((l) => l.id);
  assert.deepEqual(overlays, ["fire-perimeters", "fire-incidents", "weather-alerts", "fire-weather", "smoke", "air-quality", "land-ownership"]);
});

test("tileUrl adds the key only to key layers, and gives nothing without one", () => {
  const esri = LAYERS.find((l) => l.id === "esri-imagery");
  const usgs = LAYERS.find((l) => l.id === "usgs-imagery");
  assert.equal(tileUrl(esri, ""), null);
  assert.match(tileUrl(esri, "fake key/1"), /\?token=fake%20key%2F1$/);
  assert.equal(tileUrl(usgs, "fake-key"), usgs.url, "the key never goes to a layer that does not need it");
});

test("a rancher's own layer: ArcGIS or GeoJSON over https, no logins or tokens", () => {
  const feature = customLayer("https://services.example/arcgis/rest/services/Paddocks/FeatureServer/0", "Paddocks");
  assert.equal(feature.layer.type, "feature");
  assert.equal(feature.layer.name, "Paddocks");
  assert.match(feature.layer.id, /^custom-/);
  assert.equal(customLayer("https://services.example/arcgis/rest/services/Water/MapServer").layer.type, "dynamic");
  assert.equal(customLayer("https://files.example/water-points.geojson").layer.type, "geojson");
  assert.equal(customLayer("https://files.example/water-points.geojson").layer.name, "Your layer");
  assert.ok(customLayer("http://services.example/x/FeatureServer/0").error);
  assert.ok(customLayer("https://user:pw@services.example/x/FeatureServer/0").error);
  assert.ok(customLayer("https://services.example/x/FeatureServer/0?token=abc").error);
  assert.ok(customLayer("https://services.example/page.html").error);
  assert.ok(customLayer("javascript:alert(1)").error);
  assert.ok(customLayer("").error);
  assert.equal(customLayer("https://a.example/x/FeatureServer/0/").layer.id, customLayer("https://a.example/x/FeatureServer/0").layer.id);
});

test("plain http to a compose container name or with CHIRPSTACK_ALLOW_HTTP=1 does not warn", () => {
  const io = { readFile: () => "fake-token-value", stat: () => ({ mode: 0o600 }), home: "/home/fake" };
  const warns = (env) => readConfig(env, io).warnings.some((w) => /plain http/.test(w));
  assert.equal(warns({ CHIRPSTACK_URL: "http://localhost:8090" }), false);
  assert.equal(warns({ CHIRPSTACK_URL: "http://rest-gateway:8090" }), false, "no dot: a container on the same network");
  assert.equal(warns({ CHIRPSTACK_URL: "http://gateway.example:8090" }), true);
  assert.equal(warns({ CHIRPSTACK_URL: "http://10.1.2.3:8090" }), true);
  assert.equal(warns({ CHIRPSTACK_URL: "http://gateway.example:8090", CHIRPSTACK_ALLOW_HTTP: "1" }), false);
  assert.equal(warns({ CHIRPSTACK_URL: "https://gateway.example" }), false);
  assert.equal(plainHttpOk("[fd00::1]", {}), false);
});

test("push settings: https or local only, token from env or file, never in errors", async () => {
  const noFile = { readFile: () => { throw new Error("missing"); }, home: "/home/fake" };
  const token = "fake-push-token-" + "z".repeat(24);
  assert.ok(readPushConfig({}, noFile).errors.length >= 2);
  assert.ok(readPushConfig({ FIBERSHARE_PUSH_URL: "http://copy.example/api/push", FIBERSHARE_PUSH_TOKEN: token }, noFile).errors.some((e) => /https/.test(e)));
  assert.ok(readPushConfig({ FIBERSHARE_PUSH_URL: "http://localhost:8788/api/push", FIBERSHARE_PUSH_TOKEN: token }, noFile).push);
  const fromFile = readPushConfig({ FIBERSHARE_PUSH_URL: "https://copy.example/api/push" }, { readFile: () => token + "\n", home: "/home/fake" });
  assert.equal(fromFile.push.token, token);
  assert.ok(readPushConfig({ FIBERSHARE_PUSH_URL: "https://copy.example/api/push" }, noFile).errors.every((e) => !e.includes(token)));

  const full = await fakeFullLive();
  const hidden = hideTrackerDetails(full);
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, init };
    return new Response(JSON.stringify({ ok: false, error: "echo " + token }), { status: 401 });
  };
  const result = await pushLive(fromFile.push, hidden, full, fetchImpl);
  assert.equal(sent.init.headers["X-FiberShare-Push-Token"], token);
  assert.deepEqual(Object.keys(JSON.parse(sent.init.body)), ["hidden", "full"]);
  assert.equal(result.ok, false);
  assert.ok(!result.error.includes(token), "a reply that echoes the token is redacted");
});

test("live files carry pulledAt, and the hidden copy keeps it", async () => {
  const full = await fakeFullLive();
  assert.equal(full.pulledAt, full.generatedAt);
  assert.equal(hideTrackerDetails(full).pulledAt, full.pulledAt);
});

test("tile layers do not ask past the depth of their cache", () => {
  // Checked with npm run layers:check: USGS caches stop at z16, the BLM cache at z14.
  const depth = { "usgs-imagery": 16, "usgs-topo": 16, "land-ownership": 14 };
  for (const [id, deepest] of Object.entries(depth)) {
    const layer = LAYERS.find((l) => l.id === id);
    assert.ok(layer, id);
    assert.ok(layer.maxNativeZoom <= deepest, id + " maxNativeZoom " + layer.maxNativeZoom);
  }
});
