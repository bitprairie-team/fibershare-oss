import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";

export async function renderShop() {
  let data;
  try {
    data = await (await fetch("/data/shop.json")).json();
  } catch {
    data = { products: [], note: "Could not load the stub catalog." };
  }
  const products = data.products || [];
  const list = products
    .map((p, i) => {
      const n = String(i + 1).padStart(2, "0");
      const badge = p.inStock
        ? '<span class="badge">in stock</span>'
        : '<span class="badge out">sample only</span>';
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
  const body = products.length
    ? '<ol class="catalog-list" aria-label="Stub fiber catalog">' + list + "</ol>"
    : '<div class="empty">No stub products loaded. Check public/data/shop.json.</div>';

  return (
    nav("/shop") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>Stub catalog</h1>" +
    '<p class="lede">' +
    esc(data.note || "Demo lots for the OSS MVP.") +
    ' Real ordering belongs on <a href="https://fibershare.app"' +
    EXT +
    ">fibershare.app</a> (Expo) and the paid US web at <a href="https://fibershare.us"' +
    EXT +
    ">fibershare.us</a>.</p>" +
    "</section>" +
    body +
    "</main>" +
    footer()
  );
}
