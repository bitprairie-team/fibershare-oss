// Rancher sign-in, from the browser's side. The browser never decides what
// data it gets: the server checks the session and sends hidden or full data.

async function call(method, body) {
  const response = await fetch("/api/session", {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) throw new Error("no api");
  return { status: response.status, body: await response.json() };
}

/** { mode: "local" | "access" | "none", signedIn, passphraseSet?, loginUrl? } */
export async function getSession() {
  try {
    const { body } = await call("GET");
    return body && typeof body.mode === "string" ? body : { mode: "none", signedIn: false };
  } catch {
    return { mode: "none", signedIn: false, noServer: true };
  }
}

export async function signIn(passphrase) {
  const { status, body } = await call("POST", { passphrase });
  return { ok: status === 200 && body.signedIn === true, error: body.error };
}

export async function signOut() {
  await call("DELETE");
}
