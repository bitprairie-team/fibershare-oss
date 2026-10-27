import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../functions/api/health.js";

test("GET /api/health returns 200 and ok true", async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});
