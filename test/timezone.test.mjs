import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMON_TIMEZONES,
  compactTimeZones,
  DEFAULT_TIMEZONE,
  detectTimeZone,
  formatTimeZoneOffset,
  isValidTimeZone,
  normalizeTimeZone
} from "../public/timezone.js";

test("normalizes supported IANA time zones and falls back safely", () => {
  assert.equal(normalizeTimeZone("America/New_York"), "America/New_York");
  assert.equal(normalizeTimeZone("not/a-zone"), DEFAULT_TIMEZONE);
  assert.equal(normalizeTimeZone("", "UTC"), "UTC");
  assert.equal(isValidTimeZone("Europe/London"), true);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
});

test("detects a valid device time zone", () => {
  assert.equal(isValidTimeZone(detectTimeZone()), true);
});

test("builds a short time zone list with preferred options first", () => {
  const zones = compactTimeZones([
    "America/Los_Angeles",
    "Asia/Shanghai",
    "not/a-zone"
  ]);
  assert.equal(zones[0], "America/Los_Angeles");
  assert.equal(zones[1], "Asia/Shanghai");
  assert.equal(new Set(zones).size, zones.length);
  assert.equal(zones.length, COMMON_TIMEZONES.length);
  assert.ok(formatTimeZoneOffset("Asia/Shanghai").startsWith("GMT"));
});
