import { nav, footer } from "./layout.js";
import { DISCORD, REPO } from "./sites.js";
import { EXT } from "./util.js";

// The three ways to run FiberShare. The home page uses the short lines.
export const SETUPS = [
  {
    id: "own",
    name: "Your own hardware",
    short: "Trackers, radio gateway and server on the ranch. The data stays on your land.",
  },
  {
    id: "hosted",
    name: "Hosted by BitPrairie",
    short: "BitPrairie runs the server and can supply the trackers. The ranch needs an internet connection.",
  },
  {
    id: "mix",
    name: "A mix of both",
    short: "Your gateway and server on the ranch, with hosted alerts from BitPrairie.",
  },
];

const ROWS = [
  ["Trackers and radios", "You build or buy them.", "Kits from BitPrairie.", "Your own, or a kit."],
  ["Network server", "On your hardware.", "Run by BitPrairie.", "On your hardware."],
  ["Herd view and records", "This code, run by you.", "The FiberShare app.", "Either, or both."],
  ["Predator and smoke alerts", "Your own rules, or none.", "From BitPrairie's intelligence and realtime systems.", "Hosted, on top of your radios."],
  ["Event history", "Kept by you.", "Kept by BitPrairie for you. Shared only if you opt in.", "You choose what goes to the hosted side."],
  ["Support", "Community, on Discord and GitHub.", "BitPrairie.", "Both."],
  ["Cost", "Free and open source.", "Covers hardware and hosting.", "Hosted parts only."],
];

export function renderSetups() {
  const head = SETUPS.map((s) => '<th scope="col">' + s.name + "</th>").join("");
  const body = ROWS.map(([part, ...cells]) => '<tr><th scope="row">' + part + "</th>" + cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("");
  return (
    nav("/setups") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Setups</h1>" +
    '<p class="lede">The same trackers and records run three ways. You can switch later.</p>' +
    "</section>" +
    '<div class="table-scroll" data-tour="setups"><table class="data-table compare-table">' +
    '<thead><tr><td></td>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
    '<section class="section" aria-labelledby="every-title">' +
    '<h2 id="every-title">In every setup</h2>' +
    '<ul class="plain-list">' +
    "<li>Public pages never show where an animal is. Only a signed-in rancher sees tracker positions.</li>" +
    "<li>Each rancher owns their event history. Anything shared with agencies or researchers will be aggregated or delayed, with no exact locations.</li>" +
    "</ul>" +
    "</section>" +
    '<section class="section" aria-labelledby="network-title">' +
    '<h2 id="network-title">Community network</h2>' +
    "<p>Ranchers share data through a self-hosted or co-op server. It is free for non-commercial and research use. " +
    'Talk with other ranchers on <a href="' + DISCORD + '"' + EXT + ">Discord</a>, or read the code on <a href=\"" + REPO + '"' + EXT + ">GitHub</a>.</p>" +
    "<p>Ranch support pays for animals and pasture. Support is not ownership or an investment return.</p>" +
    "</section></main>" +
    footer()
  );
}
