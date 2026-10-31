import { nav, footer } from "./layout.js";
import { REPO } from "./sites.js";
import { EXT } from "./util.js";
import { icon } from "./icons.js";

function item(iconName, title, html, extra = "") {
  return '<li class="tile"><div class="tile-head"><span class="tile-icon">' + icon(iconName) + "</span>" + extra + "</div><h3>" + title + "</h3><p>" + html + "</p></li>";
}

export function renderArchitecture() {
  return (
    nav("/architecture") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>How this demo is built</h1>" +
    '<p class="lede">A small web app and a few server routes. You can run all of it on your own hardware, with no account.</p>' +
    "</section>" +
    '<ul class="arch-list">' +
    item("layers", "The pages", "Home, the herd view, the fleece trace, the shop, and the setups page are plain web pages built with Vite. Run them yourself or publish a copy on Cloudflare Pages.") +
    item("grid", "Sample files", "The goats, the sample day, and the fiber lots are in public/data: herd.json, events.json, and shop.json. The fleece trace reads the record examples in docs/schemas/examples.") +
    item("server", "Server routes", "<code>/api/health</code> says the site is up. <code>/api/live</code> sends tracker data: hidden for everyone, full only for a signed-in rancher. <code>/api/session</code> handles rancher sign-in, <code>/api/alerts</code> keeps a signed-in rancher's answers to alerts, and <code>/api/push</code> takes data sent from your own pull.") +
    item("signal", "Your own ChirpStack", "<code>npm run chirpstack:pull</code> reads your trackers from a ChirpStack v4 server over REST, and MQTT if you set it up. It writes <code>.local/live.json</code>, which git ignores and the build never includes. Without that file the site uses the samples.") +
    item("lock", "Rancher sign-in", "The server decides who sees what, on every request. On your own hardware, sign-in is a passphrase you set with <code>npm run rancher:passphrase</code>. On Cloudflare Pages, it is Cloudflare Access.") +
    item("map", "The rancher map", "A signed-in rancher sees real positions on a map with public agency layers. The map code loads only for that view. If it cannot load, the tracker details still show each position.") +
    item("alert", "Alerts and answers", "The rules are in <code>src/alerts.js</code> and the thresholds in <code>src/alert-config.js</code>. The browser and the server use the same code. Answers on sample data stay in your browser. A signed-in rancher's answers go to <code>.local/alert-feedback.json</code> on your own hardware, or to KV on Pages. Tuning the rules from the answers is planned.") +
    item("bag", "Data stored in the cloud", "A store for sample herd and shop data behind the server routes.", '<span class="badge badge-planned">Planned</span>') +
    "</ul>" +
    '<section class="section">' +
    '<div class="section-head"><div><h2>Help out</h2><p>The license is MIT. You may use, share, and change the code.</p></div></div>' +
    '<ul class="card-grid">' +
    '<li class="tile"><span class="tile-icon">' + icon("shield") + "</span><h3>Keep secrets out</h3><p>Do not add private ranch files, real tracker data, payment setup, or mail settings to the repo.</p></li>" +
    '<li class="tile tile-link"><span class="tile-icon">' + icon("code") + "</span><h3>Send a change</h3><p>You need a GitHub account. A pull request is the change you ask us to add.</p>" +
    '<a class="link-arrow stretch" href="' + REPO + '/blob/main/CONTRIBUTING.md"' + EXT + ">Contribution rules" + icon("external", { size: 16 }) + "</a></li>" +
    '<li class="tile tile-link"><span class="tile-icon">' + icon("info") + "</span><h3>Demo and app</h3><p>This is a demo, not the FiberShare app. bitprairie.com/fibershare and fibershare.app are separate sites.</p>" +
    '<a class="link-arrow stretch" href="' + REPO + '/blob/main/docs/DIRECTION.md"' + EXT + ">How they relate" + icon("external", { size: 16 }) + "</a></li>" +
    "</ul>" +
    '<div class="cta-row"><a class="btn btn-primary" href="' + REPO + '"' + EXT + ">View the code" + icon("external", { size: 16 }) + "</a></div>" +
    "</section></main>" +
    footer()
  );
}
