import { nav, footer } from "./layout.js";
import { REPO } from "./sites.js";
import { EXT } from "./util.js";

export function renderArchitecture() {
  return (
    nav("/architecture") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Pages, functions, shop, herd map.</h1>" +
    '<p class="lede">Static-first so anyone can run the MVP without accounts. Functions are a stub for later data.</p>' +
    "</section>" +
    '<ol class="arch-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>Static Vite app</h3><p>Landing, map, and shop UI. Deploy to Cloudflare Pages when you want a public demo; live <code>fibershare.dev</code> is the BitPrairie ranch product, not this MVP.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Static JSON</h3><p><code>public/data/herd.json</code> and <code>shop.json</code> for the demo.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Pages Functions</h3><p><code>/api/health</code> now; herd and shop APIs later.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">04</span><div><h3>Nearby products</h3><p>Expo app on fibershare.app; paid US web on fibershare.us; ranch URL hosts the same latest product.</p></div></li>' +
    "</ol>" +
    '<section class="section">' +
    '<h2 class="section-rule">Contribute</h2>' +
    "<p>Keep this repo public-safe. No operator secrets. No Mailjet. No private ranch copy. Small pull requests against main are welcome.</p>" +
    '<p class="cta-row"><a class="btn btn-primary" href="' +
    REPO +
    '"' +
    EXT +
    ">Open the repo</a></p>' +
    "</section></main>" +
    footer()
  );
}
