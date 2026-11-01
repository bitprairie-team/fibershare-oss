import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { TOUR_STEPS, TOUR_KEYS } from "../src/tour-steps.js";
import { keyMoments, sortEvents, stateAt } from "../src/herd-state.js";
import { ICON_NAMES, icon } from "../src/icons.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const events = JSON.parse(read("public/data/events.json")).events;
const herd = JSON.parse(read("public/data/herd.json"));
const srcFiles = readdirSync(new URL("../src", import.meta.url)).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(srcFiles.map((f) => [f, read("src/" + f)]));
const css = read("src/style.css");
const ROUTES = ["/", "/map", "/trace", "/setups", "/shop", "/rancher", "/architecture"];

// Words and phrases the copy must not use.
const BANNED = [
  /is designed to/i,
  /intended to/i,
  /helps? you/i,
  /seamless/i,
  /empower/i,
  /robust/i,
  /\bproducers?\b/i,
  /\bAI\b/,
  /leverag/i,
  /unlock/i,
  /at a glance/i,
  /peace of mind/i,
  /real[- ]?time insights?/i,
  /cutting[- ]edge/i,
  /game[- ]chang/i,
  /revolution/i,
  /next[- ]gen/i,
  /world[- ]class/i,
  /state[- ]of[- ]the[- ]art/i,
  /effortless/i,
  /\bdelve/i,
  /look no further/i,
  /supercharge/i,
  /streamline/i,
  /harness/i,
  /elevate/i,
  /\bjourney\b/i,
  /single pane/i,
  /\u2014/, // em dash
  /\u2013/, // en dash
  /Simulated day|In the demo|Partly built|Checkout planned/,
];

// Real BitPrairie product names. They are allowed, spelled this way only.
const PRODUCTS = ["Predator Watch", "Wildfire Watch"];

// Place names: the copy says "the western US" and nothing more specific.
const PLACES = /\b(Alaska|Arizona|California|Colorado|Idaho|Montana|Nevada|New Mexico|Oregon|Texas|Utah|Wyoming|Washington State|Dakota|Nebraska|Kansas|Oklahoma)\b/;

// Emoji and pictographs.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function copyProblems(text) {
  const found = BANNED.filter((re) => re.test(text)).map(String);
  if (PLACES.test(text)) found.push("place name " + text.match(PLACES)[0]);
  if (EMOJI.test(text)) found.push("emoji");
  return found;
}

// Visible text of a rendered page: tags and entities out, spaces folded.
function textOf(html) {
  return html
    .replace(/<(script|style|pre)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headings(html) {
  return [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => textOf(m[2]));
}

test("tour: every step opens a known route and points at a target on that page", () => {
  const pageOf = { "/": "home.js", "/map": "map.js", "/trace": "trace.js", "/setups": "setups.js", "/rancher": "rancher.js" };
  assert.ok(TOUR_STEPS.length >= 4 && TOUR_STEPS.length <= 6, "the tour has about 5 steps");
  for (const step of TOUR_STEPS) {
    assert.ok(ROUTES.includes(step.route), step.id + " route");
    assert.match(step.target, /^[a-z-]+$/);
    const file = pageOf[step.route];
    assert.ok(file, step.id + " has a page file");
    assert.ok(src[file].includes('data-tour="' + step.target + '"'), step.id + " target is in " + file);
    assert.ok(step.title && step.body, step.id + " has copy");
    assert.ok(step.body.length < 180, step.id + " body is short");
    assert.ok(step.title.split(" ").length <= 3 && !/[.!:]$/.test(step.title), step.id + " title is a short label");
    assert.ok(!step.body.includes("!"), step.id + " has no exclamation point");
  }
});

test("tour: ids are unique and the order is herd, alert, fleece trace, rancher map", () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const at = (id) => ids.indexOf(id);
  assert.ok(at("herd") < at("predator") && at("predator") < at("trace") && at("trace") < at("rancher-map"));
  assert.ok(at("predator") < at("alerts") && at("alerts") < at("trace"), "the alerts step follows the predator alert");
  assert.deepEqual(TOUR_KEYS, { seen: "fs-tour-seen", step: "fs-tour-step" });
});

test("tour: only the alert steps are marked simulated, and they say so", () => {
  const simulated = TOUR_STEPS.filter((s) => s.simulated).map((s) => s.id);
  assert.deepEqual(simulated, ["predator"]);
  for (const step of TOUR_STEPS.filter((s) => s.simulated)) assert.match(step.body, /simulated/i);
  for (const step of TOUR_STEPS) assert.ok(!step.herd || !step.herd.moment || ["smoke", "predator", "end"].includes(step.herd.moment));
});

test("tour: copy has no banned words", () => {
  for (const step of TOUR_STEPS) assert.deepEqual(copyProblems(step.title + " " + step.body), [], step.id);
});

test("keyMoments: sample day gives smoke and predator steps while the alert is open", () => {
  const sorted = sortEvents(events);
  const moments = keyMoments(sorted);
  assert.deepEqual(moments.map((m) => m.id), ["smoke", "predator"]);
  const smoke = moments.find((m) => m.id === "smoke");
  const predator = moments.find((m) => m.id === "predator");
  assert.equal(smoke.step, 12);
  assert.equal(predator.step, 18);
  assert.match(smoke.time, /T12:30/);
  assert.match(predator.time, /T16:40/);
  // At each step the matching alert is still open.
  assert.ok(stateAt(herd.goats, sorted, smoke.step).smoke);
  assert.deepEqual(stateAt(herd.goats, sorted, predator.step).alertCells, ["A1"]);
  assert.deepEqual(keyMoments([]), []);
});

test("copy: page source and sample data use no banned words", () => {
  for (const [file, text] of Object.entries(src)) assert.deepEqual(copyProblems(text), [], "src/" + file);
  for (const file of ["public/data/herd.json", "public/data/events.json", "public/data/shop.json", "index.html", "README.md"]) {
    assert.deepEqual(copyProblems(read(file)), [], file);
  }
});

test("copy: one demo line site-wide, at most one Planned tag per page, and the support line wherever support comes up", () => {
  const all = Object.values(src).join("\n");
  assert.equal(all.split("This is a demo, not the FiberShare app").length - 1, 1, "one demo line, in the header");
  assert.match(src["layout.js"], /This is a demo, not the FiberShare app/);
  for (const [file, text] of Object.entries(src)) assert.ok(text.split('class="tag">Planned<').length - 1 <= 1, "at most one Planned tag per page: " + file);
  assert.ok(!/class="badge/.test(all), "no badge pills");
  for (const [file, text] of Object.entries(src)) {
    if (/ranch support|support pays/i.test(text)) assert.match(text, /Support is not ownership or an investment return/, file);
  }
  assert.match(read("README.md"), /Support is not ownership or an investment return/);
  // "intelligence and realtime systems" at most once in the demo copy.
  assert.ok(all.split(/intelligence and realtime systems/).length - 1 <= 1);
  assert.ok(!/intelligence systems/.test(all.replace(/intelligence and realtime systems/g, "")));
});

test("copy: pages render plain headings, one primary button on home, and a bare footer", async () => {
  const { renderHome } = await import("../src/home.js");
  const { renderSetups } = await import("../src/setups.js");
  const { renderArchitecture } = await import("../src/architecture.js");
  const { footer } = await import("../src/layout.js");
  const pages = { home: renderHome(), setups: renderSetups(), architecture: renderArchitecture() };
  for (const [name, html] of Object.entries(pages)) {
    const text = textOf(html);
    assert.deepEqual(copyProblems(text), [], name);
    assert.ok(!text.includes("!"), name + " has no exclamation point");
    assert.ok(!/\b[A-Z][a-z]+: [A-Z]/.test(text), name + " has no colon-label lines");
    for (const h of headings(html)) {
      assert.ok(!/[.!?:]$/.test(h), name + " heading is a label, not a sentence: " + h);
      assert.ok(h.split(" ").length <= 6, name + " heading is short: " + h);
    }
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, name + " has one h1");
  }
  assert.equal((pages.home.match(/btn-primary/g) || []).length, 1, "home has one primary button");
  assert.match(
    textOf(pages.home),
    /Each of those jobs can be turned off\. When a job is off, its alerts stop, and you can still add alerts, notes and checks by hand\./
  );
  assert.equal(textOf(footer()), "BitPrairie LLC");
});

test("icons: every icon used in src exists and has no title unless labelled", () => {
  const used = new Set();
  for (const text of Object.values(src)) for (const m of text.matchAll(/icon\("([a-zA-Z]+)"/g)) used.add(m[1]);
  for (const name of used) assert.ok(ICON_NAMES.includes(name), "icon " + name);
  assert.match(icon("map"), /aria-hidden="true"/);
  assert.match(icon("map", { label: "Map" }), /role="img"/);
  assert.match(icon("map", { label: "Map" }), /aria-label="Map"/);
});

// WCAG 2 contrast from the theme tokens.
function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2];
  return out;
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const light = tokens(css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf("--bg:"))));
const darkStart = css.indexOf('[data-theme="dark"]');
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf("}", darkStart))) };

const TEXT_PAIRS = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink-2", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["link", "bg"],
  ["link", "surface"],
  ["on-brand", "brand"],
  ["accent-ink", "surface"],
  ["ok", "ok-soft"],
  ["warn", "warn-soft"],
  ["alert", "alert-soft"],
  ["info", "info-soft"],
];

for (const [name, theme] of [["light", light], ["dark", dark]]) {
  test("contrast: text pairs meet AA in the " + name + " theme", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      assert.ok(theme[fg] && theme[bg], name + " has --" + fg + " and --" + bg);
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 4.5, name + " --" + fg + " on --" + bg + " is " + r.toFixed(2));
    }
    assert.ok(ratio(theme["focus-ring"], theme.bg) >= 3, name + " focus ring");
  });
}

test("layout: breakpoints for the menu, the bottom sheet, the phone, and reduced motion", () => {
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.nav-toggle/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.detail/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /overflow-x:\s*(hidden|clip)/);
  // The map libraries load only for the rancher map.
  assert.ok(!/from "leaflet"/.test(src["main.js"] + src["map.js"]));
  assert.match(src["map.js"] + src["main.js"], /import\("\.\/rancher-map\.js"\)/);
});

test("spreadPins: pins drawn at least the gap apart, inside the paddock, data unchanged", async () => {
  const { spreadPins } = await import("../src/pin-spread.js");
  const points = [
    { id: "a", x: 66, y: 52 },
    { id: "b", x: 70, y: 56 },
    { id: "c", x: 70, y: 56 },
    { id: "d", x: 1, y: 99 },
  ];
  const out = spreadPins(points, 340, 340, 34);
  assert.equal(points[0].x, 66);
  for (const p of out) assert.ok(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100);
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const d = Math.hypot(((out[i].x - out[j].x) / 100) * 340, ((out[i].y - out[j].y) / 100) * 340);
      assert.ok(d >= 33, out[i].id + "-" + out[j].id + " " + d.toFixed(1));
    }
  assert.deepEqual(spreadPins(points.slice(0, 1), 340, 340), [{ id: "a", x: 66, y: 52 }]);
  assert.deepEqual(spreadPins(points, 0, 0).map((p) => p.x), [66, 70, 70, 1]);
});

test("copy: Predator Watch and Wildfire Watch are allowed and named where their alerts show", async () => {
  const { eventAlerts } = await import("../src/alerts.js");
  for (const name of PRODUCTS) assert.deepEqual(copyProblems(name + " reported activity"), [], name);
  const titles = eventAlerts([
    { id: "p", type: "predator", cell: "A1", time: "2026-09-06T16:40:00", text: "x" },
    { id: "s", type: "smoke", time: "2026-09-06T12:30:00", text: "y" },
  ]).map((a) => a.title);
  assert.deepEqual(titles, ["Predator Watch reported activity near A1", "Wildfire Watch reported smoke upwind"]);
  for (const t of titles) assert.ok(!/^[A-Z][\w ]+: /.test(t), "no colon label: " + t);
  assert.match(src["map.js"], /Predator Watch/);
  assert.match(src["map.js"], /Wildfire Watch/);
  // Misspellings or nicknames of the products are not.
  assert.ok(!/PredatorWatch|WildfireWatch|Predator watch|Wildfire watch/.test(Object.values(src).join("\n")));
});

test("herd view: at most 3 stats, and they are the ones a rancher scans", async () => {
  const { herdStats } = await import("../src/herd-state.js");
  const animals = herd.goats.map((g) => ({ lastSeen: g.lastSeen }));
  const stats = herdStats({ animals, openAlerts: 4, nowMs: new Date("2026-09-06T18:05:00").getTime() });
  assert.ok(stats.length <= 3, "at most 3 stats");
  assert.deepEqual(stats.map((s) => s.id), ["reporting", "open", "last"]);
  assert.equal(stats[0].value, "7 of 8");
  assert.equal(stats[1].value, "4");
  assert.match(stats[2].value, /T17:55/);
  assert.deepEqual(herdStats().map((s) => s.value), ["0 of 0", "0", ""]);
  // The page draws only what herdStats returns, with no icons.
  assert.match(src["map.js"], /herdStats\(/);
  assert.ok(!/stat-icon|feed-icon|alert-icon/.test(src["map.js"]), "no stat, event or alert icons");
  assert.ok(!/data-moment|data-filter|data-herd-reset/.test(src["map.js"]), "one playback control, no jump-to chips or filters");
  assert.match(src["map.js"], /<details class="disclosure feed-section"[^>]*><summary>Show all events/);
});

test("on-screen copy does not name a network server, outside <code> command spans", () => {
  const NAMES = /ChirpStack|Things Network|\bTTN\b/i;
  const files = { ...src, "index.html": read("index.html") };
  for (const [name, text] of Object.entries(files)) {
    const copy = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<code>[\s\S]*?<\/code>/g, "");
    // String literals only: code identifiers such as LIVE_SOURCE may stay.
    const strings = copy.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [];
    const shown = name.endsWith(".html") ? [copy.replace(/<script[\s\S]*?<\/script>/g, "")] : strings;
    for (const s of shown) {
      if (name === "live-format.js" && s === '"chirpstack"') continue; // LIVE_SOURCE value
      assert.ok(!NAMES.test(s), name + ": " + s.slice(0, 120));
    }
  }
  // The rancher still sees the command where it is needed.
  assert.match(src["map.js"], /no live file yet\. Run <code>npm run chirpstack:pull<\/code>/);
  assert.match(src["map.js"], /Live from your network server/);
});

test("unbuilt features on screen are marked Planned", () => {
  // Sharing with agencies or researchers is not built yet.
  const line = src["setups.js"].split("\n").find((l) => /agencies or researchers/.test(l)) || "";
  assert.match(line, /<span class="tag">Planned<\/span>/);
  assert.match(src["architecture.js"], /<span class="tag">Planned<\/span>/);
});

test("the header line stays true when live trackers are shown", () => {
  assert.ok(!/demo-bar[^<]*sample data/.test(src["layout.js"]), "the demo line does not claim sample data");
});

test("brand: BitPrairie paper, ink and leather, Plex Sans 400 to 600, light by default", () => {
  const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf('[data-theme="dark"]'));
  for (const [token, hex] of [["--bg", "#f2ede4"], ["--ink", "#141416"], ["--accent", "#6b4a2e"], ["--brand", "#6b4a2e"]]) {
    assert.match(rootBlock, new RegExp(token + ": " + hex + ";"), token);
  }
  assert.ok(!/font-weight:\s*(700|800|900|bold)/.test(css), "no weight above 600");
  assert.ok(!/latin-700/.test(src["main.js"]), "the 700 face is not loaded");
  for (const w of ["400", "500", "600"]) assert.match(src["main.js"], new RegExp("latin-" + w + "\\.css"));
  const html = read("index.html");
  assert.ok(!/prefers-color-scheme: dark\)"\)\.matches/.test(html), "the system dark setting does not switch the theme");
  assert.match(html, /=== "dark" \? "dark" : "light"/);
});

test("layout: no template tells (caps labels, pill tags, boxed card grids, many filled buttons)", async () => {
  const rule = (sel) => (css.match(new RegExp("\\n" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}")) || [])[1] || "";
  assert.ok(!/text-transform:\s*uppercase/.test(css), "no all-caps labels");
  assert.ok(!/border|radius/.test(rule(".tag")), "Planned is flat text, not a pill");
  for (const sel of [".trace-card", ".alert-item", ".rancher-callout", ".herd-main"]) {
    const body = rule(sel);
    assert.ok(body, sel + " rule exists");
    assert.ok(!/box-shadow|border-radius|background:/.test(body), sel + " is a ruled block, not a boxed card");
  }
  assert.ok(!/repeat\(3, minmax\(0, 1fr\)\)/.test(rule(".setup-list")), "home setups are rows, not three equal cards");
  // One filled button at most on any page.
  assert.ok(!/btn-primary[^>]*data-answer/.test(src["map.js"]), "herd view answers are outlined buttons");
  assert.ok((src["map.js"].match(/btn-primary/g) || []).length <= 1, "only the load-error retry is filled");
  const { renderHome } = await import("../src/home.js");
  const { renderSetups } = await import("../src/setups.js");
  const { renderArchitecture } = await import("../src/architecture.js");
  for (const html of [renderHome(), renderSetups(), renderArchitecture()]) assert.ok((html.match(/btn-primary/g) || []).length <= 1);
});

test("fleece trace: a shareable viewer link and a clean print sheet", () => {
  assert.match(src["trace.js"], /\?view=/, "the viewer is kept in the address");
  assert.match(src["trace.js"], /window\.print\(\)/);
  const print = css.slice(css.indexOf("@media print"));
  assert.ok(print.length > 20, "print styles exist");
  for (const sel of [".site-header", ".site-footer", ".trace-print"]) assert.ok(print.includes(sel), "print hides " + sel);
});

test("herd view keyboard and screen reader flow", () => {
  const map = src["map.js"];
  assert.match(map, /pin\.tabIndex = pin === current \? 0 : -1/, "the grid is one tab stop");
  assert.match(map, /aria-valuetext/, "the time slider reads as a time");
  assert.match(map, /data-answer="confirmed" aria-describedby=/, "Confirm names its alert");
});
