// Rancher sign-in for your own hardware: one passphrase, stored hashed in
// .local/rancher.json, and a signed session cookie. Node only.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const COOKIE_NAME = "fs_session";
export const SESSION_HOURS = 12;
export const MIN_PASSPHRASE = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Hash a passphrase. Returns the record kept in .local/rancher.json. */
export function hashPassphrase(passphrase, { now = new Date() } = {}) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) {
    throw new Error("The passphrase needs at least " + MIN_PASSPHRASE + " characters.");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(passphrase, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return {
    version: 1,
    kdf: "scrypt",
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    // A new secret each time, so changing the passphrase signs everyone out.
    sessionSecret: randomBytes(32).toString("base64"),
    createdAt: now.toISOString(),
  };
}

export function verifyPassphrase(passphrase, record) {
  if (typeof passphrase !== "string" || !record || record.kdf !== "scrypt") return false;
  try {
    const expected = Buffer.from(record.hash, "base64");
    const { N, r, p } = record.params;
    const got = scryptSync(passphrase, Buffer.from(record.salt, "base64"), expected.length, { N, r, p });
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export function readRecord(path) {
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    return record && record.kdf === "scrypt" && record.sessionSecret ? record : null;
  } catch {
    return null;
  }
}

export function writeRecord(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Not every file system keeps modes.
  }
}

export function removeRecord(path) {
  if (existsSync(path)) unlinkSync(path);
}

function sign(secret, payload) {
  return createHmac("sha256", Buffer.from(secret, "base64")).update(payload).digest("base64url");
}

/** A session value: v1.<expiry ms>.<nonce>.<hmac>. Nothing private inside. */
export function makeSession(secret, { now = Date.now(), hours = SESSION_HOURS } = {}) {
  const payload = "v1." + (now + hours * 3600 * 1000) + "." + randomBytes(12).toString("base64url");
  return payload + "." + sign(secret, payload);
}

export function checkSession(value, secret, { now = Date.now() } = {}) {
  if (typeof value !== "string" || !secret) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= now) return false;
  const expected = Buffer.from(sign(secret, parts.slice(0, 3).join(".")));
  const got = Buffer.from(parts[3]);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!(name in out)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

export function sessionCookie(value, { secure = false, hours = SESSION_HOURS } = {}) {
  return [
    COOKIE_NAME + "=" + value,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + Math.round(hours * 3600),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearCookie({ secure = false } = {}) {
  return [COOKIE_NAME + "=", "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0", ...(secure ? ["Secure"] : [])].join("; ");
}

/** Slow down passphrase guessing: 5 misses per address, then a pause. */
export function createLimiter({ tries = 5, pauseMs = 60_000 } = {}) {
  const misses = new Map();
  return {
    blocked(key, now = Date.now()) {
      const entry = misses.get(key);
      return Boolean(entry && entry.count >= tries && now - entry.at < pauseMs);
    },
    miss(key, now = Date.now()) {
      const entry = misses.get(key);
      const fresh = !entry || now - entry.at >= pauseMs;
      misses.set(key, { count: fresh ? 1 : entry.count + 1, at: now });
    },
    clear(key) {
      misses.delete(key);
    },
  };
}
