// Where rancher answers to alerts are kept.
// - Sample data and the public live view: this browser (localStorage).
// - A signed-in rancher looking at real data: the server, at /api/alerts,
//   behind the same sign-in check as the real data.
import { normalizeFeedback } from "./alerts.js";

export const STORE_KEYS = { demo: "fs-alerts-demo", public: "fs-alerts-public" };
const LOCAL_LIMIT = 300;

export function alertScope(data) {
  if (data?.mode !== "live") return "demo";
  return data.rancher ? "rancher" : "public";
}

function browserStore(storage, key, source) {
  const read = () => {
    try {
      const list = JSON.parse(storage?.getItem(key) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  return {
    scope: source,
    where: "Saved in this browser.",
    async load() {
      return read();
    },
    async add(answer) {
      const checked = normalizeFeedback(answer, { source });
      if (!checked.ok) throw new Error(checked.error);
      const list = [...read(), checked.entry].slice(-LOCAL_LIMIT);
      try {
        storage?.setItem(key, JSON.stringify(list));
      } catch {
        throw new Error("This browser would not save the answer.");
      }
      return list;
    },
  };
}

function serverStore(fetchImpl) {
  const call = async (init) => {
    const res = await fetchImpl("/api/alerts", { credentials: "same-origin", cache: "no-store", ...init });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Sign in again to save answers.");
    if (!res.ok) throw new Error(body.error || "The server did not save the answer.");
    return Array.isArray(body.feedback) ? body.feedback : [];
  };
  return {
    scope: "rancher",
    where: "Saved on the server for signed-in ranchers.",
    load: () => call({ method: "GET" }),
    add: (answer) => call({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(answer) }),
  };
}

export function createAlertStore(scope, { storage = globalThis.localStorage, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (scope === "rancher") return serverStore(fetchImpl);
  return browserStore(storage, scope === "public" ? STORE_KEYS.public : STORE_KEYS.demo, scope === "public" ? "public" : "demo");
}
