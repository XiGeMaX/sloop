import assert from "node:assert/strict";
import test from "node:test";

import { projectCycleIndex } from "../public/cycle-today.js";

test("projects the saved cycle index to today", () => {
  assert.equal(
    projectCycleIndex({
      savedAt: "2026-10-20T08:00:00.000Z",
      now: new Date("2026-10-21T08:00:00.000Z"),
      timeZone: "Asia/Shanghai",
      savedIndex: 4,
      cycleLength: 6
    }),
    5
  );
});

test("wraps the projected index around the cycle", () => {
  assert.equal(
    projectCycleIndex({
      savedAt: "2026-09-30T08:00:00.000Z",
      now: new Date("2026-10-22T08:00:00.000Z"),
      timeZone: "Asia/Shanghai",
      savedIndex: 50,
      cycleLength: 52
    }),
    20
  );
});

test("uses calendar dates in the plan timezone", () => {
  assert.equal(
    projectCycleIndex({
      savedAt: "2026-10-21T17:00:00.000Z",
      now: new Date("2026-10-22T16:30:00.000Z"),
      timeZone: "Asia/Shanghai",
      savedIndex: 2,
      cycleLength: 8
    }),
    3
  );
});

test("keeps the saved index when the saved timestamp is invalid", () => {
  assert.equal(
    projectCycleIndex({
      savedAt: "not-a-date",
      now: new Date("2026-10-22T08:00:00.000Z"),
      timeZone: "Asia/Shanghai",
      savedIndex: 7,
      cycleLength: 5
    }),
    2
  );
});
