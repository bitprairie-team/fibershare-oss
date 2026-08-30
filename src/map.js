import { nav, footer } from "./layout.js";

export async function renderMap() {
  let data;
  try {
    data = await (await fetch("/data/herd.json")).json();
  } catch {
    data = { ranch: "Sample herd", goats: [] };
  }
  const goats = (data.goats || [])
    .map((g) => {
      return (
        '<button class="goat" type="button" style="left:' +
        g.x +
        '%;top:' +
        g.y +
        '%" data-id="' +
        g.id +
        '" aria-label="' +
        g.name +
        '"></button>'
      );
    })
    .join("");
  const list = (data.goats || [])
    .map((g) => {
      return (
        '<article class="card" id="goat-' +
        g.id +
        '"><h3>' +
        g.name +
        '</h3><p>' +
        g.breed +
        ' · ' +
        g.color +
        '</p><p class="muted">' +
        g.status +
        ' · ' +
        g.fiber +
        '</p></article>'
      );
    })
    .join("");
  return (
    nav("/map") +
    '<main class="wrap"><section class="hero"><p class="kicker">Herd map</p><h1>' +
    (data.ranch || "Sample herd") +
    '</h1><p class="lede">' +
    (data.note || "") +
    '</p></section><div class="pasture" id="pasture">' +
    goats +
    '</div><div class="goat-panel grid">' +
    list +
    '</div></main>' +
    footer()
  );
}

export function bindMap(root) {
  root.querySelectorAll(".goat").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .getElementById("goat-" + btn.dataset.id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}
