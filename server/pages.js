// Handlers behind the Pages Functions in functions/api/. Kept here so tests
// can pass in a fake fetch and a fake KV store.
import { isLiveData } from "../src/live-format.js";
import { hiddenProblems } from "./push-check.js";
import { accessToken, isRancher, teamHost, verifyAccessJwt } from "./access-jwt.js";
import { liveBody, NO_STORE } from "./live-response.js";

export const KV_HIDDEN = "live-hidden";
export const KV_FULL = "live-full";
const MAX_PUSH_BYTES = 5 * 1024 * 1024;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...headers } });
}

function accessConfigured(env) {
  return Boolean(teamHost(env.ACCESS_TEAM_DOMAIN) && env.ACCESS_AUD);
}

/** GET /api/live: hidden data for everyone, full data for a signed-in rancher. */
export async function getLive({ request, env }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const store = env.FIBERSHARE_LIVE;
  const rancher = accessConfigured(env) && (await isRancher(request, env, { fetchImpl, now }));
  let live = null;
  if (store) {
    // The public path never reads the full copy.
    if (rancher) live = await store.get(KV_FULL, "json");
    if (!isLiveData(live)) live = await store.get(KV_HIDDEN, "json");
  }
  return json(200, liveBody({ live, rancher, arcgisApiKey: rancher ? env.ARCGIS_API_KEY : undefined }));
}

/** GET /api/session: which sign-in this copy uses, and whether you are in. */
export async function getSession({ request, env }, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!accessConfigured(env)) return json(200, { mode: "none", signedIn: false });
  const signedIn = await isRancher(request, env, { fetchImpl, now });
  return json(200, { mode: "access", signedIn, loginUrl: "/api/rancher/login" });
}

/**
 * GET /api/rancher/login. Put this path behind a Cloudflare Access
 * application. Access signs the rancher in, then this sends them to the map.
 */
export async function getLogin({ request, env }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const result = accessConfigured(env)
    ? await verifyAccessJwt(accessToken(request), { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetchImpl, now })
    : { ok: false };
  const to = result.ok ? "/#/map" : "/#/rancher?error=access";
  return new Response(null, { status: 302, headers: { Location: new URL(to, url.origin).toString(), "Cache-Control": "no-store" } });
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text))));
}

/** Compare two secrets without leaking where they differ. */
export async function sameSecret(a, b) {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * POST /api/push from `npm run chirpstack:pull -- --push`.
 * Header X-FiberShare-Push-Token must match PUSH_TOKEN. Body: { hidden, full }.
 * The hidden copy is checked for any real value before anything is stored.
 */
export async function postPush({ request, env }) {
  const store = env.FIBERSHARE_LIVE;
  const expected = String(env.PUSH_TOKEN || "");
  if (!store || expected.length < 24) return json(503, { error: "Push is not set up on this copy." });
  const given = request.headers.get("X-FiberShare-Push-Token") || "";
  if (!(await sameSecret(given, expected))) return json(401, { error: "Push token did not match." });
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_PUSH_BYTES) return json(413, { error: "Too large." });

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_PUSH_BYTES) return json(413, { error: "Too large." });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Send JSON with hidden and full." });
  }
  const { hidden, full } = body || {};
  if (!isLiveData(hidden) || !isLiveData(full)) return json(400, { error: "Both files must be live files." });
  if (hidden.hidden !== true || full.hidden !== false) return json(400, { error: "hidden must be hidden and full must be full." });
  const problems = hiddenProblems(hidden, full);
  if (problems.length) return json(422, { error: "The hidden file still had private data.", kinds: problems });

  await store.put(KV_HIDDEN, JSON.stringify(hidden));
  await store.put(KV_FULL, JSON.stringify(full));
  return json(200, { ok: true, trackers: full.animals.length });
}
