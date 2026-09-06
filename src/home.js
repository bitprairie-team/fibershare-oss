import { DISCORD, REPO, SITES } from "./sites.js";
import { nav, footer } from "./layout.js";

export function renderHome() {
  const related = SITES.map((s) => {
    return (
      "<tr><th scope=\"row\"><a href=\"" +
      s.href +
      '" rel="noopener">' +
      s.name +
      "</a></th><td>" +
      s.blurb +
      "</td></tr>"
    );
  }).join("");
  return (
    nav("/") +
    '<main class="wrap" id="main">' +
    '<section class="hero hero-split">' +
    '<div class="hero-title">' +
    "<h1>Follow the herd. Support a ranch. Shop the fiber.</h1>" +
    "</div>" +
    '<div class="hero-aside">' +
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
    '<p class="fine-print">Sponsorship and ranch gifts are support for animals and pasture — not ownership shares and not an investment return.</p>' +
    "</div>" +
    "</section>" +
    '<section class="section" aria-label="What this MVP includes">' +
    '<h2 class="section-rule">In this journal</h2>' +
    '<ol class="feature-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>Collar map</h3><p>Sample goats on a pasture sketch. Placeholder pins, not live telemetry. <a href="#/map">Explore the map</a></p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Sponsorship story</h3><p>A public frame for herds, fiber, and people who want a ranch to thrive. <a href="https://www.bitprairie.com/fibershare" rel="noopener">See the ranch program</a></p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Fiber catalog</h3><p>Stub lots from JSON. Real ordering lives on fibershare.app and fibershare.us. <a href="#/shop">Browse the stub shop</a></p></div></li>' +
    "</ol>" +
    "</section>" +
    '<section class="section" id="get-started">' +
    '<h2 class="section-rule">Run locally</h2>' +
    "<pre><code>git clone " +
    REPO +
    ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    '<p class="muted">Node 20. Vite serves http://localhost:5173. Sample data is in public/data/.</p>' +
    "</section>" +
    '<section class="section">' +
    '<h2 class="section-rule">Related links</h2>' +
    '<p class="lede-tight">This repo is only the open-source community MVP.</p>' +
    '<table class="link-table"><thead><tr><th scope="col">Site</th><th scope="col">What it is</th></tr></thead><tbody>' +
    related +
    "</tbody></table>" +
    "</section></main>" +
    footer()
  );
}
