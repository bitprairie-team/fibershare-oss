import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { getSession, signIn, signOut } from "./session.js";

let session = null;

export async function renderRancher() {
  session = await getSession();
  const error = new URLSearchParams(location.hash.split("?")[1] || "").get("error");
  let body;
  if (session.signedIn) {
    body =
      '<div class="rancher-callout"><p><span class="badge badge-private">Signed in as the rancher</span></p>' +
      "<p>The herd view now gets full tracker data from the server: real names, device IDs, and positions on a real map. Turn off <strong>Hide tracker details</strong> there to see them.</p>" +
      '<div class="cta-row"><a class="btn btn-primary" href="#/map">Open the herd view</a>' +
      (session.mode === "local" ? '<button type="button" class="btn btn-ghost" data-sign-out>Sign out</button>' : "") +
      "</div>" +
      (session.mode === "access" ? '<p class="fine-print">Signed in through Cloudflare Access. Sign out from your Access app launcher.</p>' : "") +
      "</div>";
  } else if (session.mode === "local") {
    body = session.passphraseSet
      ? '<form class="signin" data-sign-in>' +
        '<label for="passphrase">Rancher passphrase</label>' +
        '<input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required minlength="12" />' +
        '<button type="submit" class="btn btn-primary">Sign in</button>' +
        '<p class="form-error" role="alert" data-error hidden></p>' +
        '<p class="fine-print">The server on your own hardware checks the passphrase and sets a session cookie the page cannot read. It lasts 12 hours.</p>' +
        "</form>"
      : '<div class="rancher-callout"><p>No rancher passphrase is set on this server yet. On the hardware that runs it:</p>' +
        "<pre><code>npm run rancher:passphrase</code></pre><p>Then reload this page.</p></div>";
  } else if (session.mode === "access") {
    body =
      '<div class="rancher-callout"><p>This copy uses Cloudflare Access. Sign in with the account your Access policy allows.</p>' +
      (error === "access" ? '<p class="form-error" role="alert">Access did not let that sign-in through. Check the policy and try again.</p>' : "") +
      '<div class="cta-row"><a class="btn btn-primary" href="' + esc(session.loginUrl || "/api/rancher/login") + '">Sign in with Cloudflare Access</a></div></div>';
  } else {
    body =
      '<div class="rancher-callout"><p>Rancher sign-in is not set up on this copy, so everyone sees the hidden view.</p>' +
      "<p>On your own hardware, run <code>npm run rancher:passphrase</code>, then <code>npm run dev</code> or <code>npm run serve:local</code>. On Cloudflare Pages, set up Access as in docs/rancher-access.md.</p></div>";
  }
  return (
    nav("/rancher") +
    '<main class="wrap" id="main">' +
    '<section class="page-head"><h1>Rancher sign-in</h1>' +
    '<p class="lede">The public sees trackers with hidden details: aliases, hashed grid cells, no device IDs or positions. A signed-in rancher gets the real data, checked by the server on every request.</p></section>' +
    body +
    "</main>" +
    footer()
  );
}

export function bindRancher(root) {
  const form = root.querySelector("[data-sign-in]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const out = form.querySelector("[data-error]");
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const result = await signIn(form.passphrase.value);
      if (result.ok) {
        location.hash = "#/map";
        return;
      }
      out.textContent = result.error || "Sign-in failed.";
      out.hidden = false;
    } catch {
      out.textContent = "The server did not answer.";
      out.hidden = false;
    } finally {
      button.disabled = false;
      form.passphrase.value = "";
    }
  });
  root.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    await signOut().catch(() => {});
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
