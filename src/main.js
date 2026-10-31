import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "./style.css";
import { bindTheme, nav, footer } from "./layout.js";
import { renderHome } from "./home.js";
import { renderMap, bindMap, leaveMap } from "./map.js";
import { renderTrace, bindTrace } from "./trace.js";
import { renderSetups } from "./setups.js";
import { renderShop } from "./shop.js";
import { renderArchitecture } from "./architecture.js";

const routes = {
  "/": { render: renderHome, title: "Home · FiberShare" },
  "/map": { render: renderMap, title: "Herd view · FiberShare" },
  "/trace": { render: renderTrace, title: "Fleece to fiber lot · FiberShare" },
  "/setups": { render: renderSetups, title: "Three setups · FiberShare" },
  "/shop": { render: renderShop, title: "Sample fiber · FiberShare" },
  "/architecture": {
    render: renderArchitecture,
    title: "How it is built · FiberShare",
  },
};

function pathFromHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : "/" + raw;
}

function renderNotFound() {
  return (
    nav("") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Page not found</h1>" +
    '<p class="lede">This page isn\'t on FiberShare. Try the herd view, the fiber shop, or Home.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="#/">Home</a>' +
    '<a class="btn btn-ghost" href="#/map">Herd view</a>' +
    '<a class="btn btn-ghost" href="#/shop">Fiber shop</a>' +
    "</div></section></main>" +
    footer()
  );
}

let firstRender = true;

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
  const html = route ? await route.render() : renderNotFound();
  const app = document.getElementById("app");
  app.innerHTML = html;
  bindTheme(app);
  if (path === "/map") bindMap(app);
  if (path === "/trace") bindTrace(app);
  app.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    focusMain();
  });
  // Leave focus alone on the first load. On every page change after that,
  // move focus to the main content and announce the new page.
  if (firstRender) {
    firstRender = false;
    return;
  }
  focusMain();
  announce(title);
}

window.addEventListener("hashchange", render);
render();
