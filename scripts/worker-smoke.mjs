// Smoke-test the Worker under `wrangler dev`.
// Pages return HTML. Unsigned /api/log is 401. A JWT signed with ACCESS_CERTS is accepted.
import { createSign, generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const port = process.env.WORKER_PORT || "8787";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
jwk.kid = "smoke";
jwk.alg = "RS256";
jwk.use = "sig";
const certs = Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64");
writeFileSync(
  ".dev.vars",
  ["ACCESS_TEAM_DOMAIN=access.test", "ACCESS_AUD=aud-smoke", `ACCESS_CERTS=${certs}`, ""].join("\n"),
);

const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "smoke", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(
  JSON.stringify({
    iss: "https://access.test",
    aud: ["aud-smoke"],
    exp: now + 600,
    nbf: now - 10,
    iat: now,
    email: "rancher@example.com",
    sub: "smoke",
  }),
).toString("base64url");
const data = `${header}.${payload}`;
const signature = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
const token = `${data}.${signature}`;

const child = spawn("npx", ["--yes", "wrangler@4", "dev", "--port", port, "--ip", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
  detached: true,
});
let log = "";
child.stdout.on("data", (buf) => { log += buf; });
child.stderr.on("data", (buf) => { log += buf; });

const base = `http://127.0.0.1:${port}`;
async function ready() {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    try {
      const response = await fetch(base + "/");
      if (response.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler dev did not answer\n" + log.slice(-2000));
}

function stop() {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

try {
  await ready();
  const home = await fetch(base + "/");
  if (home.status !== 200 || !(await home.text()).includes("<title>")) throw new Error("home page");
  const missing = await fetch(base + "/no-such-page");
  const missingBody = await missing.text();
  if (missing.status !== 404) throw new Error("404 status " + missing.status);
  if (!missingBody.includes("That address is not in this demo.")) throw new Error("404 body empty or wrong: " + missingBody.slice(0, 180));
  const rancher = await fetch(base + "/rancher?error=That%20passphrase%20did%20not%20match.");
  const rancherBody = await rancher.text();
  if (!rancherBody.includes("That passphrase did not match.")) throw new Error("error not decoded");
  if (rancherBody.includes("%20")) throw new Error("percent encoding left in the error");
  const unsigned = await fetch(base + "/api/log");
  if (unsigned.status !== 401) throw new Error("unsigned /api/log status " + unsigned.status);
  const signed = await fetch(base + "/api/log", {
    headers: {
      "cf-access-jwt-assertion": token,
      origin: base,
    },
  });
  if (signed.status !== 200) throw new Error("signed /api/log status " + signed.status + " " + (await signed.text()));
  const posted = await fetch(base + "/api/log", {
    method: "POST",
    headers: {
      "cf-access-jwt-assertion": token,
      origin: base,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "note", animalId: "bramble", text: "Smoke note", author: "ignored" }),
  });
  const body = await posted.json();
  if (posted.status !== 200) throw new Error("post log " + posted.status + " " + JSON.stringify(body));
  const entries = body.entries || body.log || body;
  const text = JSON.stringify(entries);
  if (!text.includes("rancher@example.com")) throw new Error("author was not the verified email: " + text.slice(0, 400));
  if (text.includes("\"author\":\"ignored\"")) throw new Error("client author was kept");
  console.log("worker smoke ok");
  stop();
  setTimeout(() => process.exit(0), 300);
} catch (error) {
  stop();
  console.error(error);
  setTimeout(() => process.exit(1), 300);
}
