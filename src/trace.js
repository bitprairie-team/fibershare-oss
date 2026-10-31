import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";
import { REPO } from "./sites.js";
import { RECORDS } from "./records-data.js";
import { traceLot, visibleRecord } from "./records.js";
import { icon } from "./icons.js";

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

function card(kind, file, record, schemaFile) {
  const shown = visibleRecord(record, viewer);
  const audience = record?.sharing?.audience || "private";
  const head =
    '<header><span class="trace-kind">' + esc(kind) + "</span>" +
    '<span class="badge' + (audience === "public" ? " badge-live" : " badge-quiet") + '">' + (audience === "public" ? "Public" : "Shared with " + esc(audience)) + "</span></header>";
  if (!shown) {
    return (
      '<li class="trace-card is-hidden">' + head +
      '<h3>' + icon("lock", { size: 16 }) + ' Not shared with this viewer</h3><p class="muted">The rancher shares this ' + esc(kind.toLowerCase()) +
      " record with " + esc(audience) + " only. The chain stops here for this viewer.</p></li>"
    );
  }
  const rows = Object.entries(shown.fields)
    .map(([k, v]) => "<dt>" + esc(FIELD_LABELS[k] || k) + "</dt><dd" + (ID_FIELDS.has(k) ? ' class="fact-id"' : "") + ">" + value(k, v) + "</dd>")
    .join("");
  const hidden = shown.hidden.length
    ? '<p class="fine-print">Kept private: ' + shown.hidden.map((k) => esc(FIELD_LABELS[k] || k)).join(", ") + "</p>"
    : "";
  return (
    '<li class="trace-card">' + head +
    "<h3><code title=\"" + esc(record.id) + "\">" + esc(record.id) + "</code></h3>" +
    '<dl class="facts">' + rows + "</dl>" + hidden +
    '<p class="trace-file"><a href="' + REPO + "/blob/main/docs/schemas/" + esc(schemaFile) + '"' + EXT + ">" + esc(file) + "</a></p></li>"
  );
}

function chainHtml() {
  const chain = traceLot(LOT_ID, RECORDS);
  if (!chain) return '<div class="empty">The sample lot was not found in docs/schemas/examples.</div>';
  const step = chain.steps[0] || {};
  const cards = [
    card("Fiber lot", "fiber-lot.example.json", chain.lot, "fiber-lot.schema.json"),
    card("Fleece", "fleece.example.json", step.fleece, "fleece.schema.json"),
    card("Shearing", "shearing.example.json", step.shearing, "shearing.schema.json"),
    card("Animal", "animal.example.json", step.animal, "animal.schema.json"),
  ];
  // Once one record is hidden, the links after it are hidden too.
  let blocked = false;
  const out = [];
  for (const html of cards) {
    if (blocked) {
      out.push('<li class="trace-card is-hidden"><header><span class="trace-kind">Hidden</span></header><p class="muted">Hidden because the record before it is not shared.</p></li>');
      continue;
    }
    out.push(html);
    if (html.includes("is-hidden")) blocked = true;
  }
  return '<ol class="trace-chain" data-tour="chain" aria-label="From fiber lot back to the animal">' + out.join("") + "</ol>";
}

export function renderTrace() {
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
    "<h1>From fleece to fiber lot</h1>" +
    '<p class="lede">Follow the mohair-bramble lot back to Bramble, the goat it came from. Each record has its own sharing setting, and the rancher picks it.</p>' +
    "</section>" +
    '<div class="trace-controls"><span class="row-meta" id="viewer-label">See it as</span><div class="segmented" role="group" aria-labelledby="viewer-label">' +
    chips +
    "</div></div>" +
    '<div data-chain aria-live="polite">' +
    chainHtml() +
    "</div>" +
    '<section class="section">' +
    '<h2 class="section-rule">How it links</h2>' +
    '<ul class="steps">' +
    '<li class="tile"><span class="tile-icon">' + icon("bag") + '</span><h3>Lot to fleece</h3><p>The lot lists its fleeces in <code>fleeceIds</code>. One lot can hold many fleeces.</p></li>' +
    '<li class="tile"><span class="tile-icon">' + icon("fleece") + '</span><h3>Fleece to shearing</h3><p>Each fleece names the shearing it came from in <code>shearingId</code>.</p></li>' +
    '<li class="tile"><span class="tile-icon">' + icon("herd") + '</span><h3>Shearing to animal</h3><p>Each shearing names its animal in <code>animalId</code>, and has a date.</p></li>' +
    "</ul>" +
    '<p class="fine-print">Bramble is a sample goat. The weights and dates are made up. The record format is a draft, open for comment. <a href="' +
    REPO +
    '/blob/main/docs/schemas/README.md"' +
    EXT +
    ">Read the schema notes</a></p>" +
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
