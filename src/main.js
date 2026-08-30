import "./style.css";
import { bindTheme } from "./layout.js";
import { renderHome } from "./home.js";
import { renderMap, bindMap } from "./map.js";
import { renderShop } from "./shop.js";
import { renderArchitecture } from "./architecture.js";

const routes = {
  "/": renderHome,
  "/map": renderMap,
  "/shop": renderShop,
  "/architecture": renderArchitecture,
};

function pathFromHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : "/" + raw;
}

async function render() {
  const path = pathFromHash();
  const view = routes[path] || renderHome;
  const html = await view();
  const app = document.getElementById("app");
  app.innerHTML = html;
  bindTheme(app);
  if (path === "/map") bindMap(app);
}

window.addEventListener("hashchange", render);
render();
