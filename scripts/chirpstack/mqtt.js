// A small MQTT 3.1.1 subscriber with no dependencies, for ChirpStack uplink
// events. It connects, subscribes at QoS 0, collects messages for a while,
// and disconnects. It does not publish.
//
// ChirpStack v4 publishes each uplink on
//   application/<applicationId>/device/<devEui>/event/up
// as JSON when the MQTT integration uses the default JSON marshaler.
import net from "node:net";
import tls from "node:tls";

const CONNECT = 1;
const CONNACK = 2;
const PUBLISH = 3;
const SUBSCRIBE = 8;
const SUBACK = 9;
const PINGREQ = 12;
const DISCONNECT = 14;

function remainingLength(length) {
  const bytes = [];
  do {
    let byte = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) byte |= 0x80;
    bytes.push(byte);
  } while (length > 0);
  return Buffer.from(bytes);
}

function str(value) {
  const body = Buffer.from(String(value), "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length);
  return Buffer.concat([len, body]);
}

function packet(type, flags, body) {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), remainingLength(body.length), body]);
}

export function connectPacket({ clientId, username, password, keepalive = 30 }) {
  let flags = 0x02; // clean session
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const keep = Buffer.alloc(2);
  keep.writeUInt16BE(keepalive);
  const parts = [str("MQTT"), Buffer.from([4, flags]), keep, str(clientId)];
  if (username) parts.push(str(username));
  if (password) parts.push(str(password));
  return packet(CONNECT, 0, Buffer.concat(parts));
}

export function subscribePacket(packetId, topics) {
  const id = Buffer.alloc(2);
  id.writeUInt16BE(packetId);
  const parts = [id];
  for (const topic of topics) parts.push(str(topic), Buffer.from([0]));
  return packet(SUBSCRIBE, 0x02, Buffer.concat(parts));
}

/** Split a byte stream into MQTT packets. Returns { packets, rest }. */
export function readPackets(buffer) {
  const packets = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    let multiplier = 1;
    let length = 0;
    let i = offset + 1;
    let byte;
    do {
      if (i >= buffer.length) return { packets, rest: buffer.subarray(offset) };
      byte = buffer[i];
      length += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      i += 1;
    } while (byte & 0x80);
    if (i + length > buffer.length) break;
    packets.push({ type: buffer[offset] >> 4, flags: buffer[offset] & 0x0f, body: buffer.subarray(i, i + length) });
    offset = i + length;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export function parsePublish(flags, body) {
  const topicLength = body.readUInt16BE(0);
  const topic = body.subarray(2, 2 + topicLength).toString("utf8");
  const qos = (flags >> 1) & 0x03;
  const start = 2 + topicLength + (qos > 0 ? 2 : 0);
  return { topic, payload: body.subarray(start) };
}

/** Topics for uplink events, for every application or the ones given. */
export function uplinkTopics(applicationIds = []) {
  return applicationIds.length
    ? applicationIds.map((id) => "application/" + id + "/device/+/event/up")
    : ["application/+/device/+/event/up"];
}

function best(values) {
  const picked = values.filter((v) => Number.isFinite(v));
  return picked.length ? Math.max(...picked) : null;
}

/**
 * Read one ChirpStack JSON uplink event. Keeps the DevEUI, time, device name,
 * tags, the decoded object, and the best RSSI and SNR across radio receivers.
 * Receiver IDs and receiver positions in rxInfo are not kept.
 */
export function parseUplinkEvent(topic, payload) {
  const match = /^application\/[^/]+\/device\/([^/]+)\/event\/up$/.exec(topic);
  if (!match) return null;
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload));
  } catch {
    return null;
  }
  if (!event || typeof event !== "object") return null;
  const info = event.deviceInfo || {};
  const rx = Array.isArray(event.rxInfo) ? event.rxInfo : [];
  return {
    devEui: String(info.devEui || match[1]),
    time: typeof event.time === "string" ? event.time : new Date().toISOString(),
    deviceName: typeof info.deviceName === "string" ? info.deviceName : null,
    tags: info.tags && typeof info.tags === "object" ? info.tags : {},
    object: event.object && typeof event.object === "object" ? event.object : null,
    rssi: best(rx.map((r) => Number(r.rssi))),
    snr: best(rx.map((r) => Number(r.snr))),
  };
}

/** Read connection settings from an mqtt:// or mqtts:// URL. */
export function parseMqttUrl(value, env = {}) {
  const url = new URL(value);
  if (url.protocol !== "mqtt:" && url.protocol !== "mqtts:") throw new Error("CHIRPSTACK_MQTT_URL must start with mqtt:// or mqtts://");
  return {
    secure: url.protocol === "mqtts:",
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "mqtts:" ? 8883 : 1883),
    username: decodeURIComponent(url.username) || env.CHIRPSTACK_MQTT_USERNAME || "",
    password: decodeURIComponent(url.password) || env.CHIRPSTACK_MQTT_PASSWORD || "",
  };
}

/**
 * Connect, subscribe, and collect uplink events for `seconds`.
 * Resolves with the parsed events. Rejects if the broker refuses the login.
 */
export function collectUplinks(settings, { topics, seconds = 60, connect, clientId } = {}) {
  const open =
    connect ||
    ((opts, onConnect) =>
      opts.secure ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host }, onConnect) : net.connect({ host: opts.host, port: opts.port }, onConnect));
  return new Promise((resolve, reject) => {
    const events = [];
    let buffer = Buffer.alloc(0);
    let done = false;
    let timer = null;
    let ping = null;
    let acked = false;
    const socket = open(settings, () => {
      socket.write(
        connectPacket({
          clientId: clientId || "fibershare-pull-" + Math.random().toString(36).slice(2, 10),
          username: settings.username,
          password: settings.password,
        })
      );
    });
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(ping);
      try {
        socket.write(packet(DISCONNECT, 0, Buffer.alloc(0)));
      } catch {
        // The socket may already be closed.
      }
      socket.end();
      if (error) reject(error);
      else resolve(events);
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = readPackets(buffer);
      buffer = rest;
      for (const p of packets) {
        if (p.type === CONNACK) {
          const code = p.body[1];
          if (code !== 0) {
            finish(new Error("The MQTT broker refused the connection (code " + code + "). Check the MQTT user name and password."));
            return;
          }
          acked = true;
          socket.write(subscribePacket(1, topics || uplinkTopics()));
          timer = setTimeout(() => finish(), seconds * 1000);
          ping = setInterval(() => socket.write(packet(PINGREQ, 0, Buffer.alloc(0))), 20000);
        } else if (p.type === SUBACK) {
          if ([...p.body.subarray(2)].some((b) => b === 0x80)) finish(new Error("The MQTT broker refused the subscription. Check the topic access for this user."));
        } else if (p.type === PUBLISH) {
          const { topic, payload } = parsePublish(p.flags, p.body);
          const event = parseUplinkEvent(topic, payload);
          if (event) events.push(event);
        }
      }
    });
    socket.on("error", (error) => finish(new Error("Could not reach the MQTT broker: " + (error.code || "connection error"))));
    socket.on("close", () => finish(acked ? undefined : new Error("The MQTT broker closed the connection before it was ready.")));
  });
}
