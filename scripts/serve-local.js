#!/usr/bin/env node
// npm run serve:local
//
// Serve the built site (dist/) and the /api routes on your own hardware, so a
// rancher can sign in and see full tracker data. Run `npm run build` first.
// Listens on 127.0.0.1:4174 unless FIBERSHARE_HOST or FIBERSHARE_PORT say otherwise.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createLocalApi } from "../server/local-api.js";
import { ALERTS_FILE, LIVE_FILE, RANCHER_FILE, ROOT } from "../server/paths.js";

const DIST = join(ROOT, "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

export function staticHandler(root) {
  const base = resolve(root);
  return async (req, res) => {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) {
      res.statusCode = 400;
      return res.end("Bad path");
    }
    let target = file;
    try {
      if (!(await stat(target)).isFile()) throw new Error("not a file");
    } catch {
      target = join(base, "index.html");
    }
    try {
      const body = await readFile(target);
      res.setHeader("Content-Type", TYPES[extname(target)] || "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("serve:local: no dist/ yet. Run npm run build first.");
    process.exit(1);
  }
  const host = process.env.FIBERSHARE_HOST || "127.0.0.1";
  const port = Number(process.env.FIBERSHARE_PORT) || 4174;
  const api = createLocalApi({ liveFile: LIVE_FILE, rancherFile: RANCHER_FILE, alertsFile: ALERTS_FILE });
  const files = staticHandler(DIST);
  createServer((req, res) => api(req, res, () => files(req, res))).listen(port, host, () => {
    console.log("serve:local: http://" + (host.includes(":") ? "[" + host + "]" : host) + ":" + port);
    if (!existsSync(RANCHER_FILE)) console.log("serve:local: no rancher passphrase yet. Run npm run rancher:passphrase to turn on sign-in.");
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
      console.warn("serve:local: listening beyond this machine over plain http. The passphrase and cookie cross your network unencrypted. Put https in front, or keep it on 127.0.0.1.");
    }
  });
}
