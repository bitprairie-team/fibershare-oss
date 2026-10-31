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
  /seamless/i,
  /empower/i,
  /robust/i,
  /\bproducers?\b/i,
  /\bAI\b/,
  /leverag/i,
  /cutting[- ]edge/i,
  /game[- ]chang/i,
  /revolution/i,
  /next[- ]gen/i,
  /world[- ]class/i,
  /state[- ]of[- ]the[- ]art/i,
  /effortless/i,
  /peace of mind/i,
  /unlock/i,
  /\bdelve/i,
  /look no further/i,
];

function copyProblems(text) {
  return BANNED.filter((re) => re.test(text)).map(String);
}

test("tour: every step opens a known route and points at a target on that page", () => {
  const pageOf = { "/": "home.js", "/map": "map.js", "/trace": "trace.js", "/setups": "setups.js", "/rancher": "rancher.js" };
  assert.ok(TOUR_STEPS.length >= 6 && TOUR_STEPS.length <= 9);
  for (const step of TOUR_STEPS) {
    assert.ok(ROUTES.includes(step.route), step.id + " route");
    assert.match(step.target, /^[a-z-]+$/);
    const file = pageOf[step.route];
    assert.ok(file, step.id + " has a page file");
    assert.ok(src[file].includes('data-tour="' + step.target + '"'), step.id + " target is in " + file);
    assert.ok(step.title && step.body, step.id + " has copy");
    assert.ok(step.body.length < 260, step.id + " body is short");
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
  assert.deepEqual(simulated, ["smoke", "predator"]);
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

test("copy: the demo line and the support line are kept", () => {
  const all = Object.values(src).join("\n");
  assert.match(all, /This is a demo, not the FiberShare app/);
  assert.match(all, /Support is not ownership or an investment return/);
  assert.match(src["home.js"], /badge-planned/);
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
