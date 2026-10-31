import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { forbiddenKeys, keyParts, privateDataProblems } from "../scripts/private-data.js";

// Draft record schemas in docs/schemas/. The repo has no JSON Schema library,
// so a small check below covers only the keywords these schemas use.

const RECORDS = ["animal", "shearing", "fleece", "fiber-lot"];

// Field names that must never appear in a record. Matched by word part, so
// ownerName, owner_email, and Location all fail.
const RECORD_BANNED_PARTS = new Set([
  "location", "coordinates", "coords", "gps", "address", "geo",
  "price", "cost", "usd", "currency", "payment", "card", "invoice",
  "email", "phone", "owner", "person", "contact",
  "device", "serial", "eui", "mac", "imei",
]);

const KNOWN_KEYWORDS = new Set([
  "$schema", "$id", "title", "description", "type", "required", "additionalProperties",
  "properties", "items", "enum", "pattern", "minLength", "maxLength", "minimum", "maximum",
  "exclusiveMinimum", "minItems", "uniqueItems",
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function loadSchema(name) {
  return readJson(`../docs/schemas/${name}.schema.json`);
}

function loadExample(name) {
  return readJson(`../docs/schemas/examples/${name}.example.json`);
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

/** Check a value against the small part of JSON Schema these files use. */
function validate(schema, value, path = "$", errors = []) {
  if (schema.type) {
    const actual = typeOf(value);
    const ok = schema.type === actual || (schema.type === "number" && actual === "integer");
    if (!ok) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: not one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push(`${path}: must be above ${schema.exclusiveMinimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path}: items must be unique`);
    }
    if (schema.items) value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) validate(properties[key], child, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown field ${key}`);
    }
  }
  return errors;
}

/** List every keyword used anywhere in a schema, so unknown ones are caught. */
function keywords(schema, found = new Set()) {
  for (const [key, child] of Object.entries(schema)) {
    found.add(key);
    if (key === "properties") Object.values(child).forEach((sub) => keywords(sub, found));
    else if (key === "items") keywords(child, found);
  }
  return found;
}

/** Field names a record may hold: schema property names, example keys, and sharing field names. */
function recordFieldNames(value, names = []) {
  if (Array.isArray(value)) value.forEach((item) => recordFieldNames(item, names));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      names.push(key);
      recordFieldNames(child, names);
    }
  }
  return names;
}

function bannedNames(names) {
  return names.filter((name) => keyParts(name).some((part) => RECORD_BANNED_PARTS.has(part)));
}

test("record schemas are draft 2020-12 with a relative $id and plain descriptions", () => {
  for (const name of RECORDS) {
    const schema = loadSchema(name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.equal(schema.$id, `fibershare/${name}.schema.json`, name);
    assert.ok(!/^[a-z]+:\/\//i.test(schema.$id), `${name} $id must not be a real hostname`);
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false, `${name} must not allow extra fields`);
    assert.ok(Array.isArray(schema.required) && schema.required.includes("id") && schema.required.includes("sharing"));
    for (const key of schema.required) assert.ok(schema.properties[key], `${name} requires unknown field ${key}`);
    assert.ok(schema.description.trim().length > 0);
    for (const [key, property] of Object.entries(schema.properties)) {
      assert.ok(property.description?.trim(), `${name}.${key} needs a description`);
    }
    const unknown = [...keywords(schema)].filter((key) => !KNOWN_KEYWORDS.has(key));
    assert.deepEqual(unknown, [], `${name} uses keywords the test check does not cover`);
  }
});

test("each record has a sharing field the rancher controls", () => {
  for (const name of RECORDS) {
    const sharing = loadSchema(name).properties.sharing;
    assert.deepEqual(sharing.properties.audience.enum, ["private", "buyers", "public"], name);
    const shareable = sharing.properties.fields.items.enum;
    const fields = Object.keys(loadSchema(name).properties);
    for (const field of shareable) assert.ok(fields.includes(field), `${name} shares unknown field ${field}`);
    assert.ok(!shareable.includes("sharing") && !shareable.includes("id"), name);
  }
});

test("each example validates against its schema", () => {
  for (const name of RECORDS) {
    const errors = validate(loadSchema(name), loadExample(name));
    assert.deepEqual(errors, [], `${name} example:\n${errors.join("\n")}`);
  }
});

test("the schema check rejects bad records", () => {
  const animal = loadSchema("animal");
  const good = loadExample("animal");
  const { breed, ...noBreed } = good;
  assert.ok(breed);
  assert.ok(validate(animal, noBreed).some((error) => error.includes("missing breed")));
  assert.ok(validate(animal, { ...good, price: 1 }).some((error) => error.includes("unknown field price")));
  assert.ok(validate(animal, { ...good, species: "horse" }).length > 0);
  assert.ok(validate(animal, { ...good, birthYear: 2025.5 }).length > 0);
  assert.ok(validate(animal, { ...good, id: "Bramble Goat" }).length > 0);
  assert.ok(validate(animal, { ...good, sharing: { audience: "buyers", fields: ["tag", "tag"] } }).length > 0);
  assert.ok(validate(animal, { ...good, sharing: { audience: "everyone" } }).length > 0);

  const shearing = loadSchema("shearing");
  assert.ok(validate(shearing, { ...loadExample("shearing"), date: "2026-13-01" }).length > 0);
  assert.ok(validate(shearing, { ...loadExample("shearing"), date: "March 14" }).length > 0);

  const fleece = loadSchema("fleece");
  assert.ok(validate(fleece, { ...loadExample("fleece"), weightGrams: 0 }).length > 0);
  assert.ok(validate(fleece, { ...loadExample("fleece"), micron: "fine" }).length > 0);

  const lot = loadSchema("fiber-lot");
  assert.ok(validate(lot, { ...loadExample("fiber-lot"), fleeceIds: [] }).length > 0);
});

test("examples link animal to shearing to fleece to fiber lot, using the sample herd", () => {
  const animal = loadExample("animal");
  const shearing = loadExample("shearing");
  const fleece = loadExample("fleece");
  const lot = loadExample("fiber-lot");

  assert.equal(shearing.animalId, animal.id);
  assert.equal(fleece.shearingId, shearing.id);
  assert.ok(lot.fleeceIds.includes(fleece.id));

  const herd = readJson("../public/data/herd.json");
  const goat = herd.goats.find((item) => item.id === animal.id);
  assert.ok(goat, "example animal should be a sample goat from herd.json");
  assert.equal(animal.name, goat.name);
  assert.equal(animal.breed, goat.breed);
  assert.equal(animal.color, goat.color);
});

test("no schema or example has price, location, device, contact, or secret data", () => {
  const found = [];
  for (const name of RECORDS) {
    for (const [label, value] of [[`${name}.schema`, loadSchema(name)], [`${name}.example`, loadExample(name)]]) {
      forbiddenKeys(value, label, found);
      privateDataProblems(value, label, found);
      const names = recordFieldNames(label.endsWith(".schema") ? value.properties : value);
      if (label.endsWith(".schema")) names.push(...value.properties.sharing.properties.fields.items.enum);
      for (const banned of bannedNames(names)) found.push(`${label}: banned field name ${banned}`);
    }
  }
  assert.deepEqual(found, [], found.join("\n"));
});

test("banned record field names are caught in any case or form", () => {
  const rejected = ["location", "ownerName", "owner_email", "Phone", "deviceId", "collarSerial", "priceUsd", "GPS", "mac_address"];
  assert.deepEqual(bannedNames(rejected), rejected);
  const allowed = ["id", "animalId", "breed", "name", "tag", "birthYear", "weightGrams", "micron", "color", "fleeceIds", "sharing"];
  assert.deepEqual(bannedNames(allowed), []);
});
