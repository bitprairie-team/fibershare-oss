// What GET /api/live sends. Shared by the local server and the Pages Function,
// so the rule is written once: only a signed-in rancher gets full data.
import { hideTrackerDetails, isLiveData } from "../src/live-format.js";

export const NO_STORE = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  Vary: "Cookie, Cf-Access-Jwt-Assertion",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Build the /api/live body.
 *   live: the parsed live file, full or hidden, or null
 *   rancher: true only after the server checked the session
 *   arcgisApiKey: optional, sent only to a signed-in rancher
 */
export function liveBody({ live, rancher, arcgisApiKey }) {
  if (!isLiveData(live)) return { view: rancher ? "rancher" : "public", live: null };
  if (!rancher) return { view: "public", live: live.hidden === false ? hideTrackerDetails(live) : live };
  const body = { view: "rancher", live };
  const key = typeof arcgisApiKey === "string" ? arcgisApiKey.trim() : "";
  if (key) body.arcgisApiKey = key;
  return body;
}
