// A made-up full live file built from the fake ChirpStack replies. Nothing
// here is real. Used by the rancher sign-in tests.
import { pullRaw } from "../../scripts/chirpstack/client.js";
import { parseUplinkEvent } from "../../scripts/chirpstack/mqtt.js";
import { toLiveData } from "../../scripts/chirpstack/map.js";
import { FAKE_TOKEN, NOW, fakeFetch, uplinkEvent } from "./chirpstack.js";

export async function fakeFullLive() {
  const config = { baseUrl: "http://localhost:8090", token: FAKE_TOKEN, tenantIds: [], applicationIds: [] };
  const raw = await pullRaw(config, { fetchImpl: fakeFetch(), now: new Date(NOW) });
  raw.uplinks = [1, 3].map((n) => parseUplinkEvent(uplinkEvent(n).topic, JSON.stringify(uplinkEvent(n).payload)));
  return toLiveData(raw).data;
}
