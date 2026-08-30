import { nav, footer } from "./layout.js";

export function renderArchitecture() {
  return (
    nav("/architecture") +
    '<main class="wrap">' +
    '<section class="hero"><p class="kicker">Architecture</p>' +
    '<h1>Pages, functions, shop, herd map.</h1>' +
    '<p class="lede">Static-first so anyone can run the MVP without accounts. Functions are a stub for later data.</p></section>' +
    '<div class="arch">' +
    '<div class="arch-step"><strong>Cloudflare Pages</strong> — landing, map, and shop UI (this Vite app).</div>' +
    '<div class="arch-step"><strong>Static JSON</strong> — public/data/herd.json and shop.json for the demo.</div>' +
    '<div class="arch-step"><strong>Pages Functions</strong> — /api/health now; herd and shop APIs later.</div>' +
    '<div class="arch-step"><strong>Nearby products</strong> — Expo app on fibershare.app; paid US web on fibershare.us; ranch URL hosts the same latest product.</div>' +
    '</div>' +
    '<h2>Contribute</h2>' +
    '<p>Keep this repo public-safe. No operator secrets. No Mailjet. No private ranch copy. Small pull requests against main are welcome.</p>' +
    '</main>' +
    footer()
  );
}
