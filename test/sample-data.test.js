import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FORBIDDEN_KEYS = new Set(["price", "usd", "currency"]);

function readJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

function requireText(object, key) {
  assert.equal(typeof object[key], "string", `${key} must be a string`);
  assert.ok(object[key].trim().length > 0, `${key} must not be empty`);
}

function forbiddenKeys(value, path, found) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) found.push(`${path}.${key}`);
      forbiddenKeys(child, `${path}.${key}`, found);
    }
  }
}

test("herd.json has the sample herd fields", () => {
  const data = readJson("../public/data/herd.json");
  requireText(data, "ranch");
  requireText(data, "note");
  requireText(data, "updated");
  assert.ok(Array.isArray(data.goats) && data.goats.length > 0, "goats must be a non-empty array");

  const ids = new Set();
  for (const goat of data.goats) {
    for (const key of ["id", "name", "breed", "color", "status", "fiber"]) {
      requireText(goat, key);
    }
    assert.equal(typeof goat.x, "number");
    assert.equal(typeof goat.y, "number");
    assert.ok(Number.isFinite(goat.x) && Number.isFinite(goat.y));
    assert.ok(!ids.has(goat.id), `duplicate goat id ${goat.id}`);
    ids.add(goat.id);
  }
});

test("shop.json has sample lots and no price fields", () => {
  const data = readJson("../public/data/shop.json");
  requireText(data, "note");
  assert.ok(
    Array.isArray(data.products) && data.products.length > 0,
    "products must be a non-empty array"
  );

  const ids = new Set();
  for (const product of data.products) {
    for (const key of ["id", "name", "fiber"]) requireText(product, key);
    assert.equal(typeof product.grams, "number");
    assert.ok(Number.isFinite(product.grams) && product.grams > 0);
    assert.equal(typeof product.inStock, "boolean");
    assert.ok(!ids.has(product.id), `duplicate product id ${product.id}`);
    ids.add(product.id);
  }

  const found = [];
  forbiddenKeys(data, "shop", found);
  assert.deepEqual(found, []);
});

test("price, usd, and currency keys are rejected", () => {
  const sample = {
    currency: "sample",
    products: [{ price: null, details: { usd: null } }],
  };
  const found = [];
  forbiddenKeys(sample, "sample", found);
  assert.deepEqual(found.sort(), ["sample.currency", "sample.products[0].details.usd", "sample.products[0].price"]);
});
