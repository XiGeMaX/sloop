import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import worker, {
  buildCalendar,
  decodePlan,
  escapeIcsText,
  foldIcsLine,
  normalizeNickname,
  normalizePlan,
  normalizeUsername
} from "../worker.js";

const samplePlan = {
  v: 2,
  t: "轮转班表",
  z: "Asia/Shanghai",
  r: 1,
  i: 1,
  c: [
    ["w", "白班", "08:00", "20:00", "sky"],
    ["w", "夜班", "20:00", "08:00", "indigo"],
    ["o", "休息", "00:00", "00:00", "sage"]
  ]
};

const testNow = new Date("2026-10-18T02:00:00Z");

function encodeJson(value) {
  return `j${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}

async function createTestGuestPath() {
  const response = await worker.fetch(
    new Request("https://example.com/api/guest-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com"
      },
      body: JSON.stringify({ plan: samplePlan })
    }),
    { LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(response.status, 200);
  return (await response.json()).path;
}

test("normalizes compact plans and keeps the selected today shift", () => {
  const plan = normalizePlan(samplePlan);
  assert.equal(plan.title, "轮转班表");
  assert.equal(plan.cycle.length, 3);
  assert.equal(plan.todayIndex, 1);
  assert.equal(plan.includeRest, true);
});

test("normalizes usernames without requiring email addresses", () => {
  assert.equal(normalizeUsername("  Sloop_User  "), "sloop_user");
  assert.equal(normalizeUsername("值班员-01"), "值班员-01");
  assert.throws(() => normalizeUsername("not an email"), /invalid_username/);
});

test("keeps nickname distinct from username", () => {
  assert.equal(normalizeNickname("  小 林  "), "小 林");
  assert.throws(() => normalizeNickname("   "), /invalid_nickname/);
});

test("starts the cycle from the selected shift for today", () => {
  const calendar = buildCalendar(normalizePlan(samplePlan), {
    startDate: "2026-10-18",
    months: 1,
    now: testNow
  });
  assert.match(calendar, /X-SLOOP-TODAY-INDEX:2/);
  assert.match(calendar, /SUMMARY:夜班/);
  assert.match(calendar, /DTSTART:20261018T120000Z/);
  assert.match(calendar, /DTEND:20261019T000000Z/);
});

test("supports overnight shifts and transparent rest days", () => {
  const calendar = buildCalendar(normalizePlan(samplePlan), {
    startDate: "2026-10-18",
    months: 1,
    now: testNow
  });
  assert.match(calendar, /DTSTART:20261018T120000Z/);
  assert.match(calendar, /DTEND:20261019T000000Z/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20261019/);
  assert.match(calendar, /TRANSP:TRANSPARENT/);
});

test("applies timezone daylight-saving offsets per event date", () => {
  const plan = normalizePlan({
    t: "纽约班表",
    z: "America/New_York",
    i: 0,
    c: [["w", "白班", "08:00", "20:00", "sky"]]
  });
  const calendar = buildCalendar(plan, {
    startDate: "2026-10-31",
    months: 1,
    now: testNow
  });
  assert.match(calendar, /DTSTART:20261031T120000Z/);
  assert.match(calendar, /DTSTART:20261101T130000Z/);
});

test("decodes deflated share data", async () => {
  const json = JSON.stringify(samplePlan);
  const encoded = `z${deflateSync(Buffer.from(json)).toString("base64url")}`;
  const plan = await decodePlan(encoded);
  assert.equal(plan.timezone, "Asia/Shanghai");
  assert.equal(plan.todayIndex, 1);
});

test("creates a signed guest link that serves exactly three months", async () => {
  const path = await createTestGuestPath();
  assert.match(path, /^\/api\/guest\.ics\?plan=/);

  const response = await worker.fetch(
    new Request(`https://example.com${path}`, {
      headers: { Origin: "https://example.com" }
    }),
    { LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/calendar/);
  assert.match(body, /X-WR-CALDESC:.*3 个月/);
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /END:VCALENDAR/);
});

test("rejects equal start and end times", async () => {
  const invalid = {
    ...samplePlan,
    c: [["w", "错误班次", "09:00", "09:00", "sky"]]
  };
  const response = await worker.fetch(
    new Request("https://example.com/api/guest-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com"
      },
      body: JSON.stringify({ plan: invalid })
    }),
    { LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "shift_times_match" });
});

test("rejects a tampered guest signature", async () => {
  const path = await createTestGuestPath();
  const response = await worker.fetch(
    new Request(`https://example.com${path.replace(/sig=./, "sig=x")}`),
    { LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "invalid_signature" });
});

test("escapes ICS text and folds long UTF-8 lines safely", () => {
  assert.equal(escapeIcsText("早班, A; B\\C"), "早班\\, A\\; B\\\\C");
  const folded = foldIcsLine(`SUMMARY:${"班".repeat(40)}`);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(new TextEncoder().encode(line).length <= 75);
  }
});
