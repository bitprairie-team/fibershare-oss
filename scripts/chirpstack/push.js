// Send the hidden and full live files to a Pages copy of the demo
// (`npm run chirpstack:pull -- --push`). The token is never printed.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { plainHttpOk } from "./config.js";

export const DEFAULT_PUSH_TOKEN_FILE = "~/.config/fibershare/push-token";

function expandHome(path, home) {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

/** Returns { push: { url, token } | null, errors }. Errors never hold the token. */
export function readPushConfig(env = process.env, io = {}) {
  const readFile = io.readFile || ((path) => readFileSync(path, "utf8"));
  const home = io.home || homedir();
  const errors = [];
  const raw = String(env.FIBERSHARE_PUSH_URL || "").trim();
  let url = null;
  if (!raw) errors.push("Set FIBERSHARE_PUSH_URL to your copy's /api/push address.");
  else {
    try {
      const parsed = new URL(raw);
      const local = parsed.protocol === "http:" && plainHttpOk(parsed.hostname, {});
      if (parsed.protocol !== "https:" && !local) errors.push("FIBERSHARE_PUSH_URL must use https.");
      else url = parsed.toString();
    } catch {
      errors.push("FIBERSHARE_PUSH_URL is not a valid URL.");
    }
  }
  let token = String(env.FIBERSHARE_PUSH_TOKEN || "").trim();
  if (!token) {
    try {
      token = readFile(expandHome(String(env.FIBERSHARE_PUSH_TOKEN_FILE || DEFAULT_PUSH_TOKEN_FILE).trim(), home)).trim();
    } catch {
      token = "";
    }
  }
  if (!token) errors.push("No push token. Set FIBERSHARE_PUSH_TOKEN, or put it in " + (env.FIBERSHARE_PUSH_TOKEN_FILE ? "FIBERSHARE_PUSH_TOKEN_FILE" : DEFAULT_PUSH_TOKEN_FILE) + ".");
  return { push: errors.length ? null : { url, token }, errors };
}

/** POST both files. Resolves to { ok, status, trackers?, error? }. */
export async function pushLive(push, hidden, full, fetchImpl = fetch) {
  const response = await fetchImpl(push.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FiberShare-Push-Token": push.token },
    body: JSON.stringify({ hidden, full }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  const error = typeof body.error === "string" ? body.error.replaceAll(push.token, "[token]") : undefined;
  return { ok: response.ok && body.ok === true, status: response.status, trackers: body.trackers, error };
}
