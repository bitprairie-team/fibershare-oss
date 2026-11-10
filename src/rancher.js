import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { getSession, signIn, signOut } from "./session.js";
import { icon } from "./icons.js";
import { ACTIONS, HEAD, LEDE, MAIN } from "./ui.js";

let session = null;

const BLOCK = "rancher-callout border-t border-ink pt-5 [&_p]:text-ink-2 [&>*+*]:mt-4";
const HEADING = "text-xl";

function mockMap() {
  // A flat drawing of the rancher map, so this page and the tour work offline.
  // The shapes and dots are made up. No real place or position.
  const dots = [
    [38, 42],
    [44, 48],
    [41, 55],
    [52, 46],
    [57, 58],
    [48, 62],
    [62, 50],
    [35, 60],
  ]
    .map(([x, y]) => '<circle cx="' + x * 1.6 + '" cy="' + y + '" r="1.9" class="fill-leather stroke-surface" stroke-width=".7" />')
    .join("");
  return (
    '<div class="' + BLOCK + '" data-tour="rancher-map">' +
    '<h2 class="' + HEADING + '">Rancher map</h2>' +
    '<div class="mock-map relative overflow-hidden rounded-sm border border-rule bg-band" role="img" aria-label="Drawing of the rancher map: tracker dots on a basemap, a dashed fire perimeter, and a layer list">' +
    '<svg viewBox="0 0 160 100" class="block aspect-[16/10] w-full" aria-hidden="true" focusable="false">' +
    '<path d="M0 72 C30 64 52 78 80 70 S130 52 160 58 V100 H0Z" class="fill-band-2" />' +
    '<path d="M0 30 C40 40 70 24 104 36 S150 30 160 26" class="fill-none stroke-rule-strong" stroke-width=".6" />' +
    '<path d="M18 100 C30 80 60 84 76 64 S118 40 128 0" class="fill-none stroke-info" stroke-width="1.4" opacity=".55" />' +
    '<path d="M108 14 C122 10 146 14 148 26 S140 44 126 42 S104 30 108 14Z" class="fill-alert-soft stroke-alert" stroke-width=".8" stroke-dasharray="2.4 1.6" />' +
    dots + "</svg>" +
    '<p class="absolute top-2 left-2 m-0 grid gap-0.5 rounded-sm border border-rule bg-surface px-3 py-2 text-xs !text-ink max-sm:static max-sm:rounded-none max-sm:border-0 max-sm:border-t"><strong>Layers</strong><span>Wildfire perimeters</span><span>Smoke from satellite</span><span>Federal land ownership</span></p></div>' +
    "<p>After sign-in, trackers appear at their real positions, with map layers from public agencies.</p>" +
    '<p class="text-sm !text-muted">Drawing only. The live map needs your own trackers.</p>' +
    "</div>"
  );
}

function card(title, html) {
  return '<div class="' + BLOCK + '"><h2 class="' + HEADING + '">' + title + "</h2>" + html + "</div>";
}

const NOTE = "text-sm !text-muted";

export async function renderRancher() {
  session = await getSession();
  const error = new URLSearchParams(location.hash.split("?")[1] || "").get("error");
  let body;
  if (session.signedIn) {
    body = card(
      "Signed in",
      "<p>The herd view now gets full tracker data from the server. Turn off <strong>Hide tracker details</strong> there to see names, device IDs and positions.</p>" +
        '<div class="' + ACTIONS + '"><a class="btn btn-primary" href="#/map">Open the herd view</a>' +
        (session.mode === "local" ? '<button type="button" class="btn btn-ghost" data-sign-out>Sign out</button>' : "") +
        "</div>" +
        (session.mode === "access" ? '<p class="' + NOTE + '">Signed in through Cloudflare Access. Sign out from your Access app launcher.</p>' : "")
    );
  } else if (session.mode === "local" && session.passphraseSet) {
    body = card(
      "Sign in",
      '<form class="grid max-w-form gap-2" data-sign-in novalidate>' +
        '<label class="text-sm font-semibold" for="passphrase">Rancher passphrase</label>' +
        '<input class="input" id="passphrase" name="passphrase" type="password" autocomplete="current-password" required minlength="12" aria-describedby="passphrase-help" />' +
        '<p class="form-error" role="alert" data-error hidden></p>' +
        '<button type="submit" class="btn btn-primary mt-2 justify-self-start">Sign in</button>' +
        '<p class="' + NOTE + '" id="passphrase-help">The server checks the passphrase and sets a session cookie for 12 hours.</p>' +
        "</form>"
    );
  } else if (session.mode === "local") {
    body = card(
      "No passphrase set",
      "<p>Set a rancher passphrase on the machine that runs this server, then reload this page.</p>" +
        "<pre><code>npm run rancher:passphrase</code></pre>"
    );
  } else if (session.mode === "access") {
    body = card(
      "Sign in with Cloudflare Access",
      "<p>Sign in with an account your Access policy allows.</p>" +
        (error === "access" ? '<p class="form-error" role="alert">' + icon("alert", { size: 16 }) + "<span>Access refused that sign-in. Check the policy and try again.</span></p>" : "") +
        '<div class="' + ACTIONS + '"><a class="btn btn-primary" href="' + esc(session.loginUrl || "/api/rancher/login") + '">Sign in with Cloudflare Access</a></div>'
    );
  } else if (session.noServer) {
    body = card(
      "No sign-in server",
      "<p>The sign-in server is not running. The rest of the demo works without it. Start it with <code>npm run dev</code> or <code>npm run serve:local</code>.</p>" +
        '<div class="' + ACTIONS + '"><button type="button" class="btn btn-ghost" data-retry>Try again</button></div>'
    );
  } else {
    body = card(
      "Sign-in not set up",
      "<p>Everyone sees the hidden view on this copy. To add sign-in, run <code>npm run rancher:passphrase</code> on your own hardware, or set up Cloudflare Access on Pages as in docs/rancher-access.md.</p>"
    );
  }
  return (
    nav("/rancher") +
    '<main class="' + MAIN + '" id="main">' +
    '<section class="' + HEAD + '"><h1>Rancher sign-in</h1>' +
    '<p class="' + LEDE + '">Sign in to see your trackers with real names, device IDs and positions. Public visitors see them hidden.</p></section>' +
    '<div class="grid items-start gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">' + body + mockMap() + "</div>" +
    "</main>" +
    footer()
  );
}

export function bindRancher(root) {
  const form = root.querySelector("[data-sign-in]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const out = form.querySelector("[data-error]");
    const button = form.querySelector("button[type=submit]");
    const input = form.passphrase;
    const fail = (text) => {
      out.innerHTML = icon("alert", { size: 16 }) + "<span></span>";
      out.querySelector("span").textContent = text;
      out.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "passphrase-help " + (out.id || (out.id = "passphrase-error")));
      input.focus();
    };
    if (input.value.length < 12) {
      fail("The passphrase is at least 12 characters.");
      return;
    }
    out.hidden = true;
    input.removeAttribute("aria-invalid");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const result = await signIn(form.passphrase.value);
      if (result.ok) {
        location.hash = "#/map";
        return;
      }
      fail(result.error || "That passphrase did not work. Check it and try again.");
    } catch {
      fail("The server did not answer. Check that it is running, then try again.");
    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
      form.passphrase.value = "";
    }
  });
  root.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    await signOut().catch(() => {});
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
