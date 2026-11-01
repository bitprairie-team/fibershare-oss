import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { cellLabels, cellOf } from "../src/grid.js";
import { grazingLog, sortEvents, stateAt } from "../src/herd-state.js";
import { traceLot, visibleRecord } from "../src/records.js";
import { hideTrackerDetails, isLiveData } from "../src/live-format.js";
import { localMap } from "../src/data.js";
import { committedTextProblems, deviceIdProblem, coordinateProblem, privateDataProblems } from "../scripts/private-data.js";
import { fakeEui, fakePosition } from "./fixtures/chirpstack.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));
const herd = read("public/data/herd.json");
const events = read("public/data/events.json");
const records = {
  animals: [read("docs/schemas/examples/animal.example.json")],
  shearings: [read("docs/schemas/examples/shearing.example.json")],
  fleeces: [read("docs/schemas/examples/fleece.example.json")],
  lots: [read("docs/schemas/examples/fiber-lot.example.json")],
};

test("the grid has 24 cells and every sample goat sits inside it", () => {
  assert.equal(cellLabels().length, 24);
  assert.equal(cellOf(0, 0), "A1");
  assert.equal(cellOf(99.9, 99.9), "F4");
  for (const goat of herd.goats) {
    assert.ok(goat.x >= 0 && goat.x <= 100 && goat.y >= 0 && goat.y <= 100, goat.id);
  }
});

test("the sample event feed is marked simulated and ends where herd.json says", () => {
  assert.equal(events.simulated, true);
  const ids = new Set(herd.goats.map((g) => g.id));
  for (const event of events.events) {
    if (event.animalId) assert.ok(ids.has(event.animalId), event.id);
  }
  const types = new Set(events.events.map((e) => e.type));
  for (const type of ["checkin", "battery", "silent", "still", "out-of-paddock", "move", "graze", "predator", "smoke"]) assert.ok(types.has(type), type);
  const end = stateAt(herd.goats, events.events, events.events.length);
  for (const goat of herd.goats) {
    const state = end.animals.find((a) => a.id === goat.id);
    assert.equal(state.x, goat.x, goat.id + " x");
    assert.equal(state.y, goat.y, goat.id + " y");
    assert.equal(state.battery, goat.battery, goat.id + " battery");
  }
  assert.deepEqual(end.alertCells, []);
  assert.equal(end.smoke, false);
});

test("playback shows the predator and smoke alerts mid-day", () => {
  const sorted = sortEvents(events.events);
  const predator = sorted.findIndex((e) => e.type === "predator") + 1;
  const smoke = sorted.findIndex((e) => e.type === "smoke") + 1;
  assert.ok(stateAt(herd.goats, events.events, predator).alertCells.length === 1);
  assert.equal(stateAt(herd.goats, events.events, smoke).smoke, true);
});

test("Bramble's fleece traces to the mohair-bramble lot, with sharing applied", () => {
  const chain = traceLot("mohair-bramble", records);
  assert.ok(chain);
  assert.equal(chain.steps.length, 1);
  assert.equal(chain.steps[0].animal.id, "bramble");
  assert.ok(herd.goats.some((g) => g.id === "bramble"));
  const lotForRancher = visibleRecord(chain.lot, "rancher");
  assert.deepEqual(lotForRancher.hidden, []);
  for (const step of [chain.lot, ...Object.values(chain.steps[0])]) {
    const pub = visibleRecord(step, "public");
    if (pub) {
      const shared = new Set(step.sharing.fields);
      assert.ok(Object.keys(pub.fields).every((k) => shared.has(k)));
    }
  }
  assert.equal(traceLot("no-such-lot", records), null);
  assert.equal(visibleRecord({ id: "x", sharing: { audience: "private", fields: [] } }, "buyers"), null);
});

test("isLiveData accepts the live shape and rejects others", () => {
  const ok = { source: "chirpstack", generatedAt: "2026-09-06T18:00:00Z", animals: [{ id: "tracker-1", alias: "Tracker 1", x: 10, y: 20 }], events: [] };
  assert.ok(isLiveData(ok));
  assert.ok(isLiveData(hideTrackerDetails(ok)));
  assert.ok(!isLiveData({ ...ok, source: "other" }));
  assert.ok(!isLiveData({ ...ok, animals: [{ id: "tracker-1", x: "10", y: 20, alias: "Tracker 1" }] }));
  assert.ok(!isLiveData(null));
});

test("the local map places trackers with a position, north up, inside the box", () => {
  const animals = [1, 2, 3].map((n) => ({ id: "tracker-" + n, alias: "Tracker " + n, x: 0, y: 0, details: { position: n === 3 ? null : fakePosition(n) } }));
  const span = localMap(animals);
  assert.ok(span >= 50);
  assert.ok(animals[0].onMap && animals[1].onMap && !animals[2].onMap);
  assert.ok(animals[1].y < animals[0].y, "further north is higher up");
  for (const a of animals.slice(0, 2)) assert.ok(a.x > 0 && a.x < 100 && a.y > 0 && a.y < 100);
  assert.equal(localMap([{ id: "a", details: {} }]), null);
});

test("the private-data check catches DevEUIs and coordinates", () => {
  assert.ok(deviceIdProblem("id " + fakeEui(3)));
  assert.ok(deviceIdProblem(fakeEui(3).match(/../g).join(":")));
  assert.equal(deviceIdProblem("sha 1234567"), null);
  const pos = fakePosition(2);
  assert.ok(coordinateProblem(pos.latitude.toFixed(5) + ", " + pos.longitude.toFixed(5)));
  assert.equal(coordinateProblem("x 72, y 58"), null);
  assert.ok(privateDataProblems({ at: pos.latitude }, "f").length > 0);
  assert.deepEqual(privateDataProblems({ x: 72.5, battery: 19 }, "f"), []);
});

const BINARY = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".pdf"]);

test("no committed file has a DevEUI-like hex string or a coordinate", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((path) => path !== "package-lock.json" && !BINARY.has(extname(path).toLowerCase()));
  assert.ok(files.length > 20);
  const found = [];
  for (const path of files) {
    let text;
    try {
      text = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    } catch {
      continue;
    }
    committedTextProblems(text, path, found);
  }
  assert.deepEqual(found, []);
});

test("new location and device key names are caught", async () => {
  const { isPrivateKey } = await import("../scripts/private-data.js");
  for (const key of ["coords", "geo_hash", "gpsFix", "devEui", "dev_eui", "lon"]) assert.ok(isPrivateKey(key), key);
  for (const key of ["translate", "longevity", "alias", "signal"]) assert.ok(!isPrivateKey(key), key);
});

test("grazing log: sample day lists paddock moves and grazing notes as Play advances", () => {
  const sorted = sortEvents(events.events);
  assert.equal(grazingLog(sorted, 0).length, 0);
  const morning = sorted.findIndex((e) => e.id === "e35") + 1;
  const mid = sorted.findIndex((e) => e.id === "e36") + 1;
  const afternoon = sorted.findIndex((e) => e.id === "e37") + 1;
  assert.deepEqual(grazingLog(sorted, morning).map((e) => e.type), ["move"]);
  assert.deepEqual(grazingLog(sorted, mid).map((e) => e.type), ["move", "graze"]);
  const end = grazingLog(sorted, afternoon);
  assert.deepEqual(end.map((e) => e.type), ["move", "graze", "move"]);
  assert.equal(end[0].cell, "E2");
  assert.equal(end[2].cell, "B3");
  assert.match(end[1].text, /Sample:/);
  assert.equal(grazingLog(sorted, sorted.length).length, 3);
});

