import { nav, footer } from "./layout.js";
import { REPO } from "./sites.js";
import { EXT } from "./util.js";

const ROWS = [
  [
    "Trackers and LoRa radios",
    "You build or buy them and put them up.",
    "Ready-to-go kits from BitPrairie.",
    "Your own gear, or a kit for the parts you want.",
  ],
  [
    "Network server, such as ChirpStack",
    "Runs on your own hardware on the ranch.",
    "BitPrairie runs it.",
    "Runs on your own hardware on the ranch.",
  ],
  [
    "Herd view and records",
    "Run this demo or your own copy.",
    "The hosted FiberShare app.",
    "Your copy, or the hosted app, or both.",
  ],
  [
    "Predator and wildfire alerts",
    "Bring your own model, or none.",
    "Predator Watch and Wildfire Watch, with BitPrairie's own trained models.",
    "Hosted alerts on top of your own radios.",
  ],
  [
    "Who keeps the event history",
    "You do. It stays on your hardware.",
    "You do. BitPrairie keeps it for you and shares it only if you opt in.",
    "You do. You pick what goes to the hosted side.",
  ],
  [
    "Help when something breaks",
    "The community, on Discord and GitHub.",
    "BitPrairie support.",
    "Both.",
  ],
];

export function renderSetups() {
  const table = ROWS.map(
    ([part, own, hosted, mix]) =>
      '<tr><th scope="row">' + part + "</th><td>" + own + "</td><td>" + hosted + "</td><td>" + mix + "</td></tr>"
  ).join("");
  return (
    nav("/setups") +
    '<main class="wrap wrap-wide" id="main">' +
    '<section class="page-head">' +
    "<h1>Three setups</h1>" +
    '<p class="lede">The same trackers and records can run three ways. Pick the one that fits your place. You can change later.</p>' +
    "</section>" +
    '<ol class="setup-cards">' +
    '<li class="setup-card"><span class="feature-num" aria-hidden="true">01</span><h2>Your own hardware</h2>' +
    "<p>You build or buy the gear and run it yourself. Trackers talk over LoRa to a receiver on the ranch. A network server such as ChirpStack runs on your own hardware. Nothing has to leave the ranch.</p>" +
    '<p class="setup-fit">This suits ranchers who like to tinker, co-ops, and research groups.</p>' +
    '<p><a href="' + REPO + '/blob/main/docs/chirpstack.md"' + EXT + ">Hook this demo up to your own ChirpStack</a></p></li>" +
    '<li class="setup-card"><span class="feature-num" aria-hidden="true">02</span><h2>Hosted by BitPrairie</h2>' +
    "<p>BitPrairie runs the hosting for you and can supply ready-to-go gear. You need an internet link on the ranch. This part is small and mainly covers the cost of hardware and hosting.</p>" +
    '<p class="setup-fit">This suits ranchers who would rather not run a server.</p>' +
    '<p><a href="https://www.bitprairie.com/fibershare"' + EXT + ">BitPrairie's FiberShare page</a></p></li>" +
    '<li class="setup-card"><span class="feature-num" aria-hidden="true">03</span><h2>A mix of both</h2>' +
    "<p>Your gear and server on the ranch, with BitPrairie hosting the parts you choose, such as alert relay. If the hosted side is down, the trackers and server on the ranch keep running.</p>" +
    '<p class="setup-fit">This suits ranchers who already run their own radios and want hosted alerts.</p></li>' +
    "</ol>" +
    '<section class="section">' +
    '<h2 class="section-rule">Side by side</h2>' +
    '<div class="table-scroll"><table class="link-table compare-table"><thead><tr><th scope="col">Part</th><th scope="col">Your own hardware</th><th scope="col">Hosted by BitPrairie</th><th scope="col">A mix</th></tr></thead><tbody>' +
    table +
    "</tbody></table></div>" +
    "</section>" +
    '<section class="section">' +
    '<h2 class="section-rule">In every setup</h2>' +
    '<ol class="feature-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>No locations in public</h3><p>Public pages never show where an animal is. In this demo the public sees a virtual grid. Only a signed-in rancher sees their own trackers on a map.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Sharing is opt in</h3><p>Each rancher\'s event history is theirs. Planned: anything shared with agencies or researchers will be aggregated or delayed, with no exact locations.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Community first</h3><p>The community network, self-hosted or run as a co-op, is the main part of the project. It is free for non-commercial and research use.</p></div></li>' +
    "</ol>" +
    '<p class="fine-print">This is a demo, not the FiberShare app. Support for a ranch pays for animals and pasture. Support is not ownership or an investment return.</p>' +
    "</section></main>" +
    footer()
  );
}
