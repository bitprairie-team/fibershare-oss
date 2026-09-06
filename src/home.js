import { DISCORD, REPO, SITES } from "./sites.js";
import { nav, footer } from "./layout.js";

export function renderHome() {
  const cards = SITES.map((s) => {
    return (
      '<article class="card"><p class="kicker">Surface</p><h3><a href="' +
      s.href +
      '" rel="noopener">' +
      s.name +
      "</a></h3><p>" +
      s.blurb +
      "</p></article>"
    );
  }).join("");
  return (
    nav("/") +
    '<main class="wrap" id="main">' +
    '<section class="hero">' +
    '<p class="kicker">Open source · MIT</p>' +
    "<h1>Follow the herd. Support a ranch. Shop the fiber.</h1>" +
    '<p class="lede">Community MVP for ranch sponsorship, a sample collar map, and a stub fiber shop. Clone it, run it, contribute. This is not the paid US brand.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="' +
    DISCORD +
    '">Join Discord</a>' +
    '<a class="btn btn-ghost" href="' +
    REPO +
    '">View on GitHub</a>' +
    '<a class="btn btn-ghost" href="#/map">Open herd map</a>' +
    "</div>" +
    '<p class="fine-print" style="margin-top:1.25rem">Sponsorship and ranch gifts are support for animals and pasture — not ownership shares and not an investment return.</p>' +
    "</section>" +
    '<section class="section grid" aria-label="What this MVP includes">' +
    '<article class="card"><p class="kicker">Map</p><h3>Collar map</h3><p>Sample goats on a pasture sketch. Placeholder pins, not live telemetry.</p><p style="margin-top:0.75rem"><a href="#/map">Explore the map</a></p></article>' +
    '<article class="card"><p class="kicker">Ranch</p><h3>Sponsorship story</h3><p>A public frame for herds, fiber, and people who want a ranch to thrive.</p><p style="margin-top:0.75rem"><a href="https://www.bitprairie.com/fibershare" rel="noopener">See the ranch program</a></p></article>' +
    '<article class="card"><p class="kicker">Shop</p><h3>Fiber catalog</h3><p>Stub lots from JSON. Real ordering lives on fibershare.app and fibershare.us.</p><p style="margin-top:0.75rem"><a href="#/shop">Browse the stub shop</a></p></article>' +
    "</section>" +
    '<section class="section" id="get-started">' +
    "<h2>Run locally</h2>" +
    "<pre><code>git clone " +
    REPO +
    ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    '<p class="muted">Node 20. Vite serves http://localhost:5173. Sample data is in public/data/.</p>' +
    "</section>" +
    '<section class="section">' +
    "<h2>The FiberShare map</h2>" +
    '<p class="lede" style="margin-bottom:1rem">Related surfaces. This repo is only the open-source community MVP.</p>' +
    '<div class="links-four">' +
    cards +
    "</div></section></main>" +
    footer()
  );
}
