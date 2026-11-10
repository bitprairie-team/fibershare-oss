// The /api routes for your own hardware. Used by the Vite dev and preview
// servers and by `npm run serve:local`. The full live file never leaves this
// process unless the request carries a valid rancher session cookie.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { addFeedback, parseFeedbackList } from "./alert-feedback.js";
import { addLogEntry, parseLogList } from "./ranch-log.js";
import { liveBody, NO_STORE } from "./live-response.js";
import {
  checkSession,
  clearCookie,
  COOKIE_NAME,
  createLimiter,
  makeSession,
  parseCookies,
  readRecord,
  sessionCookie,
  verifyPassphrase,
} from "./local-auth.js";

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ ...NO_STORE, ...headers })) res.setHeader(k, v);
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Sign-in and sign-out only from this site. SameSite=Strict covers the
// cookie; this covers a form posted from another page.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * options:
 *   liveFile     path to .local/live.json
 *   rancherFile  path to .local/rancher.json
 *   alertsFile   path to .local/alert-feedback.json (answers to alerts)
 *   logFile      path to .local/ranch-log.json (notes, checks, alerts by hand)
 *   env          for ARCGIS_API_KEY
 *   secure       add Secure to the cookie (when served over https)
 *   now          clock for tests
 */
export function createLocalApi({ liveFile, rancherFile, alertsFile, logFile, env = process.env, secure = false, now = () => Date.now() }) {
  const limiter = createLimiter();
  // A JSON list in .local/, owner-only, written one change at a time so two
  // quick saves cannot overwrite each other.
  const listFile = (file, parse) => {
    let writing = Promise.resolve();
    const read = async () => {
      try {
        return parse(await readFile(file, "utf8"));
      } catch {
        return [];
      }
    };
    const write = async (list) => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = file + ".tmp";
      await writeFile(tmp, JSON.stringify(list, null, 1) + "\n", { mode: 0o600 });
      await rename(tmp, file);
    };
    const change = (fn) =>
      (writing = writing.then(async () => {
        const out = fn(await read());
        if (out.list) await write(out.list);
        return out;
      }));
    return { read, change };
  };
  const feedback = listFile(alertsFile || join(dirname(rancherFile), "alert-feedback.json"), parseFeedbackList);
  const ranchLog = listFile(logFile || join(dirname(rancherFile), "ranch-log.json"), parseLogList);

  const signedIn = (req) => {
    const record = readRecord(rancherFile);
    if (!record) return false;
    const value = parseCookies(req.headers.cookie)[COOKIE_NAME];
    return checkSession(value, record.sessionSecret, { now: now() });
  };

  return async function localApi(req, res, next) {
    const path = (req.url || "").split("?")[0];
    if (!path.startsWith("/api/")) return next();

    if (path === "/api/session") {
      if (req.method === "GET") {
        return send(res, 200, { mode: "local", signedIn: signedIn(req), passphraseSet: Boolean(readRecord(rancherFile)) });
      }
      if (!sameOrigin(req)) return send(res, 403, { error: "Sign in from this site." });
      if (req.method === "DELETE") return send(res, 200, { signedIn: false }, { "Set-Cookie": clearCookie({ secure }) });
      if (req.method === "POST") {
        const who = req.socket?.remoteAddress || "local";
        if (limiter.blocked(who, now())) return send(res, 429, { error: "Too many tries. Wait a minute." }, { "Retry-After": "60" });
        const record = readRecord(rancherFile);
        if (!record) return send(res, 409, { error: "No rancher passphrase is set. Run npm run rancher:passphrase." });
        let passphrase = "";
        try {
          passphrase = JSON.parse(await readBody(req)).passphrase;
        } catch {
          return send(res, 400, { error: "Send JSON with a passphrase." });
        }
        if (!verifyPassphrase(passphrase, record)) {
          limiter.miss(who, now());
          return send(res, 401, { error: "That passphrase did not match." });
        }
        limiter.clear(who);
        const cookie = sessionCookie(makeSession(record.sessionSecret, { now: now() }), { secure });
        return send(res, 200, { signedIn: true }, { "Set-Cookie": cookie });
      }
      return send(res, 405, { error: "Use GET, POST, or DELETE." }, { Allow: "GET, POST, DELETE" });
    }

    if (path === "/api/live") {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Use GET." }, { Allow: "GET" });
      let live = null;
      let unreadable = false;
      try {
        live = JSON.parse(await readFile(liveFile, "utf8"));
      } catch (error) {
        live = null;
        unreadable = error?.code !== "ENOENT";
      }
      return send(res, 200, liveBody({ live, rancher: signedIn(req), arcgisApiKey: env.ARCGIS_API_KEY, unreadable }));
    }

    if (path === "/api/alerts" || path === "/api/log") {
      const alerts = path === "/api/alerts";
      if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { error: "Use GET or POST." }, { Allow: "GET, POST" });
      if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: alerts ? "Answer alerts from this site." : "Save notes from this site." });
      if (!signedIn(req)) return send(res, 401, { error: alerts ? "Sign in as the rancher to see and answer alerts." : "Sign in as the rancher to see and save notes." });
      const list = alerts ? feedback : ranchLog;
      if (req.method === "GET") return send(res, 200, alerts ? { feedback: await list.read() } : { log: await list.read() });
      let text = "";
      try {
        text = await readBody(req);
      } catch {
        return send(res, 413, { error: alerts ? "That answer is too long." : "That entry is too long." });
      }
      const at = new Date(now()).toISOString();
      const result = await list.change((current) => (alerts ? addFeedback(current, text, { now: at }) : addLogEntry(current, text, { now: at })));
      return send(res, result.status, result.body);
    }

    if (path === "/api/health") return send(res, 200, { ok: true, project: "fibershare-oss", mode: "local" });
    return send(res, 404, { error: "Not found." });
  };
}
