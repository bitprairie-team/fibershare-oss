import { nav, footer } from "./layout.js";
import { SETUPS } from "./setups.js";

export function renderHome() {
  const setups = SETUPS.map((s) => "<li><h3>" + s.name + "</h3><p>" + s.short + "</p></li>").join("");
  return (
    nav("/") +
    '<main class="wrap" id="main">' +
    '<section class="hero" data-tour="hero">' +
    "<h1>Herd tracking for local ranchers</h1>" +
    '<p class="lede">FiberShare checks each tracker\'s battery and check-ins, lists Predator Watch and Wildfire Watch reports, and traces fiber back to the goat. Each of those jobs can be turned off, and everything also works by hand.</p>' +
    '<p class="lede">FiberShare is a ranch program from BitPrairie LLC, growing into a network of local ranchers in the western US. This demo runs on 8 sample goats and one made-up day of tracker data.</p>' +
    '<div class="cta-row"><a class="btn btn-primary" href="#/map">Open the herd view</a></div>' +
    "</section>" +
    '<section class="section" aria-labelledby="setups-title">' +
    '<div class="section-head"><h2 id="setups-title">Three setups</h2><a href="#/setups">Compare setups</a></div>' +
    '<ul class="setup-list">' + setups + "</ul>" +
    "</section></main>" +
    footer()
  );
}
