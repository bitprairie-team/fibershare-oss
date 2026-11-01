import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAGE_META, NOT_FOUND_META, metaForPath } from "../src/page-meta.js";
import { footer } from "../src/layout.js";
import { PRIVACY, TERMS } from "../src/sites.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const ROUTES = ["/", "/map", "/trace", "/setups", "/architecture", "/rancher", "/shop"];

test("footer: © 2026 BitPrairie LLC with live Terms and Privacy links", () => {
  const html = footer();
  assert.match(html, /© 2026 BitPrairie LLC/);
  assert.equal(TERMS, "https://bitprairie.com/terms");
  assert.equal(PRIVACY, "https://bitprairie.com/privacy");
  assert.match(html, new RegExp(`href="${TERMS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, new RegExp(`href="${PRIVACY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.ok(!/Not legal advice/i.test(html));
  assert.ok(!/\[[A-Z_]+\]/.test(html));
  assert.ok(!/, (Inc\.|Delaware|Wyoming|California)/.test(html));
});

test("seo: every route has a unique title (~50-60) and description (~140-160)", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const path of ROUTES) {
    const meta = metaForPath(path);
    assert.ok(meta, path);
    assert.equal(typeof meta.title, "string");
    assert.equal(typeof meta.description, "string");
    assert.ok(meta.title.length >= 50 && meta.title.length <= 60, `${path} title length ${meta.title.length}`);
    assert.ok(
      meta.description.length >= 140 && meta.description.length <= 160,
      `${path} description length ${meta.description.length}`,
    );
    assert.ok(!/\u2014|\u2013/.test(meta.title + meta.description), path + " has no em/en dash");
    assert.ok(!/\bAI\b/.test(meta.title + meta.description), path + " must not say AI bare");
    if (path !== "/shop") {
      assert.ok(!titles.has(meta.title), "duplicate title " + meta.title);
      assert.ok(!descriptions.has(meta.description), "duplicate description");
      titles.add(meta.title);
      descriptions.add(meta.description);
    } else {
      assert.equal(meta, PAGE_META["/trace"]);
    }
  }
  assert.ok(NOT_FOUND_META.title.length >= 50 && NOT_FOUND_META.title.length <= 60);
  assert.ok(NOT_FOUND_META.description.length >= 140 && NOT_FOUND_META.description.length <= 160);
  assert.ok(!titles.has(NOT_FOUND_META.title));
  assert.ok(!descriptions.has(NOT_FOUND_META.description));
});

test("seo: index.html defaults match the home route meta", () => {
  const html = read("index.html");
  const home = PAGE_META["/"];
  assert.match(html, new RegExp(`<title>${home.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
  assert.ok(html.includes(`content="${home.description}"`));
  assert.ok(html.includes(`property="og:title" content="${home.title}"`));
  assert.ok(html.includes(`name="twitter:title" content="${home.title}"`));
});

test("seo: main applies page meta on each render", () => {
  const main = read("src/main.js");
  assert.match(main, /applyPageMeta\(meta\)/);
  assert.match(main, /metaForPath\(path\)/);
  assert.match(main, /from "\.\/page-meta\.js"/);
});
