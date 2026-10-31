import { nav, footer } from "./layout.js";
import { esc } from "./util.js";
import { RECORDS } from "./records-data.js";
import { icon } from "./icons.js";

const TRACEABLE = new Set(RECORDS.lots.map((lot) => lot.id));

// A fiber color for each sample lot's picture. Drawn with CSS, no images.
const SWATCHES = {
  "roving-juniper": "#cdb48f",
  "yarn-pasture": "#8f9a6c",
  "mohair-bramble": "#e9dcc4",
  "collar-kit": "#9c8a76",
};

function product(p) {
  const kit = /hardware/i.test(p.fiber || "");
  return (
    '<li class="product">' +
    '<div class="swatch" style="--sw:' + esc(SWATCHES[p.id] || "#d9c7a8") + '" aria-hidden="true">' + icon(kit ? "signal" : "fleece", { size: 22 }) + "</div>" +
    '<div class="product-body">' +
    "<h3>" + esc(p.name) + "</h3>" +
    '<p class="product-meta"><span>' + esc(p.fiber) + "</span><span aria-hidden=\"true\">·</span><span>" + esc(p.grams) + " g</span>" +
    (p.inStock === false ? '<span class="badge badge-quiet">Out of stock</span>' : "") + "</p>" +
    (TRACEABLE.has(p.id) ? '<a class="link-arrow" href="#/trace">Trace it back to the goat' + icon("arrowRight", { size: 16 }) + "</a>" : "") +
    "</div></li>"
  );
}

function stateBox(kind, iconName, title, text, action = "") {
  return (
    '<div class="state state-' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '"><span class="state-icon">' + icon(iconName, { size: 22 }) + "</span>" +
    "<h2>" + title + "</h2><p>" + text + "</p>" + action + "</div>"
  );
}

export async function renderShop() {
  let data;
  let loadFailed = false;
  try {
    const response = await fetch("/data/shop.json", { cache: "no-store" });
    if (!response.ok) throw new Error("shop.json " + response.status);
    data = await response.json();
  } catch {
    loadFailed = true;
    data = { products: [] };
  }
  const products = data.products || [];
  let body;
  if (loadFailed) {
    body = stateBox(
      "error",
      "alert",
      "The fiber list did not load",
      "The page could not read public/data/shop.json. Check the file, then try again.",
      '<button type="button" class="btn btn-primary" data-retry>' + icon("reset", { size: 18 }) + "Try again</button>"
    );
  } else if (!products.length) {
    body = stateBox("empty", "bag", "No fiber lots yet", "Add lots to public/data/shop.json, then reload this page.");
  } else {
    body =
      '<p class="notice notice-row">' + icon("info", { size: 18 }) + "<span>These are sample lots. Nothing on this page is for sale, and there is no checkout.</span></p>" +
      '<ul class="product-grid" aria-label="Sample fiber lots">' + products.map(product).join("") + "</ul>";
  }

  return (
    nav("/shop") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    '<div class="title-row"><h1>Sample fiber</h1><span class="badge badge-planned">Checkout planned</span></div>' +
    '<p class="lede">Fiber from the sample herd. A lot made from one goat\'s fleece links back to that goat.</p></section>' +
    body +
    "</main>" +
    footer()
  );
}
