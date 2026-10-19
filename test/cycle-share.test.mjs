import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCycleSharePackage,
  decodeCycleShareInput,
  encodeCycleSharePackage,
  matchSharedPresets
} from "../public/cycle-share.js";

const plan = {
  t: "轮转班表",
  c: [
    ["w", "白班", "08:00", "20:00", "sky", "day", 0],
    ["w", "夜班", "20:00", "08:00", "indigo", "night", 1],
    ["w", "白班", "08:00", "20:00", "sky", "day", 0]
  ]
};

const presets = [
  {
    id: "day",
    kind: "work",
    name: "白班",
    start: "08:00",
    end: "20:00",
    endDayOffset: 0,
    tone: "sky",
    visibleOnHome: true
  },
  {
    id: "night",
    kind: "work",
    name: "夜班",
    start: "20:00",
    end: "08:00",
    endDayOffset: 1,
    tone: "indigo",
    visibleOnHome: false
  }
];

test("packs plans with only the shift presets they reference", () => {
  const share = buildCycleSharePackage(plan, [...presets, { id: "unused" }]);
  assert.equal(share.type, "sloop-cycle-share");
  assert.equal(share.presets.length, 2);
  assert.equal(share.presets[1].id, "night");
  assert.equal(share.presets[1].visibleOnHome, false);
});

test("round-trips compressed share links and rejects JSON payloads", async () => {
  const share = buildCycleSharePackage(plan, presets);
  const token = await encodeCycleSharePackage(share);
  const decoded = await decodeCycleShareInput(
    `https://sloop.example/#share=${token}`
  );
  assert.equal(decoded.plan.t, plan.t);
  assert.equal(decoded.presets[0].id, "day");
  await assert.rejects(decodeCycleShareInput(JSON.stringify(share)), /invalid_share_link/);
});

test("compresses share links and rejects legacy links", async () => {
  const share = buildCycleSharePackage(plan, presets);
  const legacyToken = Buffer.from(JSON.stringify(share)).toString("base64url");
  const token = await encodeCycleSharePackage(share);

  assert.match(token, /^z\./);
  assert.ok(token.length < legacyToken.length / 2);
  await assert.rejects(
    decodeCycleShareInput(`https://sloop.example/#share=${legacyToken}`),
    /invalid_share_link/
  );
});

test("matches equivalent presets and reports missing ones", () => {
  const localizedDay = { ...presets[0], name: "Day shift" };
  const { mapping, missing } = matchSharedPresets(presets, [localizedDay]);
  assert.equal(mapping.get("day"), "day");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].id, "night");
});

test("rejects malformed share input", async () => {
  await assert.rejects(decodeCycleShareInput("not-a-share"), /invalid_share_link/);
  await assert.rejects(decodeCycleShareInput(""), /invalid_share_link/);
});

test("rejects decompression bombs before materializing the payload", async () => {
  const compressed = await new Response(
    new Blob([new Uint8Array(200_000)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"))
  ).arrayBuffer();
  const token = `z.${Buffer.from(compressed).toString("base64url")}`;
  await assert.rejects(
    decodeCycleShareInput(`https://sloop.example/#share=${token}`),
    /share_link_too_large/
  );
});
