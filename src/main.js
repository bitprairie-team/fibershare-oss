import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "./style.css";
import { bindTheme, nav, footer } from "./layout.js";
import { renderHome } from "./home.js";
import { renderMap, bindMap, leaveMap } from "./map.js";
import { renderTrace, bindTrace } from "./trace.js";
import { renderSetups } from "./setups.js";
import { renderArchitecture } from "./architecture.js";
import { renderRancher, bindRancher } from "./rancher.js";
import { tourAfterRender } from "./tour.js";
import { skeleton } from "./skeleton.js";

const trace = { render: renderTrace, title: "Fleece trace · FiberShare" };
const routes = {
  "/": { render: renderHome, title: "FiberShare demo" },
  "/map": { render: renderMap, title: "Herd view · FiberShare", skeleton: "herd" },
  "/trace": trace,
  // The fiber list is now part of the fleece trace page. Old links still work.
  "/shop": trace,
  "/setups": { render: renderSetups, title: "Setups · FiberShare" },
  "/rancher": { render: renderRancher, title: "Rancher sign-in · FiberShare", skeleton: "panel" },
  "/architecture": { render: renderArchitecture, title: "How it works · FiberShare" },
};

function pathFromHash() {
  const raw = location.hash.replace(/^#/, "").split("?")[0] || "/";
  return raw.startsWith("/") ? raw : "/" + raw;
}

function renderNotFound() {
  return (
    nav("") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Page not found</h1>" +
    '<p class="lede">Nothing is at this address.</p>' +
    '<div class="cta-row"><a class="btn btn-primary" href="#/">Home</a><a class="btn btn-ghost" href="#/map">Herd view</a></div>' +
    "</section></main>" +
    footer()
  );
}

let firstRender = true;
let renderToken = 0;

/** Tell screen readers which page is now showing. */
function announce(title) {
  const region = document.getElementById("route-announcer");
  if (!region) return;
  region.textContent = "";
  // A short delay makes screen readers read the new text.
  setTimeout(() => {
    region.textContent = title;
  }, 50);
}

/** Move keyboard focus to the main content. */
function focusMain() {
  const main = document.getElementById("main");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function render() {
  const path = pathFromHash();
  // The skip link points at #main. That is not a page, so just move focus.
  if (path === "/main") {
    focusMain();
    return;
  }
  const route = routes[path];
  const title = route ? route.title : "Page not found · FiberShare";
  document.title = title;
  leaveMap();
  const app = document.getElementById("app");
  const token = ++renderToken;
  // Async pages show a skeleton of the same shape first, so nothing jumps.
  if (route?.skeleton) {
    app.innerHTML = nav(path) + skeleton(route.skeleton) + footer();
    bindTheme(app);
  }
  const html = route ? await route.render() : renderNotFound();
  if (token !== renderToken) return; // a newer route won the race
  app.innerHTML = html;
  bindTheme(app);
  if (path === "/map") bindMap(app);
  if (path === "/trace" || path === "/shop") bindTrace(app);
  if (path === "/rancher") bindRancher(app);
  app.querySelectorAll("[data-retry]").forEach((btn) => btn.addEventListener("click", () => render()));
  app.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    focusMain();
  });
  // Leave focus alone on the first load. On every page change after that,
  // move focus to the main content and announce the new page.
  if (firstRender) {
    firstRender = false;
  } else {
    focusMain();
    announce(title);
  }
  tourAfterRender(app);
}

window.addEventListener("hashchange", render);
render();
