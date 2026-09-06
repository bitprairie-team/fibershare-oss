import { nav, footer } from "./layout.js";

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
      return (
        '<button class="goat" type="button" style="left:' +
        g.x +
        "%;top:" +
        g.y +
        '%" data-id="' +
        g.id +
        '" aria-label="' +
        g.name +
        " on the pasture" +
        '"></button>'
      );
    })
    .join("");
  const list = goats
    .map((g) => {
      return (
        '<article class="card" id="goat-' +
        g.id +
        '" data-goat-card="' +
        g.id +
        '"><p class="kicker">' +
        g.status +
        "</p><h3>" +
        g.name +
        "</h3><p>" +
        g.breed +
        " · " +
        g.color +
        '</p><p class="muted">' +
        g.fiber +
        "</p></article>"
      );
    })
    .join("");
  const body = goats.length
    ? '<div class="pasture" id="pasture" role="img" aria-label="Pasture with sample collar pins">' +
      pins +
      '<div class="pasture-legend">' +
      goats.length +
      " sample pins · demo only</div></div>" +
      '<div class="goat-panel grid">' +
      list +
      "</div>"
    : '<div class="empty">No sample goats loaded. Check public/data/herd.json.</div>';

  return (
    nav("/map") +
    '<main class="wrap" id="main"><section class="hero"><p class="kicker">Herd map</p><h1>' +
    (data.ranch || "Sample herd") +
    '</h1><p class="lede">' +
    (data.note || "") +
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
    cards.forEach((card) => card.classList.remove("selected"));
  };
  root.querySelectorAll(".goat").forEach((btn) => {
    btn.addEventListener("click", () => {
      clear();
      btn.classList.add("is-active");
      const card = root.querySelector('[data-goat-card="' + btn.dataset.id + '"]');
      card?.classList.add("selected");
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}
