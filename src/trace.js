import { nav, footer } from "./layout.js";
import { esc, EXT } from "./util.js";
import { REPO } from "./sites.js";
import { RECORDS } from "./records-data.js";
import { traceLot, visibleRecord } from "./records.js";
import { readJobs } from "./settings.js";
import { timeOf } from "./time.js";
import { BODY, FINE, HEAD, LEDE, MAIN, SECTION, SECTION_TITLE } from "./ui.js";

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
// When the trace job last linked the records, or null while it is off and
// the rancher has not linked them by hand.
let linkedAt = null;
let linkedByHand = false;

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

const ID_FIELDS = new Set(["id", "fleeceIds", "shearingId", "animalId"]);

// One record is one ruled row: what it is and who sees it on the left, its
// fields on the right, two to a line on wide screens.
const ROW = "trace-card grid gap-x-12 gap-y-3 py-5 lg:grid-cols-[14rem_minmax(0,1fr)]";
const FACTS = "grid max-w-content grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_7rem_minmax(0,1fr)]";

function rowHead(kind, step, title, audience) {
  return (
    '<div class="min-w-0"><p class="text-sm text-muted">' + (step ? '<span class="tabular-nums">' + step + ".</span> " : "") + esc(kind) + "</p>" +
    '<h2 class="mt-1 text-base break-all">' + title + "</h2>" +
    (audience ? '<p class="mt-1 text-xs text-muted">' + (audience === "public" ? "Public" : "Shared with " + esc(audience)) + "</p>" : "") +
    "</div>"
  );
}

function card(kind, record, step) {
  const shown = visibleRecord(record, viewer);
  const audience = record?.sharing?.audience || "private";
  if (!shown) {
    return (
      '<li class="' + ROW + ' is-hidden">' + rowHead(kind, step, "Not shared", audience) +
      '<p class="text-sm text-muted">The rancher shares this ' + esc(kind.toLowerCase()) + " record with " + esc(audience) + " only.</p></li>"
    );
  }
  // The record ID is already the row heading, so it is not repeated below.
  const rows = Object.entries(shown.fields)
    .filter(([k]) => k !== "id")
    .map(([k, v]) => '<dt class="text-muted">' + esc(FIELD_LABELS[k] || k) + '</dt><dd class="min-w-0 text-ink tabular-nums' + (ID_FIELDS.has(k) ? " break-all" : "") + '">' + value(k, v) + "</dd>")
    .join("");
  const hidden = shown.hidden.length
    ? '<p class="mt-2 text-xs text-muted">Kept private: ' + shown.hidden.map((k) => esc(FIELD_LABELS[k] || k)).join(", ") + "</p>"
    : "";
  return '<li class="' + ROW + '">' + rowHead(kind, step, esc(record.id), audience) + '<div class="min-w-0"><dl class="' + FACTS + '">' + rows + "</dl>" + hidden + "</div></li>";
}

const CHAIN = "trace-chain divide-y divide-rule border-y border-ink";
const WHY = "trace-why mb-5 max-w-[72ch] text-sm text-ink-2 focus:outline-none";

function unlinkedHtml() {
  const cards = [
    ...RECORDS.lots.map((r) => card("Fiber lot", r)),
    ...RECORDS.fleeces.map((r) => card("Fleece", r)),
    ...RECORDS.shearings.map((r) => card("Shearing", r)),
    ...RECORDS.animals.map((r) => card("Animal", r)),
  ];
  return (
    '<p class="' + WHY + '" data-trace-why>Tracing is off, so the records are not linked. Each one lists the ID of the record before it. ' +
    '<button type="button" class="btn-link" data-link-once>Link them once</button></p>' +
    '<ul class="' + CHAIN + ' is-unlinked" data-tour="chain" aria-label="Records as entered, not linked">' + cards.join("") + "</ul>"
  );
}

function whyText(chain) {
  const step = chain.steps[0] || {};
  const how = linkedByHand ? "Linked by hand at " + timeOf(linkedAt) + ". Tracing stays off." : "Linked by the trace job at " + timeOf(linkedAt) + ".";
  // Only the rancher may see the IDs of records that are not shared.
  if (viewer !== "rancher") return how + " Only the records shared with this viewer are shown.";
  const parts = [
    step.fleece ? "the lot lists fleece " + step.fleece.id : "",
    step.shearing ? "the fleece names shearing " + step.shearing.id : "",
    step.animal ? "the shearing names animal " + step.animal.id : "",
  ].filter(Boolean);
  return how + (parts.length ? " Why: " + parts.join(", ").replace(/, ([^,]*)$/, " and $1") + "." : "");
}

function chainHtml() {
  if (!linkedAt) return unlinkedHtml();
  const chain = traceLot(LOT_ID, RECORDS);
  if (!chain) return '<p class="border-y border-rule py-5 text-ink-2">The sample lot was not found in docs/schemas/examples.</p>';
  const step = chain.steps[0] || {};
  const cards = [
    card("Fiber lot", chain.lot, 1),
    card("Fleece", step.fleece, 2),
    card("Shearing", step.shearing, 3),
    card("Animal", step.animal, 4),
  ];
  // Once one record is hidden, the links after it are hidden too.
  let blocked = false;
  const out = [];
  for (const html of cards) {
    if (blocked) {
      out.push('<li class="' + ROW + ' is-hidden">' + rowHead("Hidden", out.length + 1, "Not shown", "") + '<p class="text-sm text-muted">The record before this one is not shared.</p></li>');
      continue;
    }
    out.push(html);
    if (html.includes("is-hidden")) blocked = true;
  }
  return (
    '<p class="' + WHY + '" data-trace-why>' + esc(whyText(chain)) + "</p>" +
    '<ol class="' + CHAIN + '" data-tour="chain" aria-label="From fiber lot back to the animal">' + out.join("") + "</ol>"
  );
}

function lotsTable(products) {
  if (products === null) {
    return '<p class="text-ink-2" role="alert">The fiber lots did not load from public/data/shop.json. <button type="button" class="btn-link" data-retry>Try again</button></p>';
  }
  if (!products.length) return '<p class="text-muted">No fiber lots yet. Add lots to public/data/shop.json.</p>';
  const rows = products
    .map(
      (p) =>
        "<tr><th scope=\"row\">" + esc(p.name) + (p.id === LOT_ID ? ' <span class="font-normal text-muted">(traced above)</span>' : "") + "</th><td>" + esc(p.fiber) + '</td><td class="num">' + esc(p.grams) + " g</td></tr>"
    )
    .join("");
  return (
    '<div class="overflow-x-auto"><table class="data-table"><thead><tr><th scope="col">Lot</th><th scope="col">Fiber from</th><th scope="col" class="num">Weight</th></tr></thead>' +
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

// A shared link can open the trace as a buyer or the public sees it:
// #/trace?view=buyers or #/trace?view=public.
function viewerFromHash() {
  const asked = new URLSearchParams(location.hash.split("?")[1] || "").get("view");
  if (asked === "buyer") return "buyers";
  return Object.hasOwn(VIEWER_LABELS, asked || "") ? asked : null;
}

export async function renderTrace() {
  const products = await loadLots();
  viewer = viewerFromHash() || viewer;
  linkedByHand = false;
  linkedAt = readJobs().trace ? new Date().toISOString() : null;
  const chips = Object.entries(VIEWER_LABELS)
    .map(
      ([key, label]) =>
        '<button type="button" class="chip" data-viewer="' + key + '" aria-pressed="' + (key === viewer) + '">' + label + "</button>"
    )
    .join("");
  return (
    nav("/trace") +
    '<main class="' + MAIN + '" id="main">' +
    '<section class="' + HEAD + '">' +
    "<h1>Fleece trace</h1>" +
    '<p class="' + LEDE + '">' +
    (linkedAt
      ? "The mohair-bramble lot traced back to Bramble, the goat it came from."
      : "The records for the mohair-bramble lot, as the rancher entered them. Follow each ID back to the goat.") +
    " The rancher sets who can see each record.</p>" +
    "</section>" +
    '<div class="trace-controls mb-5 flex flex-wrap items-center gap-x-6 gap-y-2"><span class="text-sm text-muted" id="viewer-label">View as</span><div class="segmented" role="group" aria-labelledby="viewer-label">' +
    chips +
    '</div><button type="button" class="btn-link trace-print ml-auto text-sm" data-print>Print</button></div>' +
    '<div data-chain aria-live="polite">' +
    chainHtml() +
    "</div>" +
    '<p class="' + FINE + ' max-w-[72ch]">Each record names the one before it, from the lot back to the goat. ' +
    'Bramble is a sample goat, and the weights and dates are made up. The record format is a draft. <a href="' +
    REPO +
    '/blob/main/docs/schemas/README.md"' +
    EXT +
    ">Schema notes</a></p>" +
    '<section class="' + SECTION + '" aria-labelledby="lots-title">' +
    '<h2 id="lots-title" class="' + SECTION_TITLE + '">Sample fiber lots</h2>' +
    '<div class="' + BODY + ' max-w-[48rem]"><p class="mb-4 text-sm text-muted">Nothing here is for sale.</p>' +
    lotsTable(products) +
    "</div></section></main>" +
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
      // Keep the address in step, so the link can be shared as is.
      history.replaceState(null, "", "#" + location.hash.replace(/^#/, "").split("?")[0] + (viewer === "rancher" ? "" : "?view=" + viewer));
    });
  });
  root.querySelector("[data-print]")?.addEventListener("click", () => window.print());
  root.querySelector("[data-chain]")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-link-once]")) return;
    linkedAt = new Date().toISOString();
    linkedByHand = true;
    const holder = root.querySelector("[data-chain]");
    holder.innerHTML = chainHtml();
    holder.querySelector("[data-trace-why]")?.setAttribute("tabindex", "-1");
    holder.querySelector("[data-trace-why]")?.focus();
  });
}
