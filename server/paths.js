// Where the local server keeps its private files. All under .local/, which
// git ignores and the build never copies.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LIVE_FILE = join(ROOT, ".local", "live.json");
export const RANCHER_FILE = join(ROOT, ".local", "rancher.json");
export const ALERTS_FILE = join(ROOT, ".local", "alert-feedback.json");
