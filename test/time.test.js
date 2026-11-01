import assert from "node:assert/strict";
import test from "node:test";
import { ago, dateTime, dayTime, timeOf } from "../src/time.js";

test("times read the same everywhere: 24-hour clock, short dates, plain ages", () => {
  assert.equal(timeOf("2026-09-06T16:40:00"), "16:40");
  assert.equal(timeOf("2026-09-06T05:05:00"), "05:05");
  assert.equal(timeOf("nope"), "");
  assert.equal(dateTime("2026-09-06T16:40:00"), "Sep 6, 16:40");
  const now = new Date("2026-09-06T18:05:00").getTime();
  assert.equal(dayTime("2026-09-06T17:55:00", now), "17:55", "same day: time only");
  assert.equal(dayTime("2026-07-12T10:00:00", now), "Jul 12, 10:00", "another day: date too");
  assert.equal(ago("2026-09-06T17:55:00", "2026-09-06T18:05:00"), "10 min ago");
  assert.equal(ago("2026-09-06T15:05:00", "2026-09-06T18:05:00"), "3 hours ago");
  assert.equal(ago("2026-09-01T18:05:00", "2026-09-06T18:05:00"), "5 days ago");
  assert.equal(ago("", "2026-09-06T18:05:00"), "not yet");
  assert.equal(ago(null, "x", "not yet today"), "not yet today");
  for (const s of [timeOf("2026-09-06T16:40:00"), dateTime("2026-09-06T16:40:00")]) assert.ok(!/AM|PM/.test(s), "no 12-hour clock");
});
