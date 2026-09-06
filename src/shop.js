import { nav, footer } from "./layout.js";

export async function renderShop() {
  let data;
  try {
    data = await (await fetch("/data/shop.json")).json();
  } catch {
    data = { products: [], note: "Could not load the stub catalog." };
  }
  const products = data.products || [];
  const list = products
    .map((p) => {
      const badge = p.inStock
        ? '<span class="badge">in stock</span>'
        : '<span class="badge out">sample only</span>';
      return (
        '<article class="card product"><div><p class="kicker">' +
        p.fiber +
        "</p><h3>" +
        p.name +
        '</h3><p class="muted">' +
        p.grams +
        "g lot</p></div><div class="product-meta"><strong>USD " +
        p.usd +
        "</strong> " +
        badge +
        "</div></article>"
      );
    })
    .join("");
  const body = products.length
    ? '<div class="grid">' + list + "</div>"
    : '<div class="empty">No stub products loaded. Check public/data/shop.json.</div>';

  return (
    nav("/shop") +
    '<main class="wrap" id="main"><section class="hero"><p class="kicker">Fiber shop</p><h1>Stub catalog</h1><p class="lede">' +
    (data.note || "Demo lots for the OSS MVP.") +
    ' Real ordering belongs on <a href="https://fibershare.app" rel="noopener">fibershare.app</a> (Expo) and the paid US web at <a href="https://fibershare.us" rel="noopener">fibershare.us</a>.</p></section>' +
    body +
    "</main>" +
    footer()
  );
}
