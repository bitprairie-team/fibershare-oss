import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";

export async function renderShop() {
  let data;
  let loadFailed = false;
  try {
    data = await (await fetch("/data/shop.json")).json();
  } catch {
    loadFailed = true;
    data = { products: [] };
  }
  const products = data.products || [];
  const list = products
    .map((p, i) => {
      const n = String(i + 1).padStart(2, "0");
      const badge = p.inStock
        ? '<span class="badge">sample</span>'
        : '<span class="badge out">not for sale</span>';
      const usd = Number(p.usd);
      const price = Number.isFinite(usd) ? usd : esc(p.usd);
      return (
        '<li class="catalog-row">' +
        '<span class="feature-num" aria-hidden="true">' +
        n +
        "</span>" +
        '<div class="catalog-main">' +
        "<h3>" +
        esc(p.name) +
        '</h3><p class="row-meta">' +
        esc(p.fiber) +
        " · " +
        esc(p.grams) +
        "g lot</p></div>" +
        '<div class="catalog-meta"><strong>USD ' +
        price +
        "</strong> " +
        badge +
        "</div></li>"
      );
    })
    .join("");
  let lede;
  let body;
  if (loadFailed) {
    lede = "The fiber list did not load.";
    body =
      '<div class="empty">Check public/data/shop.json, then reload this page.</div>';
  } else if (!products.length) {
    lede = "This page lists sample fiber.";
    body =
      '<div class="empty">No fiber lots are listed yet. Add them in public/data/shop.json and reload.</div>';
  } else {
    lede =
      'These fiber lots are samples. You cannot buy them on this page. To order, use the <a href="https://fibershare.app"' +
      EXT +
      ">FiberShare app</a> or the <a href=\"https://fibershare.us\"" +
      EXT +
      ">US shop</a>.";
    body =
      '<ol class="catalog-list" aria-label="Sample fiber lots">' + list + "</ol>";
  }

  return (
    nav("/shop") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Sample fiber</h1>" +
    '<p class="lede">' +
    lede +
    "</p></section>" +
    body +
    "</main>" +
    footer()
  );
}
