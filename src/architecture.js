import { nav, footer } from "./layout.js";
import { REPO } from "./sites.js";

export function renderArchitecture() {
  return (
    nav("/architecture") +
    '<main class="wrap" id="main">' +
    '<section class="hero"><p class="kicker">Architecture</p>' +
    "<h1>Pages, functions, shop, herd map.</h1>" +
    '<p class="lede">Static-first so anyone can run the MVP without accounts. Functions are a stub for later data.</p></section>' +
    '<div class="arch">' +
    '<div class="arch-step"><strong>Cloudflare Pages</strong> — landing, map, and shop UI (this Vite app), project <code>fibershare-dev</code>.</div>' +
    '<div class="arch-step"><strong>Static JSON</strong> — <code>public/data/herd.json</code> and <code>shop.json</code> for the demo.</div>' +
    '<div class="arch-step"><strong>Pages Functions</strong> — <code>/api/health</code> now; herd and shop APIs later.</div>' +
    '<div class="arch-step"><strong>Nearby products</strong> — Expo app on fibershare.app; paid US web on fibershare.us; ranch URL hosts the same latest product.</div>' +
    "</div>" +
    "<section class=\"section\"><h2>Contribute</h2>" +
    "<p>Keep this repo public-safe. No operator secrets. No Mailjet. No private ranch copy. Small pull requests against main are welcome.</p>" +
    '<p><a class="btn btn-primary" href="' +
    REPO +
    '">Open the repo</a></p>' +
    "</section></main>" +
    footer()
  );
}
