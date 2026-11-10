// The house look, checked in code: the BitPrairie tokens in the Tailwind
// theme, and the template tells that must not come back.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const srcDir = new URL("../src", import.meta.url);
const jsFiles = readdirSync(srcDir).filter((f) => f.endsWith(".js"));
const cssFiles = readdirSync(srcDir).filter((f) => f.endsWith(".css"));
const js = Object.fromEntries(jsFiles.map((f) => [f, read("src/" + f)]));
const css = cssFiles.map((f) => read("src/" + f)).join("\n");
const entry = read("src/style.css");
const allJs = Object.values(js).join("\n");

function block(text, start) {
  const i = text.indexOf(start);
  assert.ok(i >= 0, start + " exists");
  return text.slice(i, text.indexOf("\n}", i));
}
const theme = block(entry, "@theme {");
const dark = block(entry, '[data-theme="dark"] {');
const hex = (b) => Object.fromEntries([...b.matchAll(/--(color-[a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));

// Class attributes in the page templates, joined into one string.
const classes = [...allJs.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join(" ") + " " +
  [...allJs.matchAll(/export const [A-Z_]+ =\s*"([^"]*)"/g)].map((m) => m[1]).join(" ") +
  [...allJs.matchAll(/const [A-Z_]+ = "([^"]*)"/g)].map((m) => m[1]).join(" ");

// ---- tokens -----------------------------------------------------------------

test("brand: Tailwind v4 through the Vite plugin, with the theme in src/style.css", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.devDependencies.tailwindcss, /^\^4\./);
  assert.match(pkg.devDependencies["@tailwindcss/vite"], /^\^4\./);
  assert.match(read("vite.config.js"), /tailwindcss\(\)/);
  assert.match(entry, /^@import "tailwindcss";/m);
  assert.match(entry, /@custom-variant dark \(&:where\(\[data-theme="dark"\]/);
});

test("brand: paper, ink and leather, and nothing from the default palette", () => {
  const light = hex(theme);
  assert.equal(light["color-paper"], "#f2ede4");
  assert.equal(light["color-ink"], "#141416");
  assert.equal(light["color-leather"], "#6b4a2e");
  assert.equal(light["color-surface"], "#fffcf6");
  assert.equal(light["color-pasture"], "#5c6b4a");
  assert.match(theme, /--color-\*: initial;/, "the default palette is cleared");
});

test("brand: the dark theme is an option with a value for every colour", () => {
  const light = hex(theme);
  const night = hex(dark);
  assert.equal(night["color-paper"], "#161310");
  assert.equal(night["color-ink"], "#f7f1e8");
  assert.equal(night["color-leather"], "#c49a6c");
  const fixed = ["color-white", "color-black", "color-code", "color-code-ink"];
  for (const name of Object.keys(light)) if (!fixed.includes(name)) assert.ok(night[name], name + " has a dark value");
  const html = read("index.html");
  assert.match(html, /=== "dark" \? "dark" : "light"/, "light unless the visitor chose dark");
  assert.match(html, /<meta name="theme-color" content="#f2ede4"/);
});

test("brand: IBM Plex Sans at 400, 500 and 600 only", () => {
  assert.match(theme, /--font-sans: "IBM Plex Sans"/);
  assert.match(theme, /--font-weight-\*: initial;/);
  const weights = [...theme.matchAll(/--font-weight-([a-z]+): (\d+);/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(weights, [["normal", "400"], ["medium", "500"], ["semibold", "600"]]);
  for (const w of ["400", "500", "600"]) assert.match(js["main.js"], new RegExp("ibm-plex-sans/latin-" + w + "\\.css"));
  assert.ok(!/latin-(100|200|300|700)/.test(js["main.js"]));
  assert.ok(!/font-weight:\s*(700|800|900|bold)\b/.test(css), "no weight over 600 in CSS");
  assert.ok(!/\bfont-(bold|extrabold|black)\b/.test(classes + css), "no bold utilities");
  assert.match(css, /strong,\s*\n\s*th \{\s*\n\s*@apply font-semibold;/, "bold text is the 600 face");
});

test("brand: one type scale and one page width", () => {
  assert.match(theme, /--text-\*: initial;/);
  const sizes = [...theme.matchAll(/--text-([a-z0-9]+): /g)].map((m) => m[1]);
  assert.deepEqual(sizes, ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "display"]);
  assert.match(theme, /--container-page: 82rem;/);
  assert.match(theme, /--container-measure: 62ch;/);
  assert.match(theme, /--tracking-tight: -0\.012em;/);
  assert.ok(!/\btext-\[\d/.test(classes), "no one-off font sizes in the templates");
  assert.ok(!/\bmax-w-(xs|sm|md|lg|xl|[2-7]xl)\b/.test(classes), "widths come from the theme");
});

// ---- template tells ---------------------------------------------------------

test("anti-slop: no gradients, blur or glow", () => {
  assert.ok(!/gradient\(/.test(css), "no gradient in CSS");
  assert.ok(!/\bbg-(gradient|linear|radial|conic)-/.test(classes), "no gradient utilities");
  assert.ok(!/backdrop-filter|backdrop-blur|(^|\s)blur-|filter: blur/.test(css + classes), "no frosted glass");
  assert.match(theme, /--blur-\*: initial;/);
});

test("anti-slop: shadows only where something floats over the page", () => {
  assert.match(theme, /--shadow-\*: initial;/);
  assert.ok(!/\bshadow-(xs|sm|md|lg|xl|2xl)\b/.test(classes), "no shadow utilities");
  const allowed = /goat|tour-spot|tour-card|detail|rancher-pin|layer-panel/;
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*box-shadow:\s*(?!none)[^;]+;/g)) {
    const sel = m[1].trim().split("\n").pop();
    assert.ok(allowed.test(m[0]), "box-shadow on " + sel);
  }
});

test("anti-slop: small radii, round only for avatars, pins and switches", () => {
  assert.match(theme, /--radius-\*: initial;/);
  assert.ok(!/\brounded-(lg|xl|2xl|3xl|4xl)\b/.test(classes + css), "no big rounded corners");
  assert.ok(!/border-radius:\s*(1[0-9]|[2-9][0-9])px/.test(css), "no radius over 9px in CSS");
  assert.ok(!/rounded-full/.test(classes), "no pill shapes in the templates");
});

test("anti-slop: no caps labels, no pill badges, no emoji icons", () => {
  assert.ok(!/text-transform:\s*uppercase/.test(css) && !/\buppercase\b/.test(classes), "no all-caps labels");
  assert.ok(!/\b(badge|pill)\b/.test(classes), "no badge or pill classes");
  assert.ok(!/\p{Extended_Pictographic}/u.test(allJs.replace(/[©®™]/g, "")), "no emoji in the templates");
  assert.match(css, /\.tag \{\s*\n\s*@apply mr-1 font-medium text-leather/, "Planned is flat leather text");
});

test("anti-slop: no grids of equal cards, and one filled button per screen", async () => {
  assert.ok(!/\bgrid-cols-(3|4)\b/.test(classes) && !/grid-template-columns:\s*repeat\((3|4),/.test(css), "no three or four equal columns");
  assert.ok(!/(^|\s)(card|cards|card-grid|feature-grid)(\s|$)/.test(classes), "no card classes");
  assert.ok(!/btn-primary[^>]*data-answer/.test(js["map.js"]), "alert answers are outlined buttons");
  const { renderHome } = await import("../src/home.js");
  const { renderSetups } = await import("../src/setups.js");
  const { renderArchitecture } = await import("../src/architecture.js");
  assert.equal((renderHome().match(/btn-primary/g) || []).length, 1, "home has one main action");
  for (const html of [renderSetups(), renderArchitecture()]) assert.ok((html.match(/btn-primary/g) || []).length <= 1);
});

test("anti-slop: each rancher sign-in state has at most one filled button", async () => {
  const { renderRancher } = await import("../src/rancher.js");
  const realFetch = globalThis.fetch;
  globalThis.location = { hash: "#/rancher" };
  const sessions = [
    { mode: "local", signedIn: true },
    { mode: "local", passphraseSet: true, signedIn: false },
    { mode: "local", passphraseSet: false, signedIn: false },
    { mode: "access", signedIn: false, loginUrl: "/api/rancher/login" },
    { mode: "none", signedIn: false },
    null,
  ];
  try {
    for (const session of sessions) {
      globalThis.fetch = async () => {
        if (!session) throw new Error("offline");
        return new Response(JSON.stringify(session), { headers: { "content-type": "application/json" } });
      };
      const html = await renderRancher();
      assert.ok((html.match(/btn-primary/g) || []).length <= 1, JSON.stringify(session));
      assert.ok(!/style="/.test(html.replace(/<svg[\s\S]*?<\/svg>/, "")), "no inline styles outside the drawing");
    }
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.location;
  }
});

test("anti-slop: data reads like a ledger, with tabular numbers and rules", () => {
  assert.match(css, /\.data-table \{\s*\n\s*@apply w-full border-collapse text-sm tabular-nums;/);
  assert.match(css, /\.data-table thead :is\(th, td\) \{\s*\n\s*@apply border-b-ink/);
  assert.match(css, /\.data-table \.num \{\s*\n\s*@apply text-right;/);
  assert.match(js["trace.js"], /divide-y divide-rule border-y border-ink/, "the trace is ruled rows, not cards");
  assert.match(js["ui.js"], /border-t border-ink pt-5/, "sections open on an ink rule");
  assert.match(js["ui.js"], /lg:grid-cols-\[14rem_minmax\(0,1fr\)\]/, "titles sit in a left column");
});

test("anti-slop: no hand-written stylesheet left behind", () => {
  assert.deepEqual(cssFiles.sort(), ["style.css"], "every rule lives in the Tailwind entry");
});

test("layout: hidden helpers use the Tailwind sr-only class", () => {
  const html = read("index.html");
  assert.match(html, /id="route-announcer" class="sr-only"/);
  assert.ok(!/visually-hidden/.test(html + allJs + css), "no class that no longer exists");
});

test("layout: every page that uses a shared layout class imports it", () => {
  const names = [...js["ui.js"].matchAll(/export const ([A-Z_]+) =/g)].map((m) => m[1]);
  for (const [file, text] of Object.entries(js)) {
    if (file === "ui.js") continue;
    const imported = (text.match(/import \{([^}]*)\} from "\.\/ui\.js";/) || ["", ""])[1].split(",").map((s) => s.trim());
    for (const name of names) {
      if (new RegExp("[+(]\\s*" + name + "\\s*[+)]").test(text)) assert.ok(imported.includes(name), file + " imports " + name);
    }
  }
});
