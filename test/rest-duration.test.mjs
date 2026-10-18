import assert from "node:assert/strict";
import test from "node:test";
import { minutesRemainingInDay } from "../public/rest-duration.js";

test("calculates the rest remaining in the current day", () => {
  assert.equal(minutesRemainingInDay("08:00"), 16 * 60);
  assert.equal(minutesRemainingInDay("06:30"), 17 * 60 + 30);
  assert.equal(minutesRemainingInDay("00:00"), 24 * 60);
  assert.equal(minutesRemainingInDay("23:59"), 1);
});

test("rejects invalid clock values", () => {
  assert.equal(minutesRemainingInDay("24:00"), null);
  assert.equal(minutesRemainingInDay("8:00"), null);
  assert.equal(minutesRemainingInDay(""), null);
});
