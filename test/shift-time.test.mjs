import assert from "node:assert/strict";
import test from "node:test";
import {
  inferEndDayOffset,
  normalizeEndDayOffset,
  shiftDurationMinutes
} from "../public/shift-time.js";

test("infers cross-midnight shifts and preserves explicit day offsets", () => {
  assert.equal(inferEndDayOffset("20:00", "08:00"), 1);
  assert.equal(inferEndDayOffset("09:00", "09:00"), 1);
  assert.equal(inferEndDayOffset("08:00", "20:00"), 0);
  assert.equal(normalizeEndDayOffset(undefined, "20:00", "08:00"), 1);
  assert.equal(normalizeEndDayOffset(0, "09:00", "09:00"), 0);
  assert.equal(normalizeEndDayOffset(2, "09:00", "09:00"), 2);
});

test("calculates 24-hour and multi-day shift durations", () => {
  assert.equal(
    shiftDurationMinutes({ start: "09:00", end: "09:00", endDayOffset: 1 }),
    24 * 60
  );
  assert.equal(
    shiftDurationMinutes({ start: "09:00", end: "09:00", endDayOffset: 2 }),
    48 * 60
  );
  assert.equal(
    shiftDurationMinutes({ start: "09:00", end: "09:00", endDayOffset: 0 }),
    0
  );
});
