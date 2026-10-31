// Guided tour and "Reset demo". The tour moves between routes, points at one
// element per step, and drives the herd view to the alert moments. It reads
// only the bundled sample data, so it works with no internet link.
import { TOUR_STEPS, TOUR_KEYS } from "./tour-steps.js";
import { setPreferSample } from "./data.js";
import { setHerdView } from "./map.js";
import { resetTrace } from "./trace.js";
import { icon } from "./icons.js";
import { esc } from "./util.js";

let index = -1;
let els = null;
let lastFocus = null;
let raf = 0;

function store(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(value));
  } catch {
    // Storage can be blocked. The tour then lasts until the next reload.
  }
}

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function currentPath() {
  return (location.hash.replace(/^#/, "").split("?")[0] || "/").replace(/^(?!\/)/, "/");
}

function build() {
  const scrim = document.createElement("div");
  scrim.className = "tour-scrim";
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  spot.setAttribute("aria-hidden", "true");
  const card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tour-title");
  card.setAttribute("aria-describedby", "tour-body");
  document.body.append(scrim, spot, card);
  card.addEventListener("keydown", onKey);
  scrim.addEventListener("click", () => card.querySelector("[data-tour-next]")?.focus());
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  els = { scrim, spot, card };
}

function teardown() {
  document.documentElement.style.removeProperty("--tour-reserve");
  document.documentElement.classList.remove("tour-sheet");
  if (!els) return;
  window.removeEventListener("resize", schedule);
  window.removeEventListener("scroll", schedule);
  els.scrim.remove();
  els.spot.remove();
  els.card.remove();
  els = null;
}

function onKey(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    endTour();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    next();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    back();
  } else if (event.key === "Tab") {
    // Keep focus inside the tour card.
    const items = [...els.card.querySelectorAll("button")];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function target(step) {
  return document.querySelector('[data-tour="' + step.target + '"]');
}

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(place);
}

function place() {
  if (!els || index < 0) return;
  const el = target(TOUR_STEPS[index]);
  const card = els.card;
  if (!el) {
    els.spot.style.cssText = "top:50%;left:50%;width:0;height:0";
    card.style.top = Math.max(16, (innerHeight - card.offsetHeight) / 2) + "px";
    card.style.left = Math.max(16, (innerWidth - card.offsetWidth) / 2) + "px";
    return;
  }
  const r = el.getBoundingClientRect();
  const pad = 8;
  const top = Math.max(4, r.top - pad);
  const left = Math.max(4, r.left - pad);
  const bottom = Math.min(innerHeight - 4, r.bottom + pad);
  const right = Math.min(innerWidth - 4, r.right + pad);
  Object.assign(els.spot.style, { top: top + "px", left: left + "px", width: Math.max(0, right - left) + "px", height: Math.max(0, bottom - top) + "px" });
  // On a phone the card docks to the bottom, or to the top when the target sits low (the bottom sheet).
  card.classList.toggle("at-top", (r.top + r.bottom) / 2 > innerHeight / 2);
  reserveForCard(el, card);
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const gap = 16;
  let ct;
  let cl;
  if (innerWidth - right >= cw + gap * 2) {
    cl = right + gap;
    ct = Math.min(Math.max(16, top), innerHeight - ch - 16);
  } else if (left >= cw + gap * 2) {
    cl = left - cw - gap;
    ct = Math.min(Math.max(16, top), innerHeight - ch - 16);
  } else if (innerHeight - bottom >= ch + gap) {
    ct = bottom + gap;
    cl = Math.min(Math.max(16, left), innerWidth - cw - 16);
  } else if (top >= ch + gap) {
    ct = top - ch - gap;
    cl = Math.min(Math.max(16, left), innerWidth - cw - 16);
  } else {
    ct = innerHeight - ch - 16;
    cl = Math.min(Math.max(16, left), innerWidth - cw - 16);
  }
  card.style.top = Math.max(16, ct) + "px";
  card.style.left = Math.max(16, cl) + "px";
}

// A phone bottom sheet can grow taller than the space under a top-docked card.
// Cap it so the sheet's header stays in view, then place the spotlight again.
function reserveForCard(el, card) {
  const root = document.documentElement;
  const docked = card.classList.contains("at-top") && innerWidth <= 640 && getComputedStyle(el).position === "fixed";
  const reserve = docked ? Math.ceil(card.getBoundingClientRect().bottom + 12) + "px" : "";
  if (root.style.getPropertyValue("--tour-reserve") === reserve) return;
  if (reserve) root.style.setProperty("--tour-reserve", reserve);
  else root.style.removeProperty("--tour-reserve");
  root.classList.toggle("tour-sheet", Boolean(reserve));
  setTimeout(schedule, reduced() ? 0 : 320);
}

function drawCard(step) {
  const last = index === TOUR_STEPS.length - 1;
  const dots = TOUR_STEPS.map((_, i) => '<span class="' + (i === index ? "on" : "") + '"></span>').join("");
  els.card.innerHTML =
    '<div class="tour-meta"><span class="tour-step">Step ' + (index + 1) + " of " + TOUR_STEPS.length + "</span>" +
    '<button type="button" class="icon-btn tour-close" data-tour-end aria-label="End the tour">' + icon("close", { size: 18 }) + "</button></div>" +
    '<h2 id="tour-title">' + esc(step.title) + (step.simulated ? ' <span class="badge badge-sim">Simulated</span>' : "") + "</h2>" +
    '<p id="tour-body">' + esc(step.body) + "</p>" +
    '<div class="tour-actions">' +
    '<div class="tour-dots" aria-hidden="true">' + dots + "</div><span class=\"spacer\"></span>" +
    (index > 0 ? '<button type="button" class="btn btn-ghost btn-small" data-tour-back>' + icon("arrowLeft", { size: 16 }) + "Back</button>" : "") +
    (last
      ? '<button type="button" class="btn btn-ghost btn-small" data-tour-reset>' + icon("reset", { size: 16 }) + 'Reset demo</button><button type="button" class="btn btn-primary btn-small" data-tour-next>Finish</button>'
      : '<button type="button" class="btn btn-primary btn-small" data-tour-next>Next' + icon("arrowRight", { size: 16 }) + "</button>") +
    "</div>" +
    '<p class="tour-hint">Arrow keys move between steps. Esc ends the tour.</p>';
  els.card.querySelector("[data-tour-end]").addEventListener("click", endTour);
  els.card.querySelector("[data-tour-back]")?.addEventListener("click", back);
  els.card.querySelector("[data-tour-next]").addEventListener("click", next);
  els.card.querySelector("[data-tour-reset]")?.addEventListener("click", () => {
    endTour();
    resetDemo();
  });
}

/** Show the current step, once its route is on screen. */
function show() {
  const step = TOUR_STEPS[index];
  if (!step) return;
  if (currentPath() !== step.route) {
    location.hash = "#" + step.route;
    return; // the route change calls tourAfterRender
  }
  if (step.herd) setHerdView(step.herd);
  if (!els) build();
  drawCard(step);
  const el = target(step);
  el?.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  place();
  // Place again once scrolling settles.
  setTimeout(place, reduced() ? 0 : 420);
  els.card.querySelector("[data-tour-next]")?.focus({ preventScroll: true });
}

function go(i) {
  index = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
  store(TOUR_KEYS.step, index);
  show();
}

function next() {
  if (index >= TOUR_STEPS.length - 1) endTour();
  else go(index + 1);
}

function back() {
  if (index > 0) go(index - 1);
}

export function startTour(at = 0) {
  lastFocus = document.activeElement;
  // The tour runs on the sample herd, even if a live file is available.
  setPreferSample(true);
  go(at);
}

export function endTour() {
  index = -1;
  store(TOUR_KEYS.step, null);
  try {
    localStorage.setItem(TOUR_KEYS.seen, "1");
  } catch {
    // fine without storage
  }
  teardown();
  const back = lastFocus && document.body.contains(lastFocus) ? lastFocus : document.querySelector("[data-tour-start]");
  back?.focus?.();
}

export function tourActive() {
  return index >= 0;
}

/** Put the demo back the way it starts: sample herd, end of day, home page. */
export function resetDemo() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("fs-") && key !== "fs-theme") storage.removeItem(key);
      }
    } catch {
      // nothing stored
    }
  }
  setPreferSample(true);
  resetTrace();
  const region = document.getElementById("route-announcer");
  if (location.hash === "#/" || location.hash === "") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#/";
  if (region) setTimeout(() => (region.textContent = "Demo reset"), 120);
}

/** Called by the router after each page renders. */
export function tourAfterRender(root) {
  root.querySelectorAll("[data-tour-start]").forEach((btn) => btn.addEventListener("click", () => startTour(0)));
  root.querySelectorAll("[data-demo-reset]").forEach((btn) => btn.addEventListener("click", resetDemo));
  if (index < 0) {
    // Pick up a tour that was running before a reload.
    let saved = null;
    try {
      saved = sessionStorage.getItem(TOUR_KEYS.step);
    } catch {
      saved = null;
    }
    if (saved === null) return;
    index = Number(saved) || 0;
  }
  const step = TOUR_STEPS[index];
  if (step && currentPath() === step.route) show();
}
