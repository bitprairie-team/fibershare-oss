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
    "<h1>FiberShare lets you follow a herd and support a ranch.</h1>" +
    "</div>" +
    '<div class="hero-aside">' +
    '<p class="lede">It is for people who follow goats, work with fiber, or want the ranch to last.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="#/map">Open the herd map</a>' +
    "</div>" +
    '<p class="fine-print">Sponsorship means you help pay for animals and pasture. You do not own a share of the ranch. You do not earn an investment return.</p>' +
    "</div>" +
    "</section>" +
    '<section class="section" aria-label="What you can do">' +
    '<h2 class="section-rule">What you can do</h2>' +
    '<ol class="feature-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>Herd map</h3><p>You see sample goats on a pasture drawing. This is not a real ranch herd. <a href="#/map">Open the herd map</a></p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Ranch support</h3><p>Support pays for animals and pasture. It is not a share of the ranch. You do not earn an investment return. This demo only explains that. <a href="' +
    esc(APP) +
    '"' +
    EXT +
    ">FiberShare app</a></p></div></li>" +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Fiber shop</h3><p>You can look through sample lots of fiber. You cannot buy them on this page. <a href="#/shop">Browse sample fiber</a></p></div></li>' +
    "</ol>" +
    "</section>" +
    '<section class="section" id="join">' +
    '<h2 class="section-rule">Open demo</h2>' +
    "<p>You can read the code, run your own copy, or help build it.</p>" +
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
    "<p>You need Node 20 on your computer.</p>" +
    "<pre><code>git clone " +
    REPO +
    ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    '<p class="muted">When it starts, open http://localhost:5173.</p>' +
    '<p class="muted">Sample goats and fiber are in the public/data folder.</p>' +
    "</section>" +
    '<section class="section">' +
    '<h2 class="section-rule">Other sites</h2>' +
    '<p class="lede-tight">The FiberShare app is one product, at fibershare.app.</p>' +
    '<p class="lede-tight">This page is a demo you can read and run. It is not that app.</p>' +
    '<table class="link-table"><thead><tr><th scope="col">Site</th><th scope="col">What it is</th></tr></thead><tbody>' +
    related +
    "</tbody></table>" +
    "</section></main>" +
    footer()
  );
}
