#!/usr/bin/env node
// npm run chirpstack:pull
//
// Read your trackers from your own ChirpStack v4 server and write
// .local/live.json for the herd view. Needs Node 20 or newer and nothing else.
// It prints counts only: never the token, names, IDs, or values.
//
// Flags:
//   --hide / --no-hide   Hide tracker details before writing (default: hide,
//                        or FIBERSHARE_HIDE_TRACKERS=0 to turn it off)
//   --mqtt-seconds=N     How long to listen for uplinks when CHIRPSTACK_MQTT_URL is set (default 60)
//   --hours=N            How many hours of link metrics to read (default 24)
//   --out=PATH           Where to write (default .local/live.json)
//   --watch=N            Pull again every N seconds (at least 30). The way to
//                        keep the file fresh
//   --push               Also send the hidden and full files to a Pages copy
//                        (FIBERSHARE_PUSH_URL and FIBERSHARE_PUSH_TOKEN)
//   --dry-run            Pull and check, but do not write or push
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";
import { pullRaw, redact } from "./client.js";
import { summarize, toLiveData } from "./map.js";
import { collectUplinks, parseMqttUrl, uplinkTopics } from "./mqtt.js";
import { pushLive, readPushConfig } from "./push.js";
import { hideTrackerDetails } from "../../src/live-format.js";
import { hiddenProblems } from "../../server/push-check.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseArgs(argv, env = {}) {
  const hideEnv = String(env.FIBERSHARE_HIDE_TRACKERS ?? "1").trim().toLowerCase();
  const options = {
    hide: !["0", "false", "no", "off"].includes(hideEnv),
    hours: 24,
    mqttSeconds: 60,
    out: join(ROOT, ".local", "live.json"),
    watch: 0,
    push: false,
    dryRun: false,
  };
  for (const arg of argv) {
    const [flag, value] = arg.split("=");
    if (flag === "--hide") options.hide = true;
    else if (flag === "--no-hide") options.hide = false;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--push") options.push = true;
    else if (flag === "--hours") options.hours = Math.min(168, Math.max(1, Number(value) || 24));
    else if (flag === "--mqtt-seconds") options.mqttSeconds = Math.min(3600, Math.max(5, Number(value) || 60));
    else if (flag === "--out" && value) options.out = resolve(value);
    else if (flag === "--watch") options.watch = Math.max(30, Number(value) || 60);
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error("Unknown option " + flag + ". Try --help.");
  }
  return options;
}

/** Problems that would stop a hidden export from being written. */
export const hiddenExportProblems = hiddenProblems;

function readAliases(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAtomic(path, text, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
  try {
    chmodSync(path, mode);
  } catch {
    // Not every file system keeps modes.
  }
}

async function once(options, env) {
  const { config, warnings, errors } = readConfig(env);
  let push = null;
  if (options.push) {
    const result = readPushConfig(env);
    errors.push(...result.errors);
    push = result.push;
  }
  for (const warning of warnings) console.warn("chirpstack:pull: " + warning);
  if (errors.length) {
    for (const error of errors) console.error("chirpstack:pull: " + error);
    return 1;
  }

  const raw = await pullRaw(config, { hours: options.hours });
  if (env.CHIRPSTACK_MQTT_URL) {
    try {
      const settings = parseMqttUrl(env.CHIRPSTACK_MQTT_URL, env);
      console.log("chirpstack:pull: listening for uplinks for " + options.mqttSeconds + " seconds");
      raw.uplinks = await collectUplinks(settings, { topics: uplinkTopics(config.applicationIds), seconds: options.mqttSeconds });
    } catch (error) {
      console.warn("chirpstack:pull: MQTT skipped. " + redact(error.message, { ...config, token: config.token }));
    }
  }

  const aliasFile = join(dirname(options.out), "aliases.json");
  const { data: full, aliases } = toLiveData(raw, { knownAliases: readAliases(aliasFile) });
  const output = options.hide ? hideTrackerDetails(full) : full;

  const hidden = options.hide ? output : hideTrackerDetails(full);
  if (options.hide || push) {
    const problems = hiddenExportProblems(hidden, full);
    if (problems.length) {
      console.error("chirpstack:pull: stopped. The hidden export still had " + problems.length + " kind(s) of private data: " + problems.join(", ") + ". Nothing was written or pushed.");
      return 1;
    }
  }

  const counts = summarize(full);
  const parts = [
    raw.applicationCount + " application(s)",
    counts.trackers + " tracker(s)",
    counts.online + " online",
    counts.stale + " stale",
    counts.neverSeen + " never seen",
    counts.lowBattery + " low battery",
    counts.noBattery + " with no battery reading",
    counts.uplinks + " uplinks in " + options.hours + "h",
  ];
  if (raw.uplinks) parts.push(raw.uplinks.length + " MQTT uplink(s)", counts.withPosition + " with a position", counts.sos + " SOS");
  if (raw.metricErrors) parts.push(raw.metricErrors + " link-metric read(s) failed");
  console.log("chirpstack:pull: " + parts.join(", ") + ".");

  if (options.dryRun) {
    console.log("chirpstack:pull: dry run, nothing written.");
    return 0;
  }
  writeAtomic(aliasFile, JSON.stringify(aliases, null, 2) + "\n", 0o600);
  writeAtomic(options.out, JSON.stringify(output, null, 2) + "\n", options.hide ? 0o644 : 0o600);
  const where = relative(ROOT, options.out) || options.out;
  console.log(
    "chirpstack:pull: wrote " + where + (options.hide ? " with tracker details hidden." : " with full tracker details. Private: keep it on your own hardware.")
  );
  if (!where.startsWith(".local")) console.warn("chirpstack:pull: that file is outside .local/, so git does not ignore it. Do not commit it.");
  if (push) {
    const result = await pushLive(push, hidden, full);
    if (!result.ok) {
      console.error("chirpstack:pull: push failed with HTTP " + result.status + (result.error ? ": " + result.error : "") + ".");
      return 1;
    }
    console.log("chirpstack:pull: pushed " + result.trackers + " tracker(s), hidden and full, to your Pages copy.");
  }
  return 0;
}

const HELP = `Usage: npm run chirpstack:pull -- [--hide | --no-hide] [--hours=24] [--mqtt-seconds=60] [--out=.local/live.json] [--watch=60] [--push] [--dry-run]

Settings come from the environment (or a .env file in this folder):
  CHIRPSTACK_URL             REST API gateway, default http://localhost:8090
  CHIRPSTACK_API_TOKEN       API token, or put it in the token file below
  CHIRPSTACK_API_TOKEN_FILE  default ~/.config/fibershare/chirpstack-token
  CHIRPSTACK_TENANT_ID       optional, comma separated
  CHIRPSTACK_APPLICATION_ID  optional, comma separated
  CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET  optional, for a Cloudflare Access service token
  CHIRPSTACK_MQTT_URL        optional, such as mqtt://localhost:1883, for decoded uplinks
  CHIRPSTACK_MQTT_USERNAME / CHIRPSTACK_MQTT_PASSWORD  optional
  CHIRPSTACK_ALLOW_HTTP      1 turns off the plain-http warning for a private link
  FIBERSHARE_HIDE_TRACKERS   1 (default) hides tracker details, 0 keeps them.
                             Use 0 for rancher sign-in: the server hides data for the public.
  FIBERSHARE_PUSH_URL        for --push, such as https://<your copy>/api/push
  FIBERSHARE_PUSH_TOKEN      for --push, or FIBERSHARE_PUSH_TOKEN_FILE
                             (default ~/.config/fibershare/push-token)

Keep the file fresh with --watch, for example --watch=120.`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function" && env === process.env) process.loadEnvFile(envFile);
  let options;
  try {
    options = parseArgs(argv, env);
  } catch (error) {
    console.error("chirpstack:pull: " + error.message);
    return 2;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  const run = async () => {
    try {
      return await once(options, env);
    } catch (error) {
      const { config } = readConfig(env);
      console.error("chirpstack:pull: " + redact(error.message, config));
      return 1;
    }
  };
  if (!options.watch) return run();
  for (;;) {
    await run();
    await new Promise((r) => setTimeout(r, options.watch * 1000));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
