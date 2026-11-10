import { nav, footer } from "./layout.js";
import { SETUPS } from "./setups.js";
import { ACTIONS, BODY, MAIN, ROWS, SECTION, SECTION_TITLE } from "./ui.js";

export function renderHome() {
  const setups = SETUPS.map(
    (s) =>
      '<li class="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[13rem_minmax(0,1fr)]">' +
      '<h3 class="text-base">' + s.name + '</h3><p class="text-sm text-ink-2">' + s.short + "</p></li>"
  ).join("");
  return (
    nav("/") +
    '<main class="' + MAIN + '" id="main">' +
    '<section class="max-w-[46rem] pt-20 pb-6 max-sm:pt-10" data-tour="hero">' +
    '<h1 class="text-display">Herd tracking for local ranchers</h1>' +
    '<p class="mt-6 max-w-measure text-lg text-ink-2">FiberShare checks each tracker\'s battery and check-ins, lists Predator Watch and Wildfire Watch reports, and traces fiber back to the goat. Each of those jobs can be turned off. When a job is off, its alerts stop, and you can still add alerts, notes and checks by hand.</p>' +
    '<p class="mt-4 max-w-measure text-ink-2">FiberShare is a ranch program from BitPrairie LLC, growing into a network of local ranchers in the western US. This demo runs on 8 sample goats and one made-up day of tracker data.</p>' +
    '<p class="mt-4 max-w-measure text-ink-2">The code is MIT licensed, so anyone may use it. Joining the community network through a self-hosted or co-op server is free for non-commercial and research use.</p>' +
    '<div class="' + ACTIONS + ' mt-8"><a class="btn btn-primary" href="#/map">Open the herd view</a></div>' +
    "</section>" +
    '<section class="' + SECTION + ' mt-20" aria-labelledby="setups-title">' +
    '<h2 id="setups-title" class="' + SECTION_TITLE + '">Three setups</h2>' +
    '<div class="' + BODY + '"><ul class="' + ROWS + '">' + setups + "</ul>" +
    '<p class="mt-4 text-sm"><a href="#/setups">Compare the setups side by side</a></p></div>' +
    "</section></main>" +
    footer()
  );
}
