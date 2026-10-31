// Read settings for `npm run chirpstack:pull` from environment variables and
// an optional token file. Nothing here is ever printed with the token in it.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_URL = "http://localhost:8090";
export const DEFAULT_TOKEN_FILE = "~/.config/fibershare/chirpstack-token";

function expandHome(path, home) {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Build the pull settings.
 * The token comes from CHIRPSTACK_API_TOKEN, or else from the file named by
 * CHIRPSTACK_API_TOKEN_FILE (default ~/.config/fibershare/chirpstack-token).
 * Returns { config, warnings, errors }. Warnings and errors never hold the token.
 */
export function readConfig(env = process.env, io = {}) {
  const readFile = io.readFile || ((path) => readFileSync(path, "utf8"));
  const stat = io.stat || ((path) => statSync(path));
  const home = io.home || homedir();
  const platform = io.platform || process.platform;
  const warnings = [];
  const errors = [];

  const rawUrl = (env.CHIRPSTACK_URL || DEFAULT_URL).trim();
  let baseUrl = null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
    baseUrl = url.origin + url.pathname.replace(/\/+$/, "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "http:" && !loopback) {
      warnings.push("CHIRPSTACK_URL uses plain http to another host. The token crosses the network unencrypted. Use https, or run the pull on the same hardware as ChirpStack.");
    }
  } catch {
    errors.push("CHIRPSTACK_URL is not a valid http or https URL.");
  }

  let token = (env.CHIRPSTACK_API_TOKEN || "").trim();
  let tokenSource = token ? "env" : null;
  if (!token) {
    const tokenFile = expandHome((env.CHIRPSTACK_API_TOKEN_FILE || DEFAULT_TOKEN_FILE).trim(), home);
    try {
      token = readFile(tokenFile).trim();
      tokenSource = "file";
      if (platform !== "win32") {
        const mode = stat(tokenFile).mode & 0o777;
        if (mode & 0o077) warnings.push("The token file can be read by other users. Run: chmod 600 on it.");
      }
    } catch {
      token = "";
    }
    if (!token) {
      errors.push("No ChirpStack API token. Set CHIRPSTACK_API_TOKEN, or put the token in " + (env.CHIRPSTACK_API_TOKEN_FILE ? "CHIRPSTACK_API_TOKEN_FILE" : DEFAULT_TOKEN_FILE) + ".");
    }
  }

  const accessId = (env.CF_ACCESS_CLIENT_ID || "").trim();
  const accessSecret = (env.CF_ACCESS_CLIENT_SECRET || "").trim();
  if (Boolean(accessId) !== Boolean(accessSecret)) {
    errors.push("Set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither.");
  }

  return {
    config: {
      baseUrl,
      token,
      tokenSource,
      accessId: accessId || null,
      accessSecret: accessSecret || null,
      tenantIds: list(env.CHIRPSTACK_TENANT_ID),
      applicationIds: list(env.CHIRPSTACK_APPLICATION_ID),
    },
    warnings,
    errors,
  };
}
