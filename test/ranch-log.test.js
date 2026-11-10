// The ranch log on the server: a signed-in rancher's notes, checks and
// hand-made alerts go to /api/log, behind the same sign-in as /api/alerts.
// The sample day and the public view keep them in the browser.
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { computeAlerts } from "../src/alerts.js";
import { createRanchLog, describeLogEntry, LOG_KEYS, lastChecked } from "../src/ranch-log.js";
import { clearCertCache } from "../server/access-jwt.js";
import { createLocalApi } from "../server/local-api.js";
import { hashPassphrase, writeRecord } from "../server/local-auth.js";
import { getLog, postLog } from "../server/pages.js";
import { addLogEntry, authorFromClaims, KV_LOG, KV_LOG_PREFIX, LOCAL_LOG_AUTHOR, LOG_LIMIT, mergeLogEntries, parseLogList, parseLogValue, readLog } from "../server/ranch-log.js";
import * as logFunction from "../functions/api/log.js";

const NOTE = { type: "note", animalId: "tracker-1", text: "Fake note for tests." };
const NOW = "2026-10-31T20:00:00.000Z";

function memory() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

// ---- browser side -------------------------------------------------------------

test("ranch log: the sample day and the public view stay in this browser", () => {
  const storage = memory();
  let fetched = 0;
  const fetchImpl = async () => {
    fetched++;
    return new Response("{}");
  };
  for (const scope of ["demo", "public"]) {
    const log = createRanchLog(scope, { storage, fetchImpl });
    assert.equal(log.server, false);
    assert.equal(log.where, "Saved in this browser.");
    assert.equal(log.add(NOTE).length, 1, "the browser log answers at once");
  }
  assert.equal(fetched, 0, "nothing goes to the server");
  assert.deepEqual([...storage.data.keys()].sort(), [LOG_KEYS.demo, LOG_KEYS.public].sort());
});

test("ranch log: a signed-in rancher's log goes to /api/log", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.method, init.credentials, init.body && JSON.parse(init.body)]);
    return new Response(JSON.stringify({ log: [{ id: "a", ...NOTE, at: NOW }, { bogus: true }] }), { status: 200 });
  };
  const storage = memory();
  const log = createRanchLog("rancher", { storage, fetchImpl });
  assert.equal(log.server, true);
  assert.match(log.where, /server/);
  assert.equal((await log.load()).length, 1, "unknown entries are dropped");
  await log.add({ ...NOTE, id: "client-id", at: "1999-01-01T00:00:00Z" });
  assert.deepEqual(calls[0], ["/api/log", "GET", "same-origin", undefined]);
  assert.deepEqual(calls[1].slice(0, 3), ["/api/log", "POST", "same-origin"]);
  assert.deepEqual(calls[1][3], NOTE, "only the type, animal and text are sent; the server sets id and time");
  await assert.rejects(() => log.add({ type: "note", animalId: "tracker-1", text: " " }), /Write a note/);
  assert.equal(calls.length, 2, "an empty note fails before a round trip");
  assert.equal(storage.data.size, 0, "a rancher's notes are not left in the browser");

  const out = createRanchLog("rancher", { fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => out.load(), /Sign in again/);
  const down = createRanchLog("rancher", { fetchImpl: async () => new Response(JSON.stringify({ error: "No store is set up on this copy." }), { status: 503 }) });
  await assert.rejects(() => down.add(NOTE), /No store/);
});

test("ranch log: the server checks entries and keeps the newest", () => {
  assert.equal(addLogEntry([], "not json", { now: NOW }).status, 400);
  assert.equal(addLogEntry([], JSON.stringify({ type: "delete" }), { now: NOW }).status, 400);
  assert.equal(addLogEntry([], JSON.stringify({ type: "checked" }), { now: NOW }).status, 400, "a check needs an animal");
  const ok = addLogEntry([], JSON.stringify({ ...NOTE, at: "1999-01-01T00:00:00Z", id: "mine", extra: 1 }), { now: NOW });
  assert.equal(ok.status, 200);
  assert.equal(ok.list[0].at, NOW, "the server sets the time");
  assert.notEqual(ok.list[0].id, "mine", "the server sets the id");
  assert.equal(ok.list[0].extra, undefined);
  const full = Array.from({ length: LOG_LIMIT }, (_, i) => ({ id: "x" + i, type: "note", animalId: "a", text: "n", at: NOW }));
  const next = addLogEntry(full, JSON.stringify(NOTE), { now: NOW }).list;
  assert.equal(next.length, LOG_LIMIT);
  assert.equal(next[0].id, "x1", "the oldest entry drops off");
  assert.deepEqual(parseLogList("{"), []);
  assert.deepEqual(parseLogList(JSON.stringify([{ type: "note" }, { id: "1", type: "note" }])).length, 1);
  const named = addLogEntry([], JSON.stringify({ ...NOTE, author: "eve@evil.example" }), { now: NOW, author: "rancher@example.com" });
  assert.equal(named.entry.author, "rancher@example.com", "the server sets the author");
  assert.notEqual(named.entry.author, "eve@evil.example", "a client-sent author is ignored");
  const leftover = [{ id: "old-1", type: "note", animalId: "a", text: "Earlier note.", at: "2026-10-01T00:00:00.000Z" }];
  const merged = mergeLogEntries(leftover, [named.entry]);
  assert.equal(merged[0].id, "old-1");
  assert.equal(merged[1].author, "rancher@example.com");
  assert.deepEqual(parseLogValue(JSON.stringify(named.entry))[0].id, named.entry.id);
  assert.equal(authorFromClaims({ email: "rancher@example.com", sub: "abc" }), "rancher@example.com");
  assert.equal(authorFromClaims({ sub: "access-sub-1" }), "access-sub-1");
  assert.equal(authorFromClaims({}), LOCAL_LOG_AUTHOR);
  assert.match(describeLogEntry({ type: "checked", at: NOW, author: "rancher@example.com" }), /^Checked by rancher@example.com at \d{2}:\d{2}$/);
  assert.match(describeLogEntry({ type: "checked", at: NOW }), /^Checked by hand at \d{2}:\d{2}$/);
  assert.match(describeLogEntry({ type: "note", text: "Fed in the east paddock.", at: NOW, author: "rancher@example.com" }), /Fed in the east paddock by rancher@example.com at \d{2}:\d{2}/);
  assert.equal(describeLogEntry({ type: "note", text: "Fed in the east paddock.", at: NOW }), "Fed in the east paddock.");
});

// ---- local server -------------------------------------------------------------

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

test("local /api/log: rancher only, same site only, checked, and saved in the private folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fs-log-"));
  try {
    const rancherFile = join(dir, "rancher.json");
    const logFile = join(dir, "ranch-log.json");
    const alertsFile = join(dir, "alert-feedback.json");
    writeRecord(rancherFile, hashPassphrase(PASS));
    writeFileSync(join(dir, "live.json"), "{}");
    const api = createLocalApi({ liveFile: join(dir, "live.json"), rancherFile, alertsFile, logFile, now: () => Date.parse(NOW) });

    assert.equal((await call(api, { url: "/api/log" })).status, 401, "GET needs sign-in");
    assert.equal((await call(api, { method: "POST", url: "/api/log", body: NOTE })).status, 401, "POST needs sign-in");
    assert.equal((await call(api, { url: "/api/log", cookie: "fs_session=v1.99999999999999.abc.def" })).status, 401, "a forged cookie fails");
    assert.equal(existsSync(logFile), false, "nothing written without sign-in");

    const login = await call(api, { method: "POST", url: "/api/session", body: { passphrase: PASS } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    assert.equal((await call(api, { method: "POST", url: "/api/log", cookie, body: NOTE, origin: "https://elsewhere.example" })).status, 403);
    assert.equal((await call(api, { method: "POST", url: "/api/log", cookie, body: "not json" })).status, 400);
    assert.equal((await call(api, { method: "POST", url: "/api/log", cookie, body: "x".repeat(5000) })).status, 413);
    assert.equal((await call(api, { method: "DELETE", url: "/api/log", cookie })).status, 405);

    const leftover = { id: "old-1", type: "note", animalId: "tracker-1", text: "Leftover note from the old file.", at: "2026-10-01T12:00:00.000Z" };
    writeFileSync(logFile, JSON.stringify([leftover]) + "\n", { mode: 0o600 });

    const saved = await call(api, { method: "POST", url: "/api/log", cookie, body: NOTE, origin: "http://127.0.0.1:5173" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.entry.author, LOCAL_LOG_AUTHOR);
    assert.ok(saved.body.log.some((e) => e.id === "old-1"), "the old file still reads");
    const journal = logFile.replace(/\.json$/, "") + ".jsonl";
    assert.equal(statSync(journal).mode & 0o077, 0, "the log journal is owner-only");
    await Promise.all([
      call(api, { method: "POST", url: "/api/log", cookie, body: { type: "checked", animalId: "tracker-1" } }),
      call(api, { method: "POST", url: "/api/log", cookie, body: { type: "alert", text: "Fake gate left open" } }),
    ]);
    const list = (await call(api, { url: "/api/log", cookie })).body.log;
    assert.deepEqual(list.map((e) => e.type).sort(), ["alert", "checked", "note", "note"], "quick saves do not overwrite each other");
    assert.equal(new Set(list.map((e) => e.id)).size, 4, "each entry has its own id");
    assert.ok(list.every((e) => e.id === "old-1" || e.author === LOCAL_LOG_AUTHOR));
    assert.equal(list.find((e) => e.id === "old-1").author, undefined, "leftover entries keep their original shape");
    assert.equal(lastChecked(list, "tracker-1"), NOW);
    const manual = computeAlerts({ animals: [], events: [], now: NOW, jobs: {}, log: list }).filter((a) => a.kind === "manual");
    assert.equal(manual.length, 1, "a hand-made alert from the server shows like one from the browser");
    assert.equal(JSON.parse(readFileSync(logFile, "utf8")).length, 1, "the leftover list file is left in place");
    assert.equal(readFileSync(journal, "utf8").trim().split("\n").length, 3);
    assert.equal(existsSync(alertsFile), false, "the log and the alert answers are separate files");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Pages --------------------------------------------------------------------

const TEAM = "fake-team.example";
const AUD = "fake-aud-tag";
const KID = "fake-kid-log";
const NOW_MS = Date.parse(NOW);
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwt({ email = "rancher@example.com", sub = "fake-user" } = {}) {
  const s = Math.floor(NOW_MS / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = enc({ alg: "RS256", kid: KID, typ: "JWT" });
  const claims = { aud: [AUD], iss: "https://" + TEAM, sub, iat: s, nbf: s - 5, exp: s + 3600 };
  if (email) claims.email = email;
  const body = enc(claims);
  const signer = createSign("RSA-SHA256");
  signer.update(head + "." + body);
  return head + "." + body + "." + signer.sign(privateKey).toString("base64url");
}

const fetchImpl = async () => new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] }));

function kv() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? data.get(k) : null; },
    async put(k, v) { data.set(k, v); },
    async delete(k) { data.delete(k); },
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const names = [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) || 0 : 0;
      const page = names.slice(start, start + limit);
      const next = start + page.length;
      return { keys: page.map((name) => ({ name })), list_complete: next >= names.length, cursor: next >= names.length ? undefined : String(next) };
    },
  };
}

function request(method, { token, body, origin } = {}) {
  const headers = { ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}), ...(origin ? { Origin: origin } : {}) };
  return new Request("https://copy.example/api/log", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("Pages /api/log: needs a valid Access token, a store, and this site", async () => {
  clearCertCache();
  const store = kv();
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, FIBERSHARE_LIVE: store };
  const deps = { fetchImpl, now: NOW_MS };
  assert.equal((await getLog({ request: request("GET"), env }, deps)).status, 401);
  assert.equal((await postLog({ request: request("POST", { body: NOTE }), env }, deps)).status, 401);
  assert.equal((await postLog({ request: request("POST", { token: "garbage", body: NOTE }), env }, deps)).status, 401);
  assert.equal((await getLog({ request: request("GET", { token: jwt() }), env: { FIBERSHARE_LIVE: store } }, deps)).status, 401, "no Access setup, no notes");
  assert.equal(store.data.size, 0);
  assert.equal((await getLog({ request: request("GET", { token: jwt() }), env: { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } }, deps)).status, 503);
  assert.equal((await postLog({ request: request("POST", { token: jwt(), body: NOTE, origin: "https://elsewhere.example" }), env }, deps)).status, 403);
  assert.equal((await postLog({ request: request("POST", { token: jwt(), body: { type: "note", text: "" } }), env }, deps)).status, 400);

  const saved = await postLog({ request: request("POST", { token: jwt(), body: { ...NOTE, author: "eve@evil.example" }, origin: "https://copy.example" }), env }, deps);
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.entry.author, "rancher@example.com", "author comes from the verified Access email");
  assert.equal(store.data.has(KV_LOG), false, "new entries are not written back to the old single key");
  assert.equal([...store.data.keys()].filter((k) => k.startsWith(KV_LOG_PREFIX)).length, 1);
  const list = await (await getLog({ request: request("GET", { token: jwt() }), env }, deps)).json();
  assert.equal(list.log[0].text, NOTE.text);
  assert.equal(list.log[0].at, NOW);
  assert.equal(list.log[0].author, "rancher@example.com");
  assert.equal(typeof logFunction.onRequestGet, "function");
  assert.equal(typeof logFunction.onRequestPost, "function");
});

test("Pages /api/log: author comes from the token, concurrent posts both persist, and the old key still reads", async () => {
  clearCertCache();
  const store = kv();
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, FIBERSHARE_LIVE: store };
  const deps = { fetchImpl, now: NOW_MS };

  assert.equal((await getLog({ request: request("GET"), env }, deps)).status, 401, "unsigned GET is 401");
  assert.equal((await postLog({ request: request("POST", { body: NOTE }), env }, deps)).status, 401, "unsigned POST is 401");

  const oldEntry = { id: "old-1", type: "note", animalId: "tracker-1", text: "Leftover note from the single key.", at: "2026-10-01T12:00:00.000Z" };
  store.data.set(KV_LOG, JSON.stringify([oldEntry]));

  const tokenA = jwt({ email: "rancher@example.com" });
  const tokenB = jwt({ email: "", sub: "subject-only-user" });
  const slow = {
    ...store,
    async put(k, v) {
      await new Promise((r) => setTimeout(r, 30));
      return store.put(k, v);
    },
  };
  const slowEnv = { ...env, FIBERSHARE_LIVE: slow };
  const [first, second] = await Promise.all([
    postLog({ request: request("POST", { token: tokenA, body: { ...NOTE, text: "First concurrent note.", author: "ignored@client.example" }, origin: "https://copy.example" }), env: slowEnv }, deps),
    postLog({ request: request("POST", { token: tokenB, body: { ...NOTE, text: "Second concurrent note." }, origin: "https://copy.example" }), env: slowEnv }, deps),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).entry.author, "rancher@example.com");
  assert.equal((await second.json()).entry.author, "subject-only-user", "subject is used when the token has no email");

  const list = await (await getLog({ request: request("GET", { token: tokenA }), env }, deps)).json();
  assert.equal(list.log.length, 3, "both new posts and the leftover entry are kept");
  assert.equal(list.log[0].id, "old-1");
  assert.equal(list.log[0].author, undefined);
  const authors = list.log.slice(1).map((e) => e.author).sort();
  assert.deepEqual(authors, ["rancher@example.com", "subject-only-user"]);
  assert.deepEqual(list.log.slice(1).map((e) => e.text).sort(), ["First concurrent note.", "Second concurrent note."]);
  assert.equal(await readLog(store).then((log) => log.length), 3);
});

