#!/usr/bin/env node
// npm run layers:check
//
// Ask every layer in src/map-layers.js whether it still answers, and whether
// the popup fields still exist. Key-only layers are checked with
// ARCGIS_API_KEY when it is set; without it they should answer "token required".
// The key is never printed.
import { LAYERS, tileUrl } from "../src/map-layers.js";

const UA = { "User-Agent": "fibershare-oss layers:check" };

function sampleTile(url) {
  return url.replace("{z}", "4").replace("{y}", "6").replace("{x}", "3");
}

// Web Mercator scale at zoom 0. An ArcGIS tile cache's maxScale tells how deep it goes.
const Z0_SCALE = 591657527.591555;

async function cacheZoom(url) {
  const m = /^(https:\/\/[^{]+\/MapServer)\/tile\//.exec(url);
  if (!m) return null;
  const res = await fetch(m[1] + "?f=json", { headers: UA });
  if (!res.ok) return null;
  const info = await res.json();
  return info.maxScale > 0 ? Math.round(Math.log2(Z0_SCALE / info.maxScale)) : null;
}

async function check(layer, apiKey) {
  if (layer.type === "tile") {
    if (layer.needsKey && !apiKey) {
      const res = await fetch(sampleTile(layer.url), { headers: UA });
      const body = await res.text();
      return /Token Required/i.test(body) ? "answers, needs a key" : "FAIL: HTTP " + res.status;
    }
    const res = await fetch(sampleTile(tileUrl(layer, apiKey)), { headers: UA });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return "FAIL: HTTP " + res.status + " " + type;
    const deepest = await cacheZoom(layer.url);
    if (deepest != null && layer.maxNativeZoom > deepest) {
      return "FAIL: maxNativeZoom " + layer.maxNativeZoom + " but the cache stops at " + deepest;
    }
    return "ok, tile " + type + (deepest != null ? ", cache to z" + deepest : "");
  }
  const res = await fetch(layer.url + "?f=json", { headers: UA });
  if (!res.ok) return "FAIL: HTTP " + res.status;
  const info = await res.json();
  if (info.error) return "FAIL: " + (info.error.message || "error");
  if (layer.popup) {
    const names = new Set((info.fields || []).map((f) => f.name));
    const missing = [layer.popup.title, ...layer.popup.fields.map(([f]) => f)].filter((f) => !names.has(f));
    if (missing.length) return "FAIL: missing fields " + missing.join(", ");
  }
  return "ok, " + (info.geometryType || (info.layers ? info.layers.length + " layers" : "service"));
}

const apiKey = (process.env.ARCGIS_API_KEY || "").trim();
let failed = 0;
for (const layer of LAYERS) {
  let result;
  try {
    result = await check(layer, apiKey);
  } catch (error) {
    result = "FAIL: " + error.message;
  }
  if (result.startsWith("FAIL")) failed += 1;
  console.log(layer.id.padEnd(18) + result);
}
console.log(failed ? "layers:check: " + failed + " layer(s) failed" : "layers:check: all layers answered");
process.exit(failed ? 1 : 0);
