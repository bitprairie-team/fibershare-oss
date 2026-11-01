import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";
import { REPO } from "./sites.js";
import { RECORDS } from "./records-data.js";
import { traceLot, visibleRecord } from "./records.js";

const LOT_ID = "mohair-bramble";
const VIEWER_LABELS = {
  rancher: "Rancher",
  buyers: "Buyer",
  public: "Public",
};
const FIELD_LABELS = {
  species: "Species",
  breed: "Breed",
  name: "Name",
  tag: "Ear tag",
  birthYear: "Born",
  color: "Color",
  animalId: "Animal",
  date: "Date",
  ageClass: "Age class",
  shearingId: "Shearing",
  weightGrams: "Weight",
  micron: "Micron",
  fleeceIds: "Fleeces",
  form: "Form",
};

let viewer = "rancher";

/** Back to the rancher's own view, for "Reset demo". */
export function resetTrace() {
  viewer = "rancher";
}

function value(key, v) {
  if (Array.isArray(v)) return v.map(esc).join(", ");
  if (key === "weightGrams") return esc(v) + " g";
  if (key === "micron") return esc(v) + " µm";
  return esc(v);
}

// Record IDs are long. Show them in a smaller mono face that can break anywhere.
const ID_FIELDS = new Set(["id", "fleeceIds", "shearingId", "animalId"]);

function card(kind, record) {
  const shown = visibleRecord(record, viewer);
  const audience = record?.sharing?.audience || "private";
  const head =
    '<header><span class="trace-kind">' + esc(kind) + "</span>" +
    '<span class="trace-share">' + (audience === "public" ? "Public" : "Shared with " + esc(audience)) + "</span></header>";
  if (!shown) {
    return (
      '<li class="trace-card is-hidden">' + head +
      '<h2>Not shared</h2><p class="muted">The rancher shares this ' + esc(kind.toLowerCase()) +
      " record with " + esc(audience) + " only.</p></li>"
    );
  }
  // The record ID is already the card heading, so it is not repeated below.
  const rows = Object.entries(shown.fields)
    .filter(([k]) => k !== "id")
    .map(([k, v]) => "<dt>" + esc(FIELD_LABELS[k] || k) + "</dt><dd" + (ID_FIELDS.has(k) ? ' class="fact-id"' : "") + ">" + value(k, v) + "</dd>")
    .join("");
  const hidden = shown.hidden.length
    ? '<p class="fine-print">Kept private: ' + shown.hidden.map((k) => esc(FIELD_LABELS[k] || k)).join(", ") + "</p>"
    : "";
  return (
    '<li class="trace-card">' + head +
    "<h2>" + esc(record.id) + "</h2>" +
    '<dl class="facts">' + rows + "</dl>" + hidden + "</li>"
  );
}

function chainHtml() {
  const chain = traceLot(LOT_ID, RECORDS);
  if (!chain) return '<div class="empty">The sample lot was not found in docs/schemas/examples.</div>';
  const step = chain.steps[0] || {};
  const cards = [
    card("Fiber lot", chain.lot),
    card("Fleece", step.fleece),
    card("Shearing", step.shearing),
    card("Animal", step.animal),
  ];
  // Once one record is hidden, the links after it are hidden too.
  let blocked = false;
  const out = [];
  for (const html of cards) {
    if (blocked) {
      out.push('<li class="trace-card is-hidden"><header><span class="trace-kind">Hidden</span></header><p class="muted">The record before this one is not shared.</p></li>');
      continue;
    }
    out.push(html);
    if (html.includes("is-hidden")) blocked = true;
  }
  return '<ol class="trace-chain" data-tour="chain" aria-label="From fiber lot back to the animal">' + out.join("") + "</ol>";
}

function lotsTable(products) {
  if (products === null) {
    return '<p class="notice" role="alert">The fiber lots did not load from public/data/shop.json. <button type="button" class="btn-link" data-retry>Try again</button></p>';
  }
  if (!products.length) return '<p class="muted">No fiber lots yet. Add lots to public/data/shop.json.</p>';
  const rows = products
    .map(
      (p) =>
        "<tr><th scope=\"row\">" + esc(p.name) + (p.id === LOT_ID ? ' <span class="muted">(traced above)</span>' : "") + "</th><td>" + esc(p.fiber) + '</td><td class="num">' + esc(p.grams) + " g</td></tr>"
    )
    .join("");
  return (
    '<div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">Lot</th><th scope="col">Fiber from</th><th scope="col" class="num">Weight</th></tr></thead>' +
    "<tbody>" + rows + "</tbody></table></div>"
  );
}

async function loadLots() {
  try {
    const response = await fetch("/data/shop.json", { cache: "no-store" });
    if (!response.ok) throw new Error("shop.json " + response.status);
    const data = await response.json();
    return data.products || [];
  } catch {
    return null;
  }
}

export async function renderTrace() {
  const products = await loadLots();
  const chips = Object.entries(VIEWER_LABELS)
    .map(
      ([key, label]) =>
        '<button type="button" class="chip" data-viewer="' + key + '" aria-pressed="' + (key === viewer) + '">' + label + "</button>"
    )
    .join("");
  return (
    nav("/trace") +
    '<main class="wrap wrap-wide" id="main">' +
    '<section class="page-head">' +
    "<h1>Fleece trace</h1>" +
    '<p class="lede">The mohair-bramble lot traced back to Bramble, the goat it came from. The rancher sets who can see each record.</p>' +
    "</section>" +
    '<div class="trace-controls"><span class="row-meta" id="viewer-label">View as</span><div class="segmented" role="group" aria-labelledby="viewer-label">' +
    chips +
    "</div></div>" +
    '<div data-chain aria-live="polite">' +
    chainHtml() +
    "</div>" +
    '<p class="fine-print trace-note">Each record names the one before it, from the lot back to the goat. ' +
    'Bramble is a sample goat, and the weights and dates are made up. The record format is a draft. <a href="' +
    REPO +
    '/blob/main/docs/schemas/README.md"' +
    EXT +
    ">Schema notes</a></p>" +
    '<section class="section" aria-labelledby="lots-title">' +
    '<h2 id="lots-title">Sample fiber lots</h2>' +
    '<p class="muted section-note">Nothing here is for sale.</p>' +
    lotsTable(products) +
    "</section></main>" +
    footer()
  );
}

export function bindTrace(root) {
  root.querySelectorAll("[data-viewer]").forEach((chip) => {
    chip.addEventListener("click", () => {
      viewer = chip.dataset.viewer;
      root.querySelectorAll("[data-viewer]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      const holder = root.querySelector("[data-chain]");
      if (holder) holder.innerHTML = chainHtml();
    });
  });
}
