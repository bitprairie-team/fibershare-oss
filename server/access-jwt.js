// Check a Cloudflare Access token (the Cf-Access-Jwt-Assertion header or the
// CF_Authorization cookie) with Web Crypto. Runs in Pages Functions and Node 20+.
// The team domain and audience tag come from env, never from the repo.

const CERT_TTL_MS = 10 * 60 * 1000;
const SKEW_S = 60;
const certCache = new Map();

function b64urlBytes(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(text) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(text)));
}

/** "team.example" or "https://team.example/" become "team.example". */
export function teamHost(value) {
  const text = String(value || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+$/i.test(text) && text.includes(".") ? text.toLowerCase() : null;
}

async function certs(host, fetchImpl, nowMs, force) {
  const cached = certCache.get(host);
  if (cached && !force && nowMs - cached.at < CERT_TTL_MS) return cached.keys;
  // A token with an unknown key id may mean the keys rotated. Fetch again,
  // but at most once a minute.
  if (cached && force && nowMs - cached.at < 60_000) return cached.keys;
  const response = await fetchImpl("https://" + host + "/cdn-cgi/access/certs");
  if (!response.ok) throw new Error("certs " + response.status);
  const body = await response.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  certCache.set(host, { at: nowMs, keys });
  return keys;
}

export function clearCertCache() {
  certCache.clear();
}

/** Find the Access token on a request: header first, then cookie. */
export function accessToken(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header.trim();
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "CF_Authorization") return rest.join("=");
  }
  return null;
}

/**
 * Verify an Access JWT. Returns { ok: true, claims } or { ok: false, reason }.
 * Reasons are short codes, never token contents.
 */
export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, now = Date.now() } = {}) {
  const host = teamHost(teamDomain);
  if (!host || !aud) return { ok: false, reason: "not-configured" };
  if (typeof token !== "string" || token.split(".").length !== 3) return { ok: false, reason: "no-token" };
  const [h, p, s] = token.split(".");
  let header;
  let claims;
  try {
    header = b64urlJson(h);
    claims = b64urlJson(p);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, reason: "alg" };

  let keys;
  try {
    keys = await certs(host, fetchImpl, now, false);
    if (!keys.some((k) => k.kid === header.kid)) keys = await certs(host, fetchImpl, now, true);
  } catch {
    return { ok: false, reason: "certs" };
  }
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) return { ok: false, reason: "unknown-key" };

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(h + "." + p));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };

  const nowS = Math.floor(now / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(String(aud).trim())) return { ok: false, reason: "aud" };
  if (String(claims.iss || "").replace(/\/$/, "") !== "https://" + host) return { ok: false, reason: "iss" };
  if (!Number.isFinite(claims.exp) || claims.exp + SKEW_S <= nowS) return { ok: false, reason: "expired" };
  if (Number.isFinite(claims.nbf) && claims.nbf - SKEW_S > nowS) return { ok: false, reason: "not-yet" };
  return { ok: true, claims };
}

/** True when the request comes from a signed-in rancher under Access. */
export async function isRancher(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const result = await verifyAccessJwt(accessToken(request), {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    fetchImpl,
    now,
  });
  return result.ok;
}
