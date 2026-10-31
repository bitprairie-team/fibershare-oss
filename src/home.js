import { APP, DISCORD, REPO } from "./sites.js";
import { nav, footer } from "./layout.js";
import { EXT } from "./util.js";
import { icon } from "./icons.js";
import { LOOPS, LOOP_STATUS } from "./loops.js";

// A still picture of the herd view for the home page. It uses the sample
// herd's grid cells, and is drawn with HTML, so it costs no extra request.
const PREVIEW_PINS = [
  ["Ju", 34, 44],
  ["Th", 62, 35],
  ["Cl", 48, 68],
  ["Br", 76, 62, true],
  ["Sa", 82, 70],
  ["Wi", 50, 74],
  ["Pi", 42, 30],
  ["Ha", 66, 52],
];

function preview() {
  const cells = Array.from({ length: 24 }, (_, i) => {
    const label = String.fromCharCode(65 + (i % 6)) + (Math.floor(i / 6) + 1);
    return '<div class="cell' + (label === "A1" ? " is-alert" : "") + '"><span>' + label + "</span></div>";
  }).join("");
  const pins = PREVIEW_PINS.map(
    ([short, x, y, on]) =>
      '<span class="goat' + (on ? " is-active" : "") + '" style="left:' + x + "%;top:" + y + '%">' + (on ? "Bramble" : short) + "</span>"
  ).join("");
  return (
    '<a class="preview" href="#/map" data-tour="hero-preview" aria-label="Open the herd view">' +
    '<span aria-hidden="true">' +
    '<span class="preview-bar"><span>Community sample herd</span><span class="badge badge-sim">Simulated day</span></span>' +
    '<span class="paddock" style="display:block"><span class="paddock-cells">' + cells + "</span>" + pins + "</span>" +
    '<span class="alert-card preview-toast"><span class="alert-icon">' + icon("paw", { size: 18 }) + "</span>" +
    "<span><strong>Predator alert near A1</strong><small>16:40 · the herd moved away</small></span></span>" +
    '<span class="preview-stats">' +
    "<span><strong>8</strong>goats</span><span><strong>7</strong>checked in</span><span><strong>1</strong>low battery</span><span><strong>4</strong>open alerts</span>" +
    "</span></span></a>"
  );
}

function tile(iconName, title, text, href, linkText, extra = "") {
  const external = href.startsWith("http");
  return (
    '<li class="tile' + (href ? " tile-link" : "") + '">' +
    '<div class="tile-head"><span class="tile-icon">' + icon(iconName) + "</span>" + extra + "</div>" +
    "<h3>" + title + "</h3><p>" + text + "</p>" +
    (href
      ? '<a class="link-arrow stretch" href="' + href + '"' + (external ? EXT : "") + ">" + linkText + icon(external ? "external" : "arrowRight", { size: 16 }) + "</a>"
      : "") +
    "</li>"
  );
}

export function renderHome() {
  return (
    nav("/") +
    '<main class="wrap" id="main">' +
    '<section class="hero" data-tour="hero">' +
    '<div class="hero-copy">' +
    '<p class="eyebrow">Open-source demo</p>' +
    "<h1>FiberShare is a community of local ranchers.</h1>" +
    '<p class="lede">Ranchers share trackers, alerts, and know-how to keep animals safe. They also keep records that trace each fiber lot back to the animal it came from.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="#/map">Open the herd view' + icon("arrowRight", { size: 18 }) + "</a>" +
    '<button type="button" class="btn btn-ghost" data-tour-start>' + icon("tour", { size: 18 }) + "Take the tour</button>" +
    "</div>" +
    '<p class="fine-print">' + icon("info", { size: 16 }) + "This is a demo, not the FiberShare app. It runs on sample goats and works offline.</p>" +
    "</div>" +
    preview() +
    "</section>" +
    '<section class="home-band" aria-labelledby="see-title" data-tour="loops">' +
    '<div class="section-head"><div><h2 id="see-title">What FiberShare helps with</h2><p>Six jobs on a ranch. The badge on each one says how much of it this demo does today.</p></div></div>' +
    '<ul class="card-grid cols-3 loops">' +
    LOOPS.map((loop) => {
      const [cls, label] = LOOP_STATUS[loop.status];
      const text =
        (loop.done ? "<p>" + loop.done + "</p>" : "") +
        (loop.planned ? '<p class="loop-next"><strong>Planned:</strong> ' + loop.planned + "</p>" : "");
      return (
        '<li class="tile' + (loop.href ? " tile-link" : "") + '" data-loop="' + loop.id + '">' +
        '<div class="tile-head"><span class="tile-icon">' + icon(loop.icon) + '</span><span class="badge ' + cls + '">' + label + "</span></div>" +
        "<h3>" + loop.title + "</h3>" + text +
        (loop.href ? '<a class="link-arrow stretch" href="' + loop.href + '">' + loop.link + icon("arrowRight", { size: 16 }) + "</a>" : "") +
        "</li>"
      );
    }).join("") +
    "</ul></section>" +
    '<section class="home-band" aria-labelledby="setups-title">' +
    '<div class="section-head"><div><h2 id="setups-title">Three setups</h2><p>The same trackers and records run three ways. You can change later.</p></div>' +
    '<a class="link-arrow" href="#/setups">Compare the setups' + icon("arrowRight", { size: 16 }) + "</a></div>" +
    '<ul class="card-grid cols-3">' +
    tile("server", "Your own hardware", "Trackers, radio, and server on the ranch. Nothing has to leave your land.", "", "") +
    tile("cloud", "Hosted by BitPrairie", "BitPrairie runs the server and can supply ready-to-go gear. You need an internet link.", "", "") +
    tile("mix", "A mix of both", "Your radios and server on the ranch, with hosted alerts on top.", "", "") +
    "</ul></section>" +
    '<section class="home-band" id="join" aria-labelledby="join-title">' +
    '<div class="section-head"><div><h2 id="join-title">Take part</h2><p>The community network is the main part of the project.</p></div></div>' +
    '<div class="take-part">' +
    '<div class="tile is-main"><span class="tile-icon">' + icon("people") + "</span><h3>Join the community network</h3>" +
    "<p>Share with other ranchers through a self-hosted or co-op setup. It is free for non-commercial and research use.</p>" +
    '<a class="link-arrow" href="' + DISCORD + '"' + EXT + ">Chat on Discord" + icon("external", { size: 16 }) + "</a></div>" +
    '<div class="tile" id="get-started"><span class="tile-icon">' + icon("code") + "</span><h3>Run your own copy</h3>" +
    "<p>You need Node 20 or newer. Then open http://localhost:5173.</p>" +
    "<pre><code>git clone " + REPO + ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre></div>" +
    '<div class="tile"><span class="tile-icon">' + icon("bag") + "</span><h3>Hosted by BitPrairie</h3>" +
    "<p>Hosting and ready-to-go gear for ranchers who would rather not run a server. This part is small.</p>" +
    '<a class="link-arrow" href="' + APP + '"' + EXT + ">The FiberShare app" + icon("external", { size: 16 }) + "</a></div>" +
    "</div>" +
    '<p class="fine-print"><span class="badge badge-planned">Planned</span> Ranch support: support pays for animals and pasture. Support is not ownership or an investment return.</p>' +
    "</section></main>" +
    footer()
  );
}
