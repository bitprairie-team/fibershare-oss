// Made-up ChirpStack v4 REST and MQTT replies, in the same shapes as a real
// server. Every value is fake. DevEUIs, IDs, and positions are built at run
// time so no ID-like or coordinate-like literal sits in a committed file.

const hex = (n, width) => n.toString(16).padStart(width, "0");

export const FAKE_TOKEN = "fake-token-" + "x".repeat(24);
export const NOW = "2026-09-06T18:00:00.000Z";

export function fakeEui(n) {
  return hex(0xf00d0000 + n, 16);
}

export function fakeUuid(n) {
  return [hex(n, 8), "0000", "4000", "8000", hex(n, 12)].join("-");
}

export const tenants = {
  totalCount: 1,
  result: [{ id: fakeUuid(1), name: "Fake tenant", canHaveGateways: true, privateGatewaysUp: false, privateGatewaysDown: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
};

export const applications = {
  totalCount: 2,
  result: [
    { id: fakeUuid(11), name: "Fake app north", description: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: fakeUuid(12), name: "Fake app south", description: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ],
};

const PROFILE = "Fake tracker profile";

function device(n, { batteryLevel, lastSeenAt, external = false, description = "", tags = {} }) {
  return {
    devEui: fakeEui(n),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastSeenAt,
    name: "Fake collar " + n,
    description,
    deviceProfileId: fakeUuid(100),
    deviceProfileName: PROFILE,
    deviceStatus: batteryLevel === undefined ? null : { marginDb: 7, externalPowerSource: external, batteryLevel },
    tags,
  };
}

// 8 trackers across 2 applications, with a low battery, a stale tracker,
// one never seen, one with no battery reading, and one on external power.
export const devicesByApp = {
  [fakeUuid(11)]: [
    device(1, { batteryLevel: 88, lastSeenAt: "2026-09-06T17:50:00Z", description: "Fake note about collar one", tags: { herd: "fake-herd-north" } }),
    device(2, { batteryLevel: 12, lastSeenAt: "2026-09-06T17:40:00Z" }),
    device(3, { batteryLevel: -1, lastSeenAt: "2026-09-06T17:30:00Z" }),
    device(4, { batteryLevel: 64, lastSeenAt: "2026-09-06T09:00:00Z" }),
  ],
  [fakeUuid(12)]: [
    device(5, { batteryLevel: 100, lastSeenAt: "2026-09-06T17:55:00Z", external: true }),
    device(6, { batteryLevel: undefined, lastSeenAt: "2026-09-06T17:20:00Z" }),
    device(7, { batteryLevel: 40, lastSeenAt: null }),
    device(8, { batteryLevel: 73, lastSeenAt: "2026-09-06T17:45:00Z", tags: { color: "fake-blue" } }),
  ],
};

function metric(name, data) {
  const times = data.map((_, i) => new Date(Date.parse(NOW) - (data.length - i) * 3600000).toISOString());
  return { name, timestamps: times, datasets: [{ label: name, data }], kind: "ABSOLUTE" };
}

export function linkMetrics(n) {
  const packets = n === 7 ? [0, 0, 0] : [2, 0, 3];
  const snr = n === 2 ? [-12, 0, -11] : n === 3 ? [-3, 0, -4] : [6, 0, 7];
  return {
    rxPackets: metric("rx_packets", packets),
    gwRssi: metric("gw_rssi", packets.map((p) => (p ? -90 : 0))),
    gwSnr: metric("gw_snr", snr),
    rxPacketsPerFreq: { name: "rx_packets_per_freq", timestamps: [], datasets: [], kind: "ABSOLUTE" },
    rxPacketsPerDr: { name: "rx_packets_per_dr", timestamps: [], datasets: [], kind: "ABSOLUTE" },
    errors: { name: "errors", timestamps: [], datasets: [], kind: "ABSOLUTE" },
  };
}

export const allDevices = Object.values(devicesByApp).flat();

/** A fake fetch that answers like the REST API gateway. */
export function fakeFetch({ token = FAKE_TOKEN, calls = [], pageSize } = {}) {
  return async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, headers: init.headers });
    const reply = (status, body) => ({
      ok: status < 300,
      status,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(body),
    });
    if (init.headers["Grpc-Metadata-Authorization"] !== "Bearer " + token) {
      return reply(401, { code: 16, message: "no authorization provided" });
    }
    const limit = Number(u.searchParams.get("limit"));
    const offset = Number(u.searchParams.get("offset") || 0);
    const page = (body) => {
      // Without limit the gateway only sends totalCount.
      if (!limit) return { totalCount: body.totalCount, result: [] };
      const size = Math.min(limit, pageSize || limit);
      return { totalCount: body.totalCount, result: body.result.slice(offset, offset + size) };
    };
    if (u.pathname === "/api/tenants") return reply(200, page(tenants));
    if (u.pathname === "/api/applications") return reply(200, page(applications));
    if (u.pathname === "/api/devices") {
      const list = devicesByApp[u.searchParams.get("applicationId")] || [];
      return reply(200, page({ totalCount: list.length, result: list }));
    }
    const m = /^\/api\/devices\/([^/]+)\/link-metrics$/.exec(u.pathname);
    if (m) {
      const n = allDevices.findIndex((d) => d.devEui === m[1]) + 1;
      return n ? reply(200, linkMetrics(n)) : reply(404, { code: 5, message: "object does not exist" });
    }
    return reply(404, { code: 5, message: "not found" });
  };
}

/** A fake position, built from numbers so no coordinate literal is committed. */
export function fakePosition(n) {
  return { latitude: 10 + n / 1000 + 0.00012, longitude: 20 + n / 1000 + 0.00034 };
}

/** A fake ChirpStack JSON uplink event, reading-list style decoded object. */
export function uplinkEvent(n, { time = "2026-09-06T17:58:00Z", sos = false, withPosition = true } = {}) {
  const pos = fakePosition(n);
  const readings = [
    ...(withPosition
      ? [
          { measurementId: "4197", measurementValue: pos.longitude, type: "Longitude" },
          { measurementId: "4198", measurementValue: pos.latitude, type: "Latitude" },
        ]
      : []),
    { measurementId: "4097", measurementValue: 21.46, type: "Air Temperature" },
    { measurementId: "4199", measurementValue: 312, type: "Light" },
    { measurementId: "3000", measurementValue: 77, type: "Battery" },
    { measurementId: "4200", measurementValue: 2, type: "Motion Id" },
  ];
  return {
    topic: "application/" + fakeUuid(11) + "/device/" + fakeEui(n) + "/event/up",
    payload: {
      deduplicationId: fakeUuid(500 + n),
      time,
      deviceInfo: {
        tenantId: fakeUuid(1),
        tenantName: "Fake tenant",
        applicationId: fakeUuid(11),
        applicationName: "Fake app north",
        deviceProfileId: fakeUuid(100),
        deviceProfileName: PROFILE,
        deviceName: "Fake collar " + n,
        devEui: fakeEui(n),
        tags: {},
      },
      devAddr: hex(n, 8),
      fCnt: 10 + n,
      fPort: 5,
      data: "AAAA",
      object: { err: 0, valid: true, payload: "", messages: [readings, ...(sos ? [[{ type: "SOS", measurementValue: 1 }]] : [])] },
      rxInfo: [
        { gatewayId: hex(0xbeef, 16).replace(/^0/, "a"), rssi: -95, snr: 4.5, location: { latitude: 1 + n / 7, longitude: 2 + n / 7 } },
        { gatewayId: "fake-receiver", rssi: -101, snr: -2 },
      ],
    },
  };
}
