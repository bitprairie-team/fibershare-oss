import { REPO, SITES } from "./sites.js";
import { nav, footer } from "./layout.js";

export function renderHome() {
  const cards = SITES.map((s) => {
    return (
      '<article class="card"><h3><a href="' +
      s.href +
      '">' +
      s.name +
      '</a></h3><p>' +
      s.blurb +
      '</p></article>'
    );
  }).join("");
  return (
    nav("/") +
    '<main class="wrap">' +
    '<section class="hero">' +
    '<p class="kicker">Open source</p>' +
    '<h1>Ranch sponsorship, a collar map, and a fiber shop.</h1>' +
    '<p class="lede">Community MVP. Clone it, run it, contribute. This is not the paid US brand.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="' +
    REPO +
    '">View on GitHub</a>' +
    '<a class="btn btn-ghost" href="#get-started">Get started</a>' +
    '</div></section>' +
    '<section class="grid">' +
    '<article class="card"><h3>Collar map</h3><p>Sample goats on a pasture sketch. Placeholder data, not live telemetry.</p></article>' +
    '<article class="card"><h3>Ranch sponsorship</h3><p>A public story for herds, fiber, and people who want to help a ranch thrive.</p></article>' +
    '<article class="card"><h3>Fiber shop</h3><p>A stub catalog from JSON. The Expo order app lives at fibershare.app.</p></article>' +
    '</section>' +
    '<h2 id="get-started">Run locally</h2>' +
    '<pre><code>git clone ' +
    REPO +
    '.git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>' +
    '<p class="muted">Node 20. Vite serves http://localhost:5173. Sample data is in public/data/.</p>' +
    '<h2>The FiberShare map</h2>' +
    '<div class="links-four">' +
    cards +
    '</div></main>' +
    footer()
  );
}
