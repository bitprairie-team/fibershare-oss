import { nav, footer } from "./layout.js";
import { esc } from "./util.js";

export async function renderMap() {
  let data;
  try {
    data = await (await fetch("/data/herd.json")).json();
  } catch {
    data = { ranch: "Sample herd", goats: [], note: "Could not load sample herd data." };
  }
  const goats = data.goats || [];
  const pins = goats
    .map((g) => {
      const id = esc(g.id);
      const name = esc(g.name);
      const x = Number(g.x);
      const y = Number(g.y);
      const left = Number.isFinite(x) ? x : 50;
      const top = Number.isFinite(y) ? y : 50;
      return (
        '<button class="goat" type="button" style="left:' +
        left +
        "%;top:" +
        top +
        '%" data-id="' +
        id +
        '" aria-label="' +
        name +
        " on the pasture" +
        '"></button>'
      );
    })
    .join("");
  const list = goats
    .map((g, i) => {
      const n = String(i + 1).padStart(2, "0");
      const id = esc(g.id);
      return (
        '<li id="goat-' +
        id +
        '">' +
        '<button type="button" class="goat-row" data-goat-card="' +
        id +
        '" aria-pressed="false">' +
        '<span class="feature-num" aria-hidden="true">' +
        n +
        "</span>" +
        "<div>" +
        "<h3>" +
        esc(g.name) +
        '</h3><p class="row-meta">' +
        esc(g.status) +
        " · " +
        esc(g.breed) +
        " · " +
        esc(g.color) +
        '</p><p class="muted">' +
        esc(g.fiber) +
        "</p></div></button></li>"
      );
    })
    .join("");
  const body = goats.length
    ? '<div class="map-split">' +
      '<div class="pasture" id="pasture" role="group" aria-label="Pasture with sample collar pins">' +
      pins +
      '<div class="pasture-legend">' +
      goats.length +
      " sample pins · demo only</div></div>" +
      '<ol class="goat-list" aria-label="Sample herd">' +
      list +
      "</ol></div>"
    : '<div class="empty">No sample goats loaded. Check public/data/herd.json.</div>';

  return (
    nav("/map") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>" +
    esc(data.ranch || "Sample herd") +
    '</h1><p class="lede">' +
    esc(data.note || "") +
    "</p></section>" +
    body +
    "</main>" +
    footer()
  );
}

export function bindMap(root) {
  const cards = root.querySelectorAll("[data-goat-card]");
  const clear = () => {
    root.querySelectorAll(".goat.is-active").forEach((el) => el.classList.remove("is-active"));
    cards.forEach((card) => {
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    });
  };
  root.querySelectorAll(".goat").forEach((btn) => {
    btn.addEventListener("click", () => {
      clear();
      btn.classList.add("is-active");
      const card = root.querySelector('[data-goat-card="' + btn.dataset.id + '"]');
      card?.classList.add("selected");
      card?.setAttribute("aria-pressed", "true");
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      clear();
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
      const pin = root.querySelector('.goat[data-id="' + card.dataset.goatCard + '"]');
      pin?.classList.add("is-active");
    });
  });
}
