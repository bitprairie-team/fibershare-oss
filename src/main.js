import "./style.css";
import { bindTheme, nav, footer } from "./layout.js";
import { renderHome } from "./home.js";
import { renderMap, bindMap } from "./map.js";
import { renderShop } from "./shop.js";
import { renderArchitecture } from "./architecture.js";

const routes = {
  "/": { render: renderHome, title: "FiberShare · follow a herd" },
  "/map": { render: renderMap, title: "Herd map · FiberShare" },
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
    '<p class="lede">This page isn\'t on FiberShare. Try Herd map, Fiber shop, or Home.</p>' +
    '<div class="cta-row">' +
    '<a class="btn btn-primary" href="#/">Home</a>' +
    '<a class="btn btn-ghost" href="#/map">Herd map</a>' +
    '<a class="btn btn-ghost" href="#/shop">Fiber shop</a>' +
    "</div></section></main>" +
    footer()
  );
}

async function render() {
  const path = pathFromHash();
  const route = routes[path];
  document.title = route ? route.title : "Page not found · FiberShare";
  const html = route ? await route.render() : renderNotFound();
  const app = document.getElementById("app");
  app.innerHTML = html;
  bindTheme(app);
  if (path === "/map") bindMap(app);
}

window.addEventListener("hashchange", render);
render();
