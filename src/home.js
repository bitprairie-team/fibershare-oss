import { APP, DISCORD, REPO, SITES } from "./sites.js";
import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";

export function renderHome() {
  const related = SITES.map((s) => {
    return (
      '<tr><th scope="row"><a href="' +
      esc(s.href) +
      '"' +
      EXT +
      ">" +
      esc(s.name) +
      "</a></th><td>" +
      esc(s.blurb) +
      "</td></tr>"
    );
  }).join("");
  return (
    nav("/") +
    '<main class="wrap" id="main">' +
    '<section class="hero hero-split">' +
    '<div class="hero-title">' +
    "<h1>FiberShare is a community of local ranchers.</h1>" +
    "</div>" +
    '<div class="hero-aside">' +
    '<p class="lede">Local ranchers share gear, alerts, and know-how to keep animals safe and keep ranches going.</p>' +
    '<p class="lede">This is a demo, not the FiberShare app. It uses sample goats and sample fiber.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="#/map">Open the herd map</a>' +
    '<a class="btn btn-ghost" href="#join">Take part</a>' +
    "</div>" +
    '<p class="fine-print">Support pays for animals and pasture. Support is not ownership or an investment return.</p>' +
    "</div>" +
    "</section>" +
    '<section class="section" id="join">' +
    '<h2 class="section-rule">Three ways to take part</h2>' +
    '<ol class="feature-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>Join the community network</h3><p>Share with other ranchers through a self-hosted or co-op setup. This is the main part of the project. It is free for non-commercial and research use. <a href="' +
    DISCORD +
    '"' +
    EXT +
    ">Chat on Discord</a></p></div></li>" +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Run your own local system</h3><p>Use the open code and docs on your own land. It is free and open source. <a href="#get-started">Run a copy</a></p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Use the commercial network</h3><p>BitPrairie offers hosting and ready-to-go gear. This part is small. It mainly covers hardware and hosting. <a href="' +
    esc(APP) +
    '"' +
    EXT +
    ">FiberShare app</a></p></div></li>" +
    "</ol>" +
    "</section>" +
    '<section class="section" aria-label="What this demo shows">' +
    '<h2 class="section-rule">What this demo shows</h2>' +
    '<ol class="feature-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>Herd map</h3><p>Sample goats on a pasture drawing. This is not a real ranch herd. <a href="#/map">Open the herd map</a></p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Ranch support</h3><p>Support pays for animals and pasture. Support is not ownership or an investment return. This demo only explains it.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Fiber shop</h3><p>Sample lots of fiber. You cannot buy them here. <a href="#/shop">Browse sample fiber</a></p></div></li>' +
    "</ol>" +
    "</section>" +
    '<section class="section">' +
    '<h2 class="section-rule">Open demo</h2>' +
    "<p>Read the code, run your own copy, or help build it.</p>" +
    "<p>You need a Discord account to chat. You need Node 20 to run a copy.</p>" +
    "<p>" +
    '<a href="' +
    REPO +
    '"' +
    EXT +
    ">View the code</a> · " +
    '<a href="#get-started">Run it yourself</a> · ' +
    '<a href="' +
    DISCORD +
    '"' +
    EXT +
    ">Help out</a></p>" +
    "</section>" +
    '<section class="section" id="get-started">' +
    '<h2 class="section-rule">Run a copy</h2>' +
    "<p>You need Node 20 or newer.</p>" +
    "<pre><code>git clone " +
    REPO +
    ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    '<p class="muted">When it starts, open http://localhost:5173.</p>' +
    '<p class="muted">Sample goats and fiber are in the public/data folder.</p>' +
    "</section>" +
    '<section class="section">' +
    '<h2 class="section-rule">Other sites</h2>' +
    '<p class="lede-tight">The hosted FiberShare app is at fibershare.app.</p>' +
    '<p class="lede-tight">This is a demo, not the FiberShare app.</p>' +
    '<table class="link-table"><thead><tr><th scope="col">Site</th><th scope="col">What it is</th></tr></thead><tbody>' +
    related +
    "</tbody></table>" +
    "</section></main>" +
    footer()
  );
}
