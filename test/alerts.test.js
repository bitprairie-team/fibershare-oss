import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { ALERT_RULES } from "../src/alert-config.js";
import { computeAlerts, eventAlerts, normalizeFeedback, splitAlerts, trackerAlerts } from "../src/alerts.js";
import { alertScope, createAlertStore, STORE_KEYS } from "../src/alert-store.js";
import { heardBy, sortEvents, stateAt } from "../src/herd-state.js";
import { JOBS, PLANNED } from "../src/loops.js";
import { clearCertCache } from "../server/access-jwt.js";
import { FEEDBACK_LIMIT, KV_FEEDBACK } from "../server/alert-feedback.js";
import { createLocalApi } from "../server/local-api.js";
import { hashPassphrase, writeRecord } from "../server/local-auth.js";
import { getAlerts, postAlerts } from "../server/pages.js";
import { onRequestGet as healthGet } from "../functions/api/health.js";
import * as alertsFunction from "../functions/api/alerts.js";

const herd = JSON.parse(readFileSync(new URL("../public/data/herd.json", import.meta.url)));
const day = JSON.parse(readFileSync(new URL("../public/data/events.json", import.meta.url)));
const SAMPLE_END = "2026-09-06T18:05:00";

function sampleAt(count) {
  const events = sortEvents(day.events);
  const shown = events.slice(0, count);
  const now = count >= events.length ? SAMPLE_END : shown[shown.length - 1]?.time || events[0].time;
  const state = stateAt(herd.goats, events, count, { uplinksStart: herd.uplinksStart, now });
  return computeAlerts({ animals: state.animals, events: state.shown, now });
}

// ---- rules ------------------------------------------------------------------

test("alert config: below 20% battery and over 2 hours quiet", () => {
  assert.equal(ALERT_RULES.lowBatteryPercent, 20);
  assert.equal(ALERT_RULES.quietMinutes, 120);
});

test("battery rule: below the threshold opens an alert, outside power or no reading does not", () => {
  const now = "2026-09-06T12:00:00";
  const base = { lastSeen: "2026-09-06T11:50:00" };
  const ids = (animals) => trackerAlerts(animals, now).map((a) => a.id);
  assert.deepEqual(ids([{ id: "a", name: "A", battery: 19, ...base }]), ["battery:a"]);
  assert.deepEqual(ids([{ id: "a", name: "A", battery: 20, ...base }]), [], "20% is not below 20%");
  assert.deepEqual(ids([{ id: "a", name: "A", battery: 5, externalPower: true, ...base }]), []);
  assert.deepEqual(ids([{ id: "a", name: "A", battery: null, ...base }]), []);
  assert.deepEqual(ids([{ id: "a", name: "A", battery: 10, ...base }]), ids([{ id: "a", name: "A", battery: 10, ...base }]), "ids are stable");
});

test("quiet rule: over 2 hours opens an alert, a new uplink starts a new one, never seen counts", () => {
  const animal = (lastSeen, extra = {}) => [{ id: "t1", name: "Tracker 1", battery: 80, lastSeen, ...extra }];
  assert.equal(trackerAlerts(animal("2026-09-06T10:00:00"), "2026-09-06T12:00:00").length, 0, "exactly 2 hours is not over");
  const [quiet] = trackerAlerts(animal("2026-09-06T10:00:00"), "2026-09-06T12:01:00");
  assert.equal(quiet.kind, "quiet");
  assert.equal(quiet.id, "quiet:t1:2026-09-06T10:00:00");
  assert.match(quiet.title, /no check-in for 2 hours 1 min/);
  const [later] = trackerAlerts(animal("2026-09-06T13:00:00"), "2026-09-06T15:30:00");
  assert.notEqual(later.id, quiet.id, "a new quiet spell is a new alert");
  assert.equal(trackerAlerts(animal(null), "2026-09-06T12:00:00").length, 0, "no reading yet is not quiet");
  assert.equal(trackerAlerts(animal(null, { status: "never seen" }), "2026-09-06T12:00:00")[0].id, "quiet:t1:never");
  assert.match(trackerAlerts(animal("2026-09-01T10:00:00"), "2026-09-06T12:00:00")[0].title, /no check-in for 5 days$/);
  // Live data uses UTC times.
  assert.equal(trackerAlerts(animal("2026-09-06T10:00:00Z"), "2026-09-06T12:30:00Z").length, 1);
});

test("SOS, Predator Watch and Wildfire Watch alerts; a cleared event stays until answered", () => {
  const sos = trackerAlerts([{ id: "t2", name: "Tracker 2", lastSeen: "2026-09-06T12:00:00Z", sensors: { sos: true } }], "2026-09-06T12:05:00Z");
  assert.equal(sos[0].kind, "sos");
  const events = [
    { id: "p1", type: "predator", cell: "A1", time: "2026-09-06T16:40:00", text: "coyote" },
    { id: "p2", type: "predator-clear", cell: "A1", time: "2026-09-06T17:25:00" },
    { id: "s1", type: "smoke", time: "2026-09-06T12:30:00", text: "haze" },
  ];
  const out = eventAlerts(events);
  assert.deepEqual(out.map((a) => [a.id, a.kind, a.cleared]), [["event:p1", "predator", true], ["event:s1", "smoke", false]]);
  assert.deepEqual(out.map((a) => a.title), ["Predator Watch reported activity near A1", "Wildfire Watch reported smoke upwind"]);
});

test("sample day: the alerts follow the story, from the hourly check-ins", () => {
  const events = sortEvents(day.events);
  assert.equal(events.length, 28);
  // Morning: every tracker heard within the hour, so nothing is quiet.
  assert.deepEqual(sampleAt(9).map((a) => a.id), [], "07:45 has no alert; Hazel is at 22%");
  // 09:20: Pippin has been quiet since 07:00.
  const at920 = sampleAt(10);
  assert.deepEqual(at920.map((a) => a.kind + ":" + a.animalId), ["quiet:pippin"]);
  // 10:05: Pippin is back.
  assert.deepEqual(sampleAt(11), []);
  // Smoke and predator moments.
  assert.ok(sampleAt(12).some((a) => a.kind === "smoke"));
  assert.ok(sampleAt(14).some((a) => a.kind === "predator" && !a.cleared));
  // End of day: smoke and predator (both cleared, not yet answered),
  // Willow quiet since 14:40, Hazel below 20%.
  const end = sampleAt(events.length);
  assert.deepEqual(end.map((a) => a.kind + ":" + (a.animalId || "")), ["predator:", "smoke:", "quiet:willow", "battery:hazel"]);
  assert.match(end.find((a) => a.kind === "quiet").title, /^Willow: no check-in for 3 hours 25 min/);
});

test("heardBy spreads hourly uplinks and ignores the future", () => {
  const start = "2026-09-06T06:00:00";
  assert.equal(heardBy([2, 0], start, "2026-09-06T06:30:00"), "2026-09-06T06:20:00");
  assert.equal(heardBy([2, 0], start, "2026-09-06T09:00:00"), "2026-09-06T06:40:00");
  assert.equal(heardBy([0, 0], start, "2026-09-06T09:00:00"), null);
  assert.equal(heardBy(null, start, "2026-09-06T09:00:00"), null);
});

// ---- answers ----------------------------------------------------------------

const ANSWER = { alertId: "battery:hazel", kind: "battery", answer: "confirmed", note: "Swapping it\ttonight", title: "Hazel: battery at 19%", animalId: "hazel", alertTime: "2026-09-06T17:55:00" };

test("normalizeFeedback keeps known fields, adds the rule, and rejects bad input", () => {
  const { ok, entry } = normalizeFeedback({ ...ANSWER, extra: "dropped" }, { now: "2026-10-31T20:00:00.000Z", source: "demo" });
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(entry).sort(), ["alertId", "alertTime", "animalId", "answer", "at", "kind", "note", "rule", "source", "title", "type"]);
  assert.equal(entry.type, "alert-feedback");
  assert.equal(entry.note, "Swapping it tonight");
  assert.deepEqual(entry.rule, { lowBatteryPercent: 20 });
  assert.equal(normalizeFeedback({ ...ANSWER, alertId: "bad id" }).ok, false);
  assert.equal(normalizeFeedback({ ...ANSWER, answer: "maybe" }).ok, false);
  assert.equal(normalizeFeedback({ ...ANSWER, kind: "weather" }).ok, false);
  assert.equal(normalizeFeedback({ ...ANSWER, note: "x".repeat(1000) }).ok, false);
  assert.equal(normalizeFeedback({ ...ANSWER, note: "x".repeat(400) }).entry.note.length, ALERT_RULES.noteMaxLength);
  assert.equal(normalizeFeedback(null).ok, false);
});

test("splitAlerts: answered alerts move to history, the newest answer wins, reopen brings it back", () => {
  const alerts = [{ id: "battery:hazel" }, { id: "quiet:willow:x" }];
  const at = (t) => "2026-10-31T20:0" + t + ":00.000Z";
  let feedback = [{ ...ANSWER, at: at(1) }];
  let { open, history } = splitAlerts(alerts, feedback);
  assert.deepEqual(open.map((a) => a.id), ["quiet:willow:x"]);
  assert.deepEqual(history.map((f) => f.alertId), ["battery:hazel"]);
  feedback = [...feedback, { ...ANSWER, answer: "reopened", at: at(2) }];
  ({ open, history } = splitAlerts(alerts, feedback));
  assert.equal(open.length, 2);
  assert.equal(history.length, 0);
  feedback = [...feedback, { ...ANSWER, answer: "dismissed", at: at(3) }, { alertId: "event:gone", kind: "smoke", answer: "dismissed", at: at(4) }];
  ({ open, history } = splitAlerts(alerts, feedback));
  assert.deepEqual(history.map((f) => f.alertId + ":" + f.answer), ["event:gone:dismissed", "battery:hazel:dismissed"], "history keeps alerts that are no longer active");
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

test("alert store: sample and public answers stay in this browser under separate keys", async () => {
  assert.equal(alertScope({ mode: "sample" }), "demo");
  assert.equal(alertScope({ mode: "live", rancher: false }), "public");
  assert.equal(alertScope({ mode: "live", rancher: true }), "rancher");
  const storage = memoryStorage();
  const demo = createAlertStore("demo", { storage });
  assert.deepEqual(await demo.load(), []);
  await demo.add(ANSWER);
  await demo.add({ ...ANSWER, answer: "dismissed" });
  // A new store on the same storage is a page reload.
  const reloaded = await createAlertStore("demo", { storage }).load();
  assert.deepEqual(reloaded.map((f) => f.answer), ["confirmed", "dismissed"]);
  assert.equal(reloaded[0].source, "demo");
  assert.ok(STORE_KEYS.demo.startsWith("fs-") && STORE_KEYS.public.startsWith("fs-"), "Reset demo clears both");
  const pub = createAlertStore("public", { storage });
  assert.deepEqual(await pub.load(), []);
  await pub.add(ANSWER);
  assert.equal(JSON.parse(storage.getItem(STORE_KEYS.public))[0].source, "public");
  await assert.rejects(() => demo.add({ ...ANSWER, answer: "nope" }));
  storage.setItem(STORE_KEYS.demo, "not json");
  assert.deepEqual(await demo.load(), [], "a broken entry is ignored");
});

test("alert store: a signed-in rancher's answers go to /api/alerts", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.method, init.body && JSON.parse(init.body).answer]);
    return new Response(JSON.stringify({ feedback: [{ ...ANSWER, at: "x" }] }), { status: 200 });
  };
  const store = createAlertStore("rancher", { fetchImpl });
  assert.equal((await store.load()).length, 1);
  await store.add(ANSWER);
  assert.deepEqual(calls, [["/api/alerts", "GET", undefined], ["/api/alerts", "POST", "confirmed"]]);
  const out = createAlertStore("rancher", { fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => out.load(), /Sign in again/);
});

// ---- local server -----------------------------------------------------------

const PASS = "fake passphrase for tests";

async function call(api, { method = "GET", url, cookie, body, origin, host = "127.0.0.1:5173" }) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = { host, ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
  req.socket = { remoteAddress: "127.0.0.1" };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; } };
  const done = new Promise((resolve) => {
    res.end = (text) => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
  });
  const ran = api(req, res, () => {});
  req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  await ran;
  return done;
}

test("local /api/alerts: rancher only, same site only, checked, and saved in the private folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fs-alerts-"));
  try {
    const rancherFile = join(dir, "rancher.json");
    const alertsFile = join(dir, "alert-feedback.json");
    writeRecord(rancherFile, hashPassphrase(PASS));
    writeFileSync(join(dir, "live.json"), "{}");
    const api = createLocalApi({ liveFile: join(dir, "live.json"), rancherFile, alertsFile, now: () => Date.parse("2026-10-31T20:00:00Z") });

    assert.equal((await call(api, { url: "/api/alerts" })).status, 401, "GET needs sign-in");
    assert.equal((await call(api, { method: "POST", url: "/api/alerts", body: ANSWER })).status, 401, "POST needs sign-in");
    assert.equal((await call(api, { url: "/api/alerts", cookie: "fs_session=v1.99999999999999.abc.def" })).status, 401, "a forged cookie fails");
    assert.equal(existsSync(alertsFile), false, "nothing written without sign-in");

    const login = await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];

    assert.equal((await call(api, { method: "POST", url: "/api/alerts", cookie, body: ANSWER, origin: "https://elsewhere.example" })).status, 403);
    assert.equal((await call(api, { method: "POST", url: "/api/alerts", cookie, body: "not json" })).status, 400);
    assert.equal((await call(api, { method: "POST", url: "/api/alerts", cookie, body: { ...ANSWER, answer: "maybe" } })).status, 400);
    assert.equal((await call(api, { method: "POST", url: "/api/alerts", cookie, body: "x".repeat(5000) })).status, 413);
    assert.equal((await call(api, { method: "DELETE", url: "/api/alerts", cookie })).status, 405);

    const saved = await call(api, { method: "POST", url: "/api/alerts", cookie, body: ANSWER, origin: "http://127.0.0.1:5173" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.entry.source, "rancher");
    assert.equal(saved.body.entry.at, "2026-10-31T20:00:00.000Z");
    assert.equal(statSync(alertsFile).mode & 0o077, 0, "the answers file is owner-only");
    await Promise.all([call(api, { method: "POST", url: "/api/alerts", cookie, body: { ...ANSWER, answer: "reopened" } }), call(api, { method: "POST", url: "/api/alerts", cookie, body: { ...ANSWER, alertId: "quiet:willow:x", kind: "quiet", answer: "dismissed" } })]);
    const list = await call(api, { url: "/api/alerts", cookie });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.feedback.map((f) => f.answer).sort(), ["confirmed", "dismissed", "reopened"], "quick answers do not overwrite each other");
    assert.equal(JSON.parse(readFileSync(alertsFile, "utf8")).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Pages ------------------------------------------------------------------

const TEAM = "fake-team.example";
const AUD = "fake-aud-tag";
const KID = "fake-kid-alerts";
const NOW_MS = Date.parse("2026-10-31T20:00:00Z");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwt() {
  const s = Math.floor(NOW_MS / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = enc({ alg: "RS256", kid: KID, typ: "JWT" });
  const body = enc({ aud: [AUD], iss: "https://" + TEAM, sub: "fake-user", iat: s, nbf: s - 5, exp: s + 3600 });
  const signer = createSign("RSA-SHA256");
  signer.update(head + "." + body);
  return head + "." + body + "." + signer.sign(privateKey).toString("base64url");
}

const fetchImpl = async () => new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] }));

function kv() {
  const data = new Map();
  return { data, async get(k) { return data.has(k) ? data.get(k) : null; }, async put(k, v) { data.set(k, v); } };
}

function request(method, { token, body, origin } = {}) {
  const headers = { ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}), ...(origin ? { Origin: origin } : {}) };
  return new Request("https://copy.example/api/alerts", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("Pages /api/alerts: needs a valid Access token, a store, and this site", async () => {
  clearCertCache();
  const store = kv();
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, FIBERSHARE_LIVE: store };
  const deps = { fetchImpl, now: NOW_MS };
  assert.equal((await getAlerts({ request: request("GET"), env }, deps)).status, 401);
  assert.equal((await postAlerts({ request: request("POST", { body: ANSWER }), env }, deps)).status, 401);
  assert.equal((await postAlerts({ request: request("POST", { token: "garbage", body: ANSWER }), env }, deps)).status, 401);
  assert.equal((await getAlerts({ request: request("GET", { token: jwt() }), env: { FIBERSHARE_LIVE: store } }, deps)).status, 401, "no Access setup, no answers");
  assert.equal(store.data.size, 0);
  const noStore = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  assert.equal((await getAlerts({ request: request("GET", { token: jwt() }), env: noStore }, deps)).status, 503);
  assert.equal((await postAlerts({ request: request("POST", { token: jwt(), body: ANSWER, origin: "https://elsewhere.example" }), env }, deps)).status, 403);
  assert.equal((await postAlerts({ request: request("POST", { token: jwt(), body: { ...ANSWER, kind: "x" } }), env }, deps)).status, 400);

  const saved = await postAlerts({ request: request("POST", { token: jwt(), body: ANSWER, origin: "https://copy.example" }), env }, deps);
  assert.equal(saved.status, 200);
  assert.equal(JSON.parse(store.data.get(KV_FEEDBACK)).length, 1);
  const list = await (await getAlerts({ request: request("GET", { token: jwt() }), env }, deps)).json();
  assert.equal(list.feedback[0].alertId, "battery:hazel");
  assert.equal(list.feedback[0].source, "rancher");
  assert.equal(typeof alertsFunction.onRequestGet, "function");
  assert.equal(typeof alertsFunction.onRequestPost, "function");
  assert.ok(FEEDBACK_LIMIT >= 1000);
});

test("/api/health says whether a store is bound", async () => {
  assert.equal((await (await healthGet({ env: {} })).json()).store, false);
  assert.equal((await (await healthGet({ env: { FIBERSHARE_LIVE: {} } })).json()).store, true);
});

// ---- the automated jobs -----------------------------------------------------

test("jobs: each is named by the work it does, with the real thresholds", () => {
  assert.deepEqual(
    JOBS.map((j) => j.id),
    ["battery", "quiet", "sos", "predator", "smoke", "trace"]
  );
  for (const job of JOBS) {
    assert.match(job.name, /^[A-Z][a-z]+s /, job.id + " starts with a verb");
    assert.ok(!/[.:!]$/.test(job.name), job.id + " name is not a sentence");
    assert.ok(job.name.split(" ").length <= 9, job.id + " name is short");
    assert.ok(job.detail.length < 90, job.id + " detail is short");
  }
  assert.equal(JOBS[0].name, "Flags tracker batteries below " + ALERT_RULES.lowBatteryPercent + "%");
  assert.equal(JOBS[1].name, "Flags trackers that stop reporting");
  assert.match(JOBS[1].detail, new RegExp(ALERT_RULES.quietMinutes / 60 + " hours"));
  assert.ok(PLANNED.length >= 1 && PLANNED.every((p) => /^[a-z]/.test(p)), "planned items read inside one sentence");
});
