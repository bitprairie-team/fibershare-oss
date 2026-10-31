import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { getSession, signIn, signOut } from "./session.js";
import { icon } from "./icons.js";

let session = null;

function mockMap() {
  // A drawing of the rancher map, so this page and the tour work offline.
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
    .map(([x, y]) => '<span class="dot" style="left:' + x + "%;top:" + y + '%"></span>')
    .join("");
  return (
    '<div class="rancher-callout" data-tour="rancher-map">' +
    "<h2>Rancher map</h2>" +
    '<div class="mock-map" role="img" aria-label="Drawing of the rancher map: tracker dots on a basemap, a dashed fire perimeter, and a layer list">' +
    '<span class="zone" style="left:66%;top:12%;width:26%;height:30%"></span>' + dots +
    '<span class="layer-chip"><strong>Layers</strong><span>Wildfire perimeters</span><span>Smoke from satellite</span><span>Federal land ownership</span></span></div>' +
    "<p>After sign-in, trackers appear at their real positions, with map layers from public agencies.</p>" +
    '<p class="fine-print">Drawing only. The live map needs your own trackers.</p>' +
    "</div>"
  );
}

function card(iconName, title, html, kind = "") {
  return '<div class="rancher-callout' + (kind ? " state-" + kind : "") + '">' + "<h2>" + title + "</h2>" + html + "</div>";
}

export async function renderRancher() {
  session = await getSession();
  const error = new URLSearchParams(location.hash.split("?")[1] || "").get("error");
  let body;
  if (session.signedIn) {
    body = card(
      "check",
      "Signed in",
      "<p>The herd view now gets full tracker data from the server. Turn off <strong>Hide tracker details</strong> there to see names, device IDs and positions.</p>" +
        '<div class="cta-row"><a class="btn btn-primary" href="#/map">Open the herd view</a>' +
        (session.mode === "local" ? '<button type="button" class="btn btn-ghost" data-sign-out>Sign out</button>' : "") +
        "</div>" +
        (session.mode === "access" ? '<p class="fine-print">Signed in through Cloudflare Access. Sign out from your Access app launcher.</p>' : ""),
      "ok"
    );
  } else if (session.mode === "local" && session.passphraseSet) {
    body = card(
      "lock",
      "Sign in",
      '<form class="signin" data-sign-in novalidate>' +
        '<label for="passphrase">Rancher passphrase</label>' +
        '<input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required minlength="12" aria-describedby="passphrase-help" />' +
        '<p class="form-error" role="alert" data-error hidden></p>' +
        '<button type="submit" class="btn btn-primary">Sign in</button>' +
        '<p class="fine-print" id="passphrase-help">The server checks the passphrase and sets a session cookie for 12 hours.</p>' +
        "</form>"
    );
  } else if (session.mode === "local") {
    body = card(
      "lock",
      "No passphrase set",
      "<p>Set a rancher passphrase on the machine that runs this server, then reload this page.</p>" +
        "<pre><code>npm run rancher:passphrase</code></pre>",
      "warn"
    );
  } else if (session.mode === "access") {
    body = card(
      "lock",
      "Sign in with Cloudflare Access",
      "<p>Sign in with an account your Access policy allows.</p>" +
        (error === "access" ? '<p class="form-error" role="alert">' + icon("alert", { size: 16 }) + "<span>Access refused that sign-in. Check the policy and try again.</span></p>" : "") +
        '<div class="cta-row"><a class="btn btn-primary" href="' + esc(session.loginUrl || "/api/rancher/login") + '">Sign in with Cloudflare Access</a></div>'
    );
  } else if (session.noServer) {
    body = card(
      "wifiOff",
      "No sign-in server",
      "<p>The sign-in server is not running. The rest of the demo works without it. Start it with <code>npm run dev</code> or <code>npm run serve:local</code>.</p>" +
        '<div class="cta-row"><button type="button" class="btn btn-ghost" data-retry>Try again</button></div>',
      "warn"
    );
  } else {
    body = card(
      "info",
      "Sign-in not set up",
      "<p>Everyone sees the hidden view on this copy. To add sign-in, run <code>npm run rancher:passphrase</code> on your own hardware, or set up Cloudflare Access on Pages as in docs/rancher-access.md.</p>"
    );
  }
  return (
    nav("/rancher") +
    '<main class="wrap" id="main">' +
    '<section class="page-head"><h1>Rancher sign-in</h1>' +
    '<p class="lede">Public visitors see trackers without names, device IDs or positions. A signed-in rancher sees the full data. The server checks the session on every request.</p></section>' +
    '<div class="rancher-grid">' + body + mockMap() + "</div>" +
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
