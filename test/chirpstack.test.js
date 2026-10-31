import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_URL, readConfig } from "../scripts/chirpstack/config.js";
import { buildHeaders, pullRaw, redact } from "../scripts/chirpstack/client.js";
import { assignAliases, decodeObject, deviceKey, gridPosition, leakProblems, signalBucket, summarize, toLiveData } from "../scripts/chirpstack/map.js";
import { collectUplinks, connectPacket, parsePublish, parseUplinkEvent, readPackets, subscribePacket, uplinkTopics } from "../scripts/chirpstack/mqtt.js";
import { hiddenExportProblems, main, parseArgs } from "../scripts/chirpstack/pull.js";
import { hideTrackerDetails, isLiveData } from "../src/live-format.js";
import { KV_FULL, KV_HIDDEN, postPush } from "../server/pages.js";
import { FAKE_TOKEN, NOW, allDevices, applications, fakeEui, fakeFetch, fakePosition, uplinkEvent } from "./fixtures/chirpstack.js";

const baseConfig = { baseUrl: DEFAULT_URL, token: FAKE_TOKEN, accessId: null, accessSecret: null, tenantIds: [], applicationIds: [] };
const noFile = { readFile: () => { throw new Error("missing"); }, home: "/home/fake" };

async function pullFixture(extra = {}) {
  const raw = await pullRaw(baseConfig, { fetchImpl: fakeFetch(), now: new Date(NOW) });
  return { ...raw, ...extra };
}

test("config defaults to the local REST gateway on port 8090", () => {
  const { config, errors } = readConfig({ CHIRPSTACK_API_TOKEN: FAKE_TOKEN }, noFile);
  assert.equal(DEFAULT_URL, "http://localhost:8090");
  assert.equal(config.baseUrl, DEFAULT_URL);
  assert.deepEqual(errors, []);
  assert.equal(config.tokenSource, "env");
});

test("config reads the token from the default token file, and warns on loose file modes", () => {
  let readPath = null;
  const io = { home: "/home/fake", platform: "linux", readFile: (p) => ((readPath = p), FAKE_TOKEN + "\n"), stat: () => ({ mode: 0o644 }) };
  const { config, warnings, errors } = readConfig({}, io);
  assert.equal(readPath, "/home/fake/.config/fibershare/chirpstack-token");
  assert.equal(config.token, FAKE_TOKEN);
  assert.equal(config.tokenSource, "file");
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings.join(" ").includes(FAKE_TOKEN));
});

test("config errors without a token, or with half a Cloudflare Access pair", () => {
  assert.equal(readConfig({}, noFile).errors.length, 1);
  const half = readConfig({ CHIRPSTACK_API_TOKEN: FAKE_TOKEN, CF_ACCESS_CLIENT_ID: "fake-id" }, noFile);
  assert.equal(half.errors.length, 1);
  const remote = readConfig({ CHIRPSTACK_API_TOKEN: FAKE_TOKEN, CHIRPSTACK_URL: "http://example.invalid:8090" }, noFile);
  assert.equal(remote.warnings.length, 1);
});

test("requests carry the gRPC gateway bearer header and optional Access headers", () => {
  const plain = buildHeaders(baseConfig);
  assert.equal(plain["Grpc-Metadata-Authorization"], "Bearer " + FAKE_TOKEN);
  assert.equal(plain["CF-Access-Client-Id"], undefined);
  const access = buildHeaders({ ...baseConfig, accessId: "fake-id", accessSecret: "fake-secret" });
  assert.equal(access["CF-Access-Client-Id"], "fake-id");
  assert.equal(access["CF-Access-Client-Secret"], "fake-secret");
});

test("pullRaw walks tenants, applications, devices, and link metrics with camelCase query names", async () => {
  const calls = [];
  const raw = await pullRaw(baseConfig, { fetchImpl: fakeFetch({ calls, pageSize: 3 }), now: new Date(NOW) });
  assert.equal(raw.applicationCount, applications.result.length);
  assert.equal(raw.devices.length, 8);
  assert.equal(Object.keys(raw.linkMetrics).length, 8);
  const deviceCalls = calls.filter((c) => c.url.pathname === "/api/devices");
  assert.ok(deviceCalls.every((c) => c.url.searchParams.get("applicationId") && c.url.searchParams.get("limit")));
  assert.ok(deviceCalls.length >= 4, "pages through results");
  const metricCall = calls.find((c) => c.url.pathname.endsWith("/link-metrics"));
  assert.equal(metricCall.url.searchParams.get("aggregation"), "HOUR");
  assert.ok(metricCall.url.searchParams.get("start") && metricCall.url.searchParams.get("end"));
});

test("a wrong token gives a clear error that never holds the token", async () => {
  await assert.rejects(pullRaw({ ...baseConfig, token: "wrong-" + FAKE_TOKEN }, { fetchImpl: fakeFetch() }), (error) => {
    assert.match(error.message, /gRPC code 16/);
    assert.ok(!error.message.includes(FAKE_TOKEN));
    return true;
  });
  assert.equal(redact("x " + FAKE_TOKEN + " y", baseConfig), "x [hidden] y");
});

test("full live data passes through names, DevEUIs, tags, positions, and sensors", async () => {
  const raw = await pullFixture({ uplinks: [1, 2].map((n) => parseUplinkEvent(uplinkEvent(n).topic, JSON.stringify(uplinkEvent(n, { sos: n === 2 }).payload))) });
  const { data } = toLiveData(raw);
  assert.ok(isLiveData(data));
  assert.equal(data.hidden, false);
  const one = data.animals.find((a) => a.details.devEui === fakeEui(1));
  assert.equal(one.name, "Fake collar 1");
  assert.equal(one.details.description, "Fake note about collar one");
  assert.deepEqual(one.details.tags, { herd: "fake-herd-north" });
  assert.equal(one.details.position.latitude, fakePosition(1).latitude);
  assert.equal(one.sensors.temperature, 21.5);
  assert.equal(one.sensors.light, 312);
  assert.equal(one.sensors.motion, 2);
  assert.equal(one.sensors.sos, undefined, "no SOS reading in this uplink");
  assert.ok(data.events.some((e) => e.type === "sos" && e.severity === "alert"));
  assert.equal(summarize(data).withPosition, 2);
});

test("hidden live data has no names, DevEUIs, tags, descriptions, or positions", async () => {
  const raw = await pullFixture({ uplinks: [1, 3].map((n) => parseUplinkEvent(uplinkEvent(n).topic, JSON.stringify(uplinkEvent(n).payload))) });
  const { data: full } = toLiveData(raw);
  const hidden = hideTrackerDetails(full);
  assert.ok(isLiveData(hidden));
  assert.equal(hidden.hidden, true);
  const text = JSON.stringify(hidden);
  for (const device of allDevices) {
    assert.ok(!text.toLowerCase().includes(device.devEui), "no DevEUI");
    assert.ok(!text.includes(device.name), "no device name");
  }
  for (const word of ["fake-herd-north", "fake-blue", "Fake note", "Fake tracker profile", "latitude", "\"details\"", "\"tags\"", String(fakePosition(1).latitude)]) {
    assert.ok(!text.includes(word), "hidden export leaked " + word);
  }
  assert.deepEqual(leakProblems(hidden, full), []);
  assert.deepEqual(hiddenExportProblems(hidden, full), []);
  assert.ok(hidden.animals.every((a) => a.name === a.alias && /^Tracker \d+$/.test(a.alias)));
  assert.ok(hidden.animals.every((a) => a.signal === null || ["good", "fair", "weak"].includes(a.signal)));
  assert.equal(hidden.animals.find((a) => a.sensors)?.sensors.temperature, 21.5);
});

test("the leak check catches a real value left in a hidden export", async () => {
  const { data: full } = toLiveData(await pullFixture());
  const hidden = hideTrackerDetails(full);
  hidden.note = "about " + full.animals[0].details.deviceName;
  assert.ok(leakProblems(hidden, full).includes("device name"));
  hidden.note = "id " + full.animals[0].details.devEui;
  assert.ok(hiddenExportProblems(hidden, full).length > 0);
});

test("grid cells are stable, in bounds, and aliases survive a new tracker", () => {
  for (let n = 1; n <= 50; n += 1) {
    const a = gridPosition(fakeEui(n));
    assert.deepEqual(a, gridPosition(fakeEui(n).toUpperCase()));
    assert.ok(a.x > 0 && a.x < 100 && a.y > 0 && a.y < 100);
  }
  const first = assignAliases([fakeEui(1), fakeEui(2)]);
  const later = assignAliases([fakeEui(9), fakeEui(1), fakeEui(2)], first);
  assert.equal(later[deviceKey(fakeEui(1))], first[deviceKey(fakeEui(1))]);
  assert.equal(later[deviceKey(fakeEui(9))], 3);
});

test("battery, status, and signal follow the ChirpStack values", async () => {
  const { data } = toLiveData(await pullFixture());
  const by = (n) => data.animals.find((a) => a.details.devEui === fakeEui(n));
  assert.equal(by(2).battery, 12);
  assert.equal(by(3).battery, null, "-1 means no reading");
  assert.equal(by(6).battery, null, "null deviceStatus");
  assert.equal(by(5).externalPower, true);
  assert.equal(by(4).status, "stale");
  assert.equal(by(7).status, "never seen");
  assert.equal(by(1).status, "online");
  assert.equal(by(1).signal, "good");
  assert.equal(by(2).signal, "weak");
  assert.equal(by(3).signal, "fair");
  assert.equal(by(1).uplinks24h, 5);
  assert.ok(data.events.some((e) => e.type === "battery" && e.severity === "alert"));
  assert.equal(signalBucket({}), null);
});

test("decodeObject reads plain keys and reading lists, and ignores a 0,0 fix", () => {
  assert.deepEqual(decodeObject({ latitude: 0, longitude: 0, temperature: 3.14159 }), { temperature: 3.1 });
  const plain = decodeObject({ data: { lat: 10.5, lng: 20.25, light: 9, sos: true, motionSegmentNumber: 4 } });
  assert.deepEqual(plain, { latitude: 10.5, longitude: 20.25, light: 9, motion: 4, sos: true });
  const listed = decodeObject(uplinkEvent(4).payload.object);
  assert.equal(listed.latitude, fakePosition(4).latitude);
  assert.equal(listed.battery, 77);
  assert.deepEqual(decodeObject(null), {});
});

test("MQTT uplink events keep the device and decoded object, not the radio receivers", () => {
  const { topic, payload } = uplinkEvent(5);
  const event = parseUplinkEvent(topic, Buffer.from(JSON.stringify(payload)));
  assert.equal(event.devEui, fakeEui(5));
  assert.equal(event.rssi, -95);
  assert.equal(event.snr, 4.5);
  assert.ok(!JSON.stringify(event).includes("fake-receiver"));
  assert.ok(!("rxInfo" in event));
  assert.equal(parseUplinkEvent("application/x/device/y/event/join", "{}"), null);
  assert.equal(parseUplinkEvent(topic, "not json"), null);
  assert.deepEqual(uplinkTopics(), ["application/+/device/+/event/up"]);
});

test("MQTT packets round trip", () => {
  const connect = readPackets(connectPacket({ clientId: "fake", username: "u", password: "p" })).packets[0];
  assert.equal(connect.type, 1);
  assert.equal(connect.body[7], 0xc2);
  const sub = readPackets(subscribePacket(1, uplinkTopics())).packets[0];
  assert.equal(sub.type, 8);
  assert.equal(sub.flags, 2);
  const topic = Buffer.from("application/a/device/b/event/up");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(topic.length);
  const body = Buffer.concat([len, topic, Buffer.from("{}")]);
  const big = Buffer.concat([Buffer.from([0x30, body.length]), body, Buffer.from([0x30])]);
  const { packets, rest } = readPackets(big);
  assert.equal(packets.length, 1);
  assert.equal(rest.length, 1);
  assert.equal(parsePublish(packets[0].flags, packets[0].body).payload.toString(), "{}");
});

function publishPacket(topic, payload) {
  const t = Buffer.from(topic);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(t.length);
  const body = Buffer.concat([len, t, Buffer.from(payload)]);
  const sizes = [];
  let n = body.length;
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    sizes.push(b);
  } while (n);
  return Buffer.concat([Buffer.from([0x30, ...sizes]), body]);
}

test("collectUplinks logs in, subscribes, and gathers uplinks from a local fake broker", async () => {
  let login = null;
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      for (const p of readPackets(chunk).packets) {
        if (p.type === 1) {
          login = p.body.subarray(10).toString();
          socket.write(Buffer.from([0x20, 2, 0, 0]));
        } else if (p.type === 8) {
          socket.write(Buffer.from([0x90, 3, 0, 1, 0]));
          for (const n of [1, 2]) {
            const { topic, payload } = uplinkEvent(n);
            socket.write(publishPacket(topic, JSON.stringify(payload)));
          }
        }
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const events = await collectUplinks({ host: "127.0.0.1", port, username: "fake-user", password: "fake-pass" }, { seconds: 0.3 });
    assert.equal(events.length, 2);
    assert.ok(login.includes("fake-user"));
  } finally {
    server.close();
  }
});

test("the hide setting defaults on, follows FIBERSHARE_HIDE_TRACKERS, and --hide wins", () => {
  assert.equal(parseArgs([], {}).hide, true);
  assert.equal(parseArgs([], { FIBERSHARE_HIDE_TRACKERS: "0" }).hide, false);
  assert.equal(parseArgs(["--hide"], { FIBERSHARE_HIDE_TRACKERS: "0" }).hide, true);
  assert.equal(parseArgs(["--no-hide"], {}).hide, false);
  assert.throws(() => parseArgs(["--bogus"], {}));
});

test("npm run chirpstack:pull writes a hidden file by default and prints counts only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fibershare-pull-"));
  const out = join(dir, "live.json");
  const logs = [];
  const original = { fetch: globalThis.fetch, log: console.log, warn: console.warn, error: console.error };
  globalThis.fetch = fakeFetch();
  console.log = console.warn = console.error = (...args) => logs.push(args.join(" "));
  try {
    const env = { CHIRPSTACK_API_TOKEN: FAKE_TOKEN };
    assert.equal(await main(["--out=" + out], env), 0);
    const hidden = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(hidden.hidden, true);
    assert.equal(hidden.animals.length, 8);
    assert.ok(!JSON.stringify(hidden).includes(fakeEui(1)));
    const aliases = JSON.parse(readFileSync(join(dir, "aliases.json"), "utf8"));
    assert.equal(Object.keys(aliases).length, 8);

    assert.equal(await main(["--out=" + out], { ...env, FIBERSHARE_HIDE_TRACKERS: "0" }), 0);
    const full = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(full.hidden, false);
    assert.ok(JSON.stringify(full).includes(fakeEui(1)));
    if (process.platform !== "win32") assert.equal(statSync(out).mode & 0o077, 0, "full export is private to the owner");

    writeFileSync(join(dir, "aliases.json"), "not json");
    assert.equal(await main(["--out=" + out, "--dry-run"], env), 0);
  } finally {
    Object.assign(console, { log: original.log, warn: original.warn, error: original.error });
    globalThis.fetch = original.fetch;
    rmSync(dir, { recursive: true, force: true });
  }
  const printed = logs.join("\n");
  assert.ok(!printed.includes(FAKE_TOKEN));
  for (const device of allDevices) {
    assert.ok(!printed.includes(device.devEui) && !printed.includes(device.name));
  }
  assert.match(printed, /8 tracker\(s\)/);
});

test("npm run chirpstack:pull -- --push sends both files to a Pages copy, which stores them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fibershare-push-"));
  const out = join(dir, "live.json");
  const pushToken = "fake-push-token-" + "q".repeat(24);
  const stored = new Map();
  const kv = { get: async (k) => stored.get(k) ?? null, put: async (k, v) => stored.set(k, v) };
  const logs = [];
  const original = { fetch: globalThis.fetch, log: console.log, warn: console.warn, error: console.error };
  const chirpstack = fakeFetch();
  globalThis.fetch = async (url, init) =>
    String(url).startsWith("https://copy.example/api/push")
      ? postPush({ request: new Request(url, init), env: { FIBERSHARE_LIVE: kv, PUSH_TOKEN: pushToken } })
      : chirpstack(url, init);
  console.log = console.warn = console.error = (...args) => logs.push(args.join(" "));
  try {
    const env = { CHIRPSTACK_API_TOKEN: FAKE_TOKEN, FIBERSHARE_HIDE_TRACKERS: "0", FIBERSHARE_PUSH_URL: "https://copy.example/api/push" };
    assert.equal(await main(["--out=" + out, "--push"], env), 1, "no push token: stops before pulling");
    assert.equal(stored.size, 0);
    assert.equal(await main(["--out=" + out, "--push"], { ...env, FIBERSHARE_PUSH_TOKEN: "wrong-token-" + "w".repeat(24) }), 1);
    assert.equal(await main(["--out=" + out, "--push"], { ...env, FIBERSHARE_PUSH_TOKEN: pushToken }), 0);
    assert.equal(JSON.parse(stored.get(KV_HIDDEN)).hidden, true);
    assert.equal(JSON.parse(stored.get(KV_FULL)).hidden, false);
    assert.ok(!stored.get(KV_HIDDEN).includes(fakeEui(1)));
  } finally {
    Object.assign(console, { log: original.log, warn: original.warn, error: original.error });
    globalThis.fetch = original.fetch;
    rmSync(dir, { recursive: true, force: true });
  }
  const printed = logs.join("\n");
  assert.ok(!printed.includes(pushToken) && !printed.includes(FAKE_TOKEN));
  assert.match(printed, /pushed 8 tracker\(s\)/);
});
