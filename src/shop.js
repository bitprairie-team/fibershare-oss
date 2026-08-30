import { nav, footer } from "./layout.js";

export async function renderShop() {
  let data;
  try {
    data = await (await fetch("/data/shop.json")).json();
  } catch {
    data = { products: [] };
  }
  const products = (data.products || [])
    .map((p) => {
      const badge = p.inStock
        ? '<span class="badge">in stock</span>'
        : '<span class="badge out">sample only</span>';
      return (
        '<article class="card product"><div><h3>' +
        p.name +
        '</h3><p class="muted">' +
        p.fiber +
        ' · ' +
        p.grams +
        'g</p></div><div><strong>USD ' +
        p.usd +
        '</strong> ' +
        badge +
        '</div></article>'
      );
    })
    .join("");
  return (
    nav("/shop") +
    '<main class="wrap"><section class="hero"><p class="kicker">Fiber shop</p><h1>Stub catalog</h1><p class="lede">' +
    (data.note || "") +
    ' Real ordering belongs on <a href="https://fibershare.app">fibershare.app</a> (Expo) and the paid US web at <a href="https://fibershare.us">fibershare.us</a>.</p></section><div class="grid">' +
    products +
    '</div></main>' +
    footer()
  );
}
