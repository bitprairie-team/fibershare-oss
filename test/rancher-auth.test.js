import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { hideTrackerDetails } from "../src/live-format.js";
import { accessToken, clearCertCache, verifyAccessJwt } from "../server/access-jwt.js";
import { createLocalApi } from "../server/local-api.js";
import { checkSession, hashPassphrase, makeSession, verifyPassphrase, writeRecord } from "../server/local-auth.js";
import { liveBody } from "../server/live-response.js";
import { getLive, getLogin, getSession, KV_FULL, KV_HIDDEN, postPush, sameSecret } from "../server/pages.js";
import { fakeFullLive } from "./fixtures/live.js";

const PASS = "fake passphrase for tests";
const ARCGIS = "fake-arcgis-key";

function isHidden(live) {
  const text = JSON.stringify(live);
  return live.hidden === true && !text.includes('"details"') && !text.includes("latitude") && live.animals.every((a) => a.name === a.alias);
}

function isFull(live) {
  return live.hidden === false && live.animals.some((a) => a.details?.devEui) && live.animals.some((a) => a.details?.position);
}

// ---- local mode -------------------------------------------------------------

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fs-rancher-"));
  return { dir, liveFile: join(dir, "live.json"), rancherFile: join(dir, "rancher.json"), done: () => rmSync(dir, { recursive: true, force: true }) };
}

async function call(api, { method = "GET", url, cookie, body, origin, host = "127.0.0.1:5173", ip = "127.0.0.1" }) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = { host, ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
  req.socket = { remoteAddress: ip };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; } };
  const done = new Promise((resolve) => {
    res.end = (text) => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
  });
  let nextCalled = false;
  const ran = api(req, res, () => { nextCalled = true; });
  req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  await ran;
  if (nextCalled) return { next: true };
  return done;
}

function cookieFrom(response) {
  return String(response.headers["set-cookie"]).split(";")[0];
}

test("passphrase hash and session cookie: good, wrong, tampered, expired", () => {
  const record = hashPassphrase(PASS);
  assert.ok(!JSON.stringify(record).includes(PASS), "the record never holds the passphrase");
  assert.equal(verifyPassphrase(PASS, record), true);
  assert.equal(verifyPassphrase(PASS + "x", record), false);
  assert.throws(() => hashPassphrase("short"));
  const now = Date.parse("2026-09-06T18:00:00Z");
  const value = makeSession(record.sessionSecret, { now });
  assert.equal(checkSession(value, record.sessionSecret, { now: now + 1000 }), true);
  assert.equal(checkSession(value, record.sessionSecret, { now: now + 13 * 3600 * 1000 }), false, "expired after 12 hours");
  assert.equal(checkSession(value.slice(0, -2) + "xx", record.sessionSecret, { now }), false, "tampered");
  assert.equal(checkSession(value, hashPassphrase(PASS).sessionSecret, { now }), false, "a new passphrase signs everyone out");
  const [, , nonce, sig] = value.split(".");
  assert.equal(checkSession(["v1", String(now + 99e9), nonce, sig].join("."), record.sessionSecret, { now }), false, "cannot extend expiry");
});

test("local /api/live: the public gets hidden data, a signed-in rancher gets full data", async () => {
  const t = setup();
  try {
    const full = await fakeFullLive();
    writeFileSync(t.liveFile, JSON.stringify(full));
    writeRecord(t.rancherFile, hashPassphrase(PASS));
    assert.equal(statSync(t.rancherFile).mode & 0o077, 0, "passphrase file is owner-only");
    let clock = Date.parse("2026-09-06T18:00:00Z");
    const api = createLocalApi({ liveFile: t.liveFile, rancherFile: t.rancherFile, env: { ARCGIS_API_KEY: ARCGIS }, now: () => clock });

    const pub = await call(api, { url: "/api/live" });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.view, "public");
    assert.ok(isHidden(pub.body.live));
    assert.equal(pub.body.arcgisApiKey, undefined, "no key for the public");
    assert.match(pub.headers["cache-control"], /no-store/);

    const bad = await call(api, { method: "POST", url: "/api/session", body: { passphrase: "wrong passphrase here" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers["set-cookie"], undefined);

    const forged = await call(api, { url: "/api/live", cookie: "fs_session=v1.99999999999999.abc.def" });
    assert.equal(forged.body.view, "public");
    assert.ok(isHidden(forged.body.live));

    const good = await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS } });
    assert.equal(good.status, 200);
    const setCookie = good.headers["set-cookie"];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Path=\//);
    const cookie = cookieFrom(good);

    const session = await call(api, { url: "/api/session", cookie });
    assert.deepEqual(session.body, { mode: "local", signedIn: true, passphraseSet: true });

    const rancher = await call(api, { url: "/api/live", cookie });
    assert.equal(rancher.body.view, "rancher");
    assert.ok(isFull(rancher.body.live));
    assert.equal(rancher.body.arcgisApiKey, ARCGIS);

    clock += 13 * 3600 * 1000;
    const expired = await call(api, { url: "/api/live", cookie });
    assert.equal(expired.body.view, "public", "an expired session gets hidden data");
    assert.ok(isHidden(expired.body.live));

    const out = await call(api, { method: "DELETE", url: "/api/session", cookie });
    assert.match(out.headers["set-cookie"], /Max-Age=0/);
  } finally {
    t.done();
  }
});

test("local sign-in: no passphrase set, other-site posts, guessing limit, old file path gone", async () => {
  const t = setup();
  try {
    writeFileSync(t.liveFile, JSON.stringify(await fakeFullLive()));
    const api = createLocalApi({ liveFile: t.liveFile, rancherFile: t.rancherFile, env: {} });
    assert.equal((await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS } })).status, 409);
    assert.equal((await call(api, { url: "/api/session" })).body.passphraseSet, false);
    writeRecord(t.rancherFile, hashPassphrase(PASS));
    const cross = await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS }, origin: "https://other.example" });
    assert.equal(cross.status, 403);
    for (let i = 0; i < 5; i++) await call(api, { method: "POST", url: "/api/session", body: { passphrase: "wrong passphrase " + i }, ip: "10.0.0.9" });
    const locked = await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS }, ip: "10.0.0.9" });
    assert.equal(locked.status, 429, "the right passphrase waits too once locked");
    assert.equal((await call(api, { method: "POST", url: "/api/session", body: "not json" })).status, 400);
    assert.deepEqual(await call(api, { url: "/live/live.json" }), { next: true }, "the old unchecked path is not served");
    const missing = createLocalApi({ liveFile: join(t.dir, "none.json"), rancherFile: t.rancherFile, env: {} });
    assert.deepEqual((await call(missing, { url: "/api/live" })).body, { view: "public", live: null });
  } finally {
    t.done();
  }
});

test("liveBody hides a full file for the public and passes a hidden file through", async () => {
  const full = await fakeFullLive();
  assert.ok(isHidden(liveBody({ live: full, rancher: false }).live));
  const hidden = hideTrackerDetails(full);
  assert.deepEqual(liveBody({ live: hidden, rancher: false }).live, hidden);
  assert.equal(liveBody({ live: full, rancher: true, arcgisApiKey: " " }).arcgisApiKey, undefined, "blank key is left out");
  assert.deepEqual(liveBody({ live: null, rancher: true }), { view: "rancher", live: null }, "no file");
});

test("liveBody tells only a signed-in rancher that the live file is unreadable", () => {
  assert.deepEqual(liveBody({ live: { nope: 1 }, rancher: true }), { view: "rancher", live: null, problem: "unreadable" });
  assert.deepEqual(liveBody({ live: null, rancher: true, unreadable: true }), { view: "rancher", live: null, problem: "unreadable" });
  assert.deepEqual(liveBody({ live: null, rancher: false, unreadable: true }), { view: "public", live: null });
  assert.deepEqual(liveBody({ live: { nope: 1 }, rancher: false }), { view: "public", live: null });
});

// ---- Cloudflare Access mode ------------------------------------------------

const TEAM = "fake-team.example";
const AUD = "fake-aud-tag";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "fake-kid-1";
const NOW_MS = Date.parse("2026-09-06T18:00:00Z");

function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function jwt(claims = {}, { key = privateKey, kid = KID, alg = "RS256" } = {}) {
  const nowS = Math.floor(NOW_MS / 1000);
  const head = b64url({ alg, kid, typ: "JWT" });
  const body = b64url({ aud: [AUD], iss: "https://" + TEAM, sub: "fake-user", iat: nowS, nbf: nowS - 5, exp: nowS + 3600, ...claims });
  const signer = createSign("RSA-SHA256");
  signer.update(head + "." + body);
  return head + "." + body + "." + signer.sign(key).toString("base64url");
}

function certsFetch(counter = { n: 0 }) {
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
  return async (url) => {
    counter.n += 1;
    assert.equal(url, "https://" + TEAM + "/cdn-cgi/access/certs");
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  };
}

const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ARCGIS_API_KEY: ARCGIS };

test("Access JWT: valid passes; bad signature, expired, wrong aud or iss, alg none, and no config fail", async () => {
  clearCertCache();
  const opts = { teamDomain: TEAM, aud: AUD, fetchImpl: certsFetch(), now: NOW_MS };
  assert.equal((await verifyAccessJwt(jwt(), opts)).ok, true);
  assert.equal((await verifyAccessJwt(jwt({}, { key: other.privateKey }), opts)).reason, "signature");
  assert.equal((await verifyAccessJwt(jwt({ exp: Math.floor(NOW_MS / 1000) - 3600 }), opts)).reason, "expired");
  assert.equal((await verifyAccessJwt(jwt({ aud: ["someone-else"] }), opts)).reason, "aud");
  assert.equal((await verifyAccessJwt(jwt({ iss: "https://other-team.example" }), opts)).reason, "iss");
  assert.equal((await verifyAccessJwt(jwt({ nbf: Math.floor(NOW_MS / 1000) + 3600 }), opts)).reason, "not-yet");
  assert.equal((await verifyAccessJwt(jwt({}, { alg: "none" }), opts)).reason, "alg");
  assert.equal((await verifyAccessJwt(jwt({}, { kid: "unknown" }), opts)).reason, "unknown-key");
  assert.equal((await verifyAccessJwt("not.a.jwt", opts)).ok, false);
  assert.equal((await verifyAccessJwt(jwt(), { ...opts, aud: "" })).reason, "not-configured");
  const tampered = jwt().split(".");
  tampered[1] = b64url({ aud: [AUD], iss: "https://" + TEAM, exp: Math.floor(NOW_MS / 1000) + 99999 });
  assert.equal((await verifyAccessJwt(tampered.join("."), opts)).reason, "signature");
});

test("Access token is read from the header first, then the CF_Authorization cookie", () => {
  assert.equal(accessToken(new Request("https://x.example", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } })), "a.b.c");
  assert.equal(accessToken(new Request("https://x.example", { headers: { Cookie: "x=1; CF_Authorization=d.e.f" } })), "d.e.f");
  assert.equal(accessToken(new Request("https://x.example")), null);
});

function fakeKv(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const reads = [];
  return {
    reads,
    data,
    async get(key, type) {
      reads.push(key);
      const text = data.get(key);
      return text === undefined ? null : type === "json" ? JSON.parse(text) : text;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}

test("Pages /api/live: the public gets hidden data and never reads the full copy; a valid JWT gets full data", async () => {
  clearCertCache();
  const full = await fakeFullLive();
  const kv = fakeKv({ [KV_HIDDEN]: hideTrackerDetails(full), [KV_FULL]: full });
  const env = { ...ENV, FIBERSHARE_LIVE: kv };
  const deps = { fetchImpl: certsFetch(), now: NOW_MS };
  const ask = async (headers = {}) => (await getLive({ request: new Request("https://copy.example/api/live", { headers }), env }, deps)).json();

  const pub = await ask();
  assert.equal(pub.view, "public");
  assert.ok(isHidden(pub.live));
  assert.ok(!kv.reads.includes(KV_FULL), "public request never reads the full key");

  for (const token of [jwt({ exp: Math.floor(NOW_MS / 1000) - 120 }), jwt({}, { key: other.privateKey }), jwt({ aud: ["x"] }), "garbage"]) {
    const res = await ask({ "Cf-Access-Jwt-Assertion": token });
    assert.equal(res.view, "public");
    assert.ok(isHidden(res.live));
    assert.equal(res.arcgisApiKey, undefined);
  }
  assert.ok(!kv.reads.includes(KV_FULL));

  const rancher = await ask({ "Cf-Access-Jwt-Assertion": jwt() });
  assert.equal(rancher.view, "rancher");
  assert.ok(isFull(rancher.live));
  assert.equal(rancher.arcgisApiKey, ARCGIS);
  const viaCookie = await ask({ Cookie: "CF_Authorization=" + jwt() });
  assert.equal(viaCookie.view, "rancher");

  // Without Access settings nobody is a rancher, even with a token.
  const bare = await getLive({ request: new Request("https://copy.example/api/live", { headers: { "Cf-Access-Jwt-Assertion": jwt() } }), env: { FIBERSHARE_LIVE: kv } }, deps);
  assert.equal((await bare.json()).view, "public");
  const empty = await getLive({ request: new Request("https://copy.example/api/live"), env: {} }, deps);
  assert.deepEqual(await empty.json(), { view: "public", live: null });
});

test("Pages /api/session and /api/rancher/login", async () => {
  clearCertCache();
  const deps = { fetchImpl: certsFetch(), now: NOW_MS };
  const none = await (await getSession({ request: new Request("https://copy.example/api/session"), env: {} }, deps)).json();
  assert.deepEqual(none, { mode: "none", signedIn: false });
  const out = await (await getSession({ request: new Request("https://copy.example/api/session"), env: ENV }, deps)).json();
  assert.equal(out.mode, "access");
  assert.equal(out.signedIn, false);
  const inn = await (await getSession({ request: new Request("https://copy.example/api/session", { headers: { "Cf-Access-Jwt-Assertion": jwt() } }), env: ENV }, deps)).json();
  assert.equal(inn.signedIn, true);
  const ok = await getLogin({ request: new Request("https://copy.example/api/rancher/login", { headers: { "Cf-Access-Jwt-Assertion": jwt() } }), env: ENV }, deps);
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("Location"), "https://copy.example/#/map");
  const no = await getLogin({ request: new Request("https://copy.example/api/rancher/login"), env: ENV }, deps);
  assert.equal(no.headers.get("Location"), "https://copy.example/#/rancher?error=access");
});

test("Pages /api/push: token checked, both files checked, leaks refused", async () => {
  const full = await fakeFullLive();
  const hidden = hideTrackerDetails(full);
  const token = "fake-push-token-" + "y".repeat(24);
  const kv = fakeKv();
  const env = { FIBERSHARE_LIVE: kv, PUSH_TOKEN: token };
  const push = (body, headerToken = token) =>
    postPush({ request: new Request("https://copy.example/api/push", { method: "POST", headers: { "X-FiberShare-Push-Token": headerToken }, body: JSON.stringify(body) }), env });

  assert.equal((await push({ hidden, full }, "wrong")).status, 401);
  assert.equal((await push({ hidden, full }, "")).status, 401);
  assert.equal((await postPush({ request: new Request("https://copy.example/api/push", { method: "POST" }), env: { FIBERSHARE_LIVE: kv } })).status, 503, "no PUSH_TOKEN, no push");
  assert.equal((await push({ hidden: full, full })).status, 400, "a full file in the hidden slot is refused");
  const leaky = structuredClone(hidden);
  leaky.note = "about " + full.animals[0].details.devEui;
  const refused = await push({ hidden: leaky, full });
  assert.equal(refused.status, 422);
  assert.equal(kv.data.size, 0, "nothing stored after a refusal");
  const res = await push({ hidden, full });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).trackers, full.animals.length);
  assert.ok(isHidden(JSON.parse(kv.data.get(KV_HIDDEN))));
  assert.ok(isFull(JSON.parse(kv.data.get(KV_FULL))));
  assert.equal(await sameSecret("abc", "abc"), true);
  assert.equal(await sameSecret("abc", "abd"), false);
});
