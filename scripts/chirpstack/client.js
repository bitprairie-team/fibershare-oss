// A small client for the ChirpStack v4 REST API, as served by the
// REST API gateway. It uses only GET requests.
//
// Built against the documented API (api/proto/api/*.proto in the ChirpStack
// repository and the grpc-gateway JSON mapping). Field names were checked
// against one real server. See docs/chirpstack.md for what is not verified.

const PAGE = 100;

export class ChirpStackError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ChirpStackError";
    this.status = status;
  }
}

/** Request headers. The token goes in Grpc-Metadata-Authorization. */
export function buildHeaders(config) {
  const headers = {
    Accept: "application/json",
    "Grpc-Metadata-Authorization": "Bearer " + config.token,
  };
  if (config.accessId && config.accessSecret) {
    headers["CF-Access-Client-Id"] = config.accessId;
    headers["CF-Access-Client-Secret"] = config.accessSecret;
  }
  return headers;
}

/** Remove every secret from a piece of text before it is shown. */
export function redact(text, config) {
  let out = String(text ?? "");
  for (const secret of [config.token, config.accessId, config.accessSecret]) {
    if (secret) out = out.split(secret).join("[hidden]");
  }
  return out;
}

export function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function createClient(config, fetchImpl = globalThis.fetch) {
  const headers = buildHeaders(config);

  async function get(path, query) {
    let response;
    try {
      response = await fetchImpl(buildUrl(config.baseUrl, path, query), { headers, redirect: "manual" });
    } catch (error) {
      throw new ChirpStackError("Could not reach the ChirpStack REST API: " + redact(error?.cause?.code || error?.message || "network error", config), 0);
    }
    const type = response.headers?.get?.("content-type") || "";
    if (response.status >= 300 && response.status < 400) {
      throw new ChirpStackError(
        "The server sent a redirect, most likely to a sign-in page. If the host sits behind Cloudflare Access, set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET for a service token.",
        response.status
      );
    }
    const text = await response.text();
    if (!type.includes("json")) {
      throw new ChirpStackError(
        "Expected JSON from " + path.split("/").slice(0, 3).join("/") + " but got " + (type.split(";")[0] || "no content type") + ". Check CHIRPSTACK_URL points at the REST API gateway, not the ChirpStack web UI.",
        response.status
      );
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ChirpStackError("The REST API sent JSON that did not parse.", response.status);
    }
    if (!response.ok) {
      const code = body && Number.isFinite(body.code) ? " (gRPC code " + body.code + ")" : "";
      const hint = body?.code === 16 ? " Check the API token." : body?.code === 7 ? " The token may not have access to this tenant or application." : "";
      throw new ChirpStackError(
        "ChirpStack answered " + response.status + code + ": " + redact(String(body?.message || "no message"), config).slice(0, 200) + "." + hint,
        response.status
      );
    }
    return body;
  }

  /** Read every page of a list endpoint. */
  async function listAll(path, query = {}) {
    const items = [];
    // Step by what came back, so a server that caps the page size still
    // gets read to the end. Stop on an empty page or once totalCount is met.
    for (let offset = 0, pages = 0; pages < 1000; pages += 1) {
      const body = await get(path, { ...query, limit: PAGE, offset });
      const result = Array.isArray(body?.result) ? body.result : [];
      items.push(...result);
      offset += result.length;
      const total = Number(body?.totalCount);
      if (!result.length || (Number.isFinite(total) ? items.length >= total : result.length < PAGE)) break;
    }
    return items;
  }

  return { get, listAll };
}

/**
 * Read devices and their link metrics. The result is raw ChirpStack data and
 * must go through toLiveData before it is written anywhere.
 */
export async function pullRaw(config, { fetchImpl, now = new Date(), hours = 24 } = {}) {
  const client = createClient(config, fetchImpl);
  let applicationIds = config.applicationIds;
  if (!applicationIds.length) {
    let tenantIds = config.tenantIds;
    if (!tenantIds.length) {
      const tenants = await client.listAll("/api/tenants");
      tenantIds = tenants.map((tenant) => tenant.id).filter(Boolean);
    }
    applicationIds = [];
    for (const tenantId of tenantIds) {
      const apps = await client.listAll("/api/applications", { tenantId });
      applicationIds.push(...apps.map((app) => app.id).filter(Boolean));
    }
  }

  const seen = new Set();
  const devices = [];
  for (const applicationId of applicationIds) {
    for (const device of await client.listAll("/api/devices", { applicationId })) {
      const eui = String(device?.devEui || "").toLowerCase();
      if (!eui || seen.has(eui)) continue;
      seen.add(eui);
      devices.push(device);
    }
  }

  const end = new Date(now);
  const start = new Date(end.getTime() - hours * 3600000);
  const linkMetrics = {};
  let metricErrors = 0;
  for (const device of devices) {
    try {
      linkMetrics[device.devEui] = await client.get("/api/devices/" + encodeURIComponent(device.devEui) + "/link-metrics", {
        start: start.toISOString(),
        end: end.toISOString(),
        aggregation: "HOUR",
      });
    } catch (error) {
      if (error instanceof ChirpStackError && error.status === 0) throw error;
      metricErrors += 1;
    }
  }
  return { applicationCount: applicationIds.length, devices, linkMetrics, metricErrors, now: end.toISOString(), hours };
}
