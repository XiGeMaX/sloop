import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";
import worker, {
  buildCalendar,
  buildMergedCalendar,
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

function sessionHash(token) {
  return createHash("sha256").update(token).digest("base64");
}

function passwordHash(password, salt) {
  return pbkdf2Sync(password, Buffer.from(salt, "base64"), 100000, 32, "sha256").toString(
    "base64"
  );
}

function createAuthFixture() {
  const passwordSalt = Buffer.alloc(16, 7).toString("base64");
  const passwordDigest = passwordHash("old-password-123", passwordSalt);
  const users = new Map([
    [
      "admin-1",
      {
        id: "admin-1",
        username: "admin",
        nickname: "管理员",
        password_hash: passwordDigest,
        password_salt: passwordSalt,
        role: "admin",
        status: "approved",
        invite_code: null,
        created_at: "2026-01-01T00:00:00.000Z",
        approved_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    [
      "member-1",
      {
        id: "member-1",
        username: "member",
        nickname: "小林",
        password_hash: passwordDigest,
        password_salt: passwordSalt,
        role: "user",
        status: "approved",
        invite_code: null,
        created_at: "2026-01-02T00:00:00.000Z",
        approved_at: "2026-01-02T00:00:00.000Z"
      }
    ],
    [
      "member-2",
      {
        id: "member-2",
        username: "taken_name",
        nickname: "阿青",
        password_hash: passwordDigest,
        password_salt: passwordSalt,
        role: "user",
        status: "approved",
        invite_code: null,
        created_at: "2026-01-03T00:00:00.000Z",
        approved_at: "2026-01-03T00:00:00.000Z"
      }
    ]
  ]);
  const sessions = new Map([
    [sessionHash("admin-token"), { user_id: "admin-1", expires_at: 9999999999 }],
    [sessionHash("member-token"), { user_id: "member-1", expires_at: 9999999999 }],
    [sessionHash("member-other-token"), { user_id: "member-1", expires_at: 9999999999 }]
  ]);
  const shiftLibraries = new Map();
  const db = {
    users,
    sessions,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...nextValues) {
          values = nextValues;
          return statement;
        },
        async run() {
          if (/UPDATE users SET username = \?/i.test(sql)) {
            const user = users.get(values[2]);
            if (!user) return { meta: { changes: 0 } };
            user.username = values[0];
            user.nickname = values[1];
            return { meta: { changes: 1 } };
          }
          if (/UPDATE users SET password_hash = \?/i.test(sql)) {
            const user = users.get(values[2]);
            if (!user) return { meta: { changes: 0 } };
            user.password_hash = values[0];
            user.password_salt = values[1];
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM sessions WHERE user_id = \? AND token_hash != \?/i.test(sql)) {
            let changes = 0;
            for (const [tokenHash, session] of sessions) {
              if (session.user_id === values[0] && tokenHash !== values[1]) {
                sessions.delete(tokenHash);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          if (/DELETE FROM sessions WHERE user_id = \?/i.test(sql)) {
            let changes = 0;
            for (const [tokenHash, session] of sessions) {
              if (session.user_id === values[0]) {
                sessions.delete(tokenHash);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          if (/INSERT INTO shift_libraries/i.test(sql)) {
            shiftLibraries.set(values[0], {
              presets_json: values[1],
              updated_at: values[2]
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (/FROM sessions s/i.test(sql)) {
            const session = sessions.get(values[0]);
            const user = session && users.get(session.user_id);
            return user?.status === "approved" && session.expires_at > values[1] ? user : null;
          }
          if (/SELECT id FROM users WHERE username = \? AND id != \?/i.test(sql)) {
            return (
              [...users.values()].find(
                (user) => user.username === values[0] && user.id !== values[1]
              ) || null
            );
          }
          if (/SELECT .* FROM users WHERE id = \?/i.test(sql)) {
            return users.get(values[0]) || null;
          }
          if (/FROM shift_libraries WHERE user_id = \?/i.test(sql)) {
            return shiftLibraries.get(values[0]) || null;
          }
          return null;
        }
      };
      return statement;
    }
  };
  return { db, users, sessions, shiftLibraries, passwordSalt };
}

function authRequest(path, token, body = null, method = "PATCH") {
  return new Request(`https://example.com${path}`, {
    method,
    headers: {
      Cookie: `sloop_session=${token}`,
      Origin: "https://example.com",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function createBackupFixture() {
  const auth = createAuthFixture();
  const invites = new Map([
    [
      "invite-1",
      {
        id: "invite-1",
        code: "TEAM-2026",
        created_by: "admin-1",
        max_uses: 3,
        uses: 1,
        expires_at: 1999999999,
        disabled: 0,
        created_at: "2026-01-04T00:00:00.000Z"
      }
    ]
  ]);
  const calendars = new Map([
    [
      "calendar-1",
      {
        id: "calendar-1",
        user_id: "member-1",
        title: "四班轮转",
        plan_json: JSON.stringify(normalizePlan(samplePlan)),
        share_slug: "share-calendar-1",
        created_at: "2026-01-05T00:00:00.000Z",
        updated_at: "2026-01-06T00:00:00.000Z"
      }
    ]
  ]);
  const shiftLibraries = new Map([
    [
      "member-1",
      {
        user_id: "member-1",
        presets_json: JSON.stringify([
          {
            id: "day",
            kind: "work",
            name: "白班",
            start: "08:00",
            end: "20:00",
            endDayOffset: 0,
            tone: "sky",
            removable: false
          }
        ]),
        updated_at: "2026-01-08T00:00:00.000Z"
      }
    ]
  ]);
  const db = {
    users: auth.users,
    sessions: auth.sessions,
    invites,
    calendars,
    shiftLibraries,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...nextValues) {
          values = nextValues;
          return statement;
        },
        async run() {
          if (/DELETE FROM sessions/i.test(sql)) {
            auth.sessions.clear();
          } else if (/DELETE FROM calendars/i.test(sql)) {
            calendars.clear();
          } else if (/DELETE FROM shift_libraries/i.test(sql)) {
            shiftLibraries.clear();
          } else if (/DELETE FROM invites/i.test(sql)) {
            invites.clear();
          } else if (/DELETE FROM users/i.test(sql)) {
            auth.users.clear();
          } else if (/INSERT INTO users/i.test(sql)) {
            auth.users.set(values[0], {
              id: values[0],
              username: values[1],
              nickname: values[2],
              password_hash: values[3],
              password_salt: values[4],
              role: values[5],
              status: values[6],
              invite_code: values[7],
              created_at: values[8],
              approved_at: values[9],
              approved_by: values[10]
            });
          } else if (/INSERT INTO invites/i.test(sql)) {
            invites.set(values[0], {
              id: values[0],
              code: values[1],
              created_by: values[2],
              max_uses: values[3],
              uses: values[4],
              expires_at: values[5],
              disabled: values[6],
              created_at: values[7]
            });
          } else if (/INSERT INTO calendars/i.test(sql)) {
            calendars.set(values[0], {
              id: values[0],
              user_id: values[1],
              title: values[2],
              plan_json: values[3],
              share_slug: values[4],
              created_at: values[5],
              updated_at: values[6]
            });
          } else if (/INSERT INTO shift_libraries/i.test(sql)) {
            shiftLibraries.set(values[0], {
              user_id: values[0],
              presets_json: values[1],
              updated_at: values[2]
            });
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          return auth.db.prepare(sql).bind(...values).first();
        },
        async all() {
          if (/FROM users/i.test(sql)) {
            return { results: [...auth.users.values()] };
          }
          if (/FROM invites/i.test(sql)) {
            return { results: [...invites.values()] };
          }
          if (/FROM calendars/i.test(sql)) {
            return { results: [...calendars.values()] };
          }
          if (/FROM shift_libraries/i.test(sql)) {
            return { results: [...shiftLibraries.values()] };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return [];
    }
  };
  return { ...auth, db, invites, calendars, shiftLibraries };
}

test("normalizes compact plans and keeps the selected today shift", () => {
  const plan = normalizePlan(samplePlan);
  assert.equal(plan.title, "轮转班表");
  assert.equal(plan.cycle.length, 3);
  assert.equal(plan.todayIndex, 1);
  assert.equal(plan.includeRest, true);
});

test("preserves shift preset references when normalizing plans", () => {
  const plan = normalizePlan({
    ...samplePlan,
    c: [["w", "白班", "08:00", "20:00", "sky", "day"]]
  });
  assert.equal(plan.cycle[0].presetId, "day");
});

test("supports 24-hour and multi-day shifts with end day offsets", () => {
  const plan = normalizePlan({
    ...samplePlan,
    i: 0,
    c: [
      ["w", "24 小时", "09:00", "09:00", "coral", "", 1],
      ["w", "48 小时", "09:00", "09:00", "rose", "", 2]
    ]
  });
  assert.equal(plan.cycle[0].endDayOffset, 1);
  assert.equal(plan.cycle[1].endDayOffset, 2);

  const calendar = buildCalendar(plan, {
    startDate: "2026-10-18",
    months: 1,
    now: testNow
  });
  assert.match(calendar, /X-SLOOP-CYCLE-DAY:1\r\nX-SLOOP-END-DAY-OFFSET:1/);
  assert.match(calendar, /DTSTART:20261018T010000Z\r\nDTEND:20261019T010000Z/);
  assert.match(calendar, /DTSTART:20261019T010000Z\r\nDTEND:20261021T010000Z/);
});

test("infers a one-day offset for legacy overnight shifts", () => {
  const plan = normalizePlan({
    ...samplePlan,
    c: [["w", "夜班", "20:00", "08:00", "indigo"]]
  });
  assert.equal(plan.cycle[0].endDayOffset, 1);
});

test("supports the expanded shift color palette", () => {
  const plan = normalizePlan({
    ...samplePlan,
    i: 0,
    d: 1,
    r: 0,
    c: [["w", "翡翠班", "08:00", "20:00", "emerald"]]
  });
  const calendar = buildCalendar(plan, {
    startDate: "2026-10-18",
    months: 1,
    now: testNow
  });

  assert.equal(plan.cycle[0].tone, "emerald");
  assert.match(calendar, /COLOR:#178b65/);
});

test("allows member subscription durations up to 24 months", () => {
  assert.equal(normalizePlan({ ...samplePlan, d: 18 }).durationMonths, 18);
  assert.equal(normalizePlan({ ...samplePlan, d: 99 }).durationMonths, 24);
  assert.equal(normalizePlan(samplePlan).durationMonths, 12);
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

test("updates the signed-in user's username and nickname without changing sessions", async () => {
  const { db, sessions } = createAuthFixture();
  const beforeSessionCount = sessions.size;
  const conflict = await worker.fetch(
    authRequest("/api/auth/profile", "member-token", {
      username: "TAKEN_NAME",
      nickname: "新昵称"
    }),
    { DB: db }
  );
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "username_exists" });

  const response = await worker.fetch(
    authRequest("/api/auth/profile", "member-token", {
      username: "  New_Member  ",
      nickname: "  新 昵称  "
    }),
    { DB: db }
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.username, "new_member");
  assert.equal(data.user.nickname, "新 昵称");
  assert.equal(sessions.size, beforeSessionCount);
});

test("changes the current password and revokes only the user's other sessions", async () => {
  const { db, users, sessions } = createAuthFixture();
  const response = await worker.fetch(
    authRequest("/api/auth/password", "member-token", {
      currentPassword: "old-password-123",
      newPassword: "new-password-456"
    }),
    { DB: db }
  );

  assert.equal(response.status, 204);
  assert.ok(sessions.has(sessionHash("member-token")));
  assert.equal(sessions.has(sessionHash("member-other-token")), false);
  assert.ok(sessions.has(sessionHash("admin-token")));

  const member = users.get("member-1");
  assert.equal(
    member.password_hash,
    passwordHash("new-password-456", member.password_salt)
  );
});

test("stores each user's shift library and restores it on the next request", async () => {
  const { db, shiftLibraries } = createAuthFixture();
  const presets = [
    {
      id: "day",
      kind: "work",
      name: "白班",
      start: "08:00",
      end: "20:00",
      endDayOffset: 0,
      tone: "sky"
    },
    {
      id: "custom-24",
      kind: "work",
      name: "24 小时",
      start: "09:00",
      end: "09:00",
      endDayOffset: 1,
      tone: "coral",
      visibleOnHome: false
    }
  ];
  const saved = await worker.fetch(
    authRequest("/api/shift-library", "member-token", { presets }, "PUT"),
    { DB: db }
  );
  assert.equal(saved.status, 200);
  const savedData = await saved.json();
  assert.equal(savedData.presets[0].removable, true);
  assert.equal(savedData.presets[1].endDayOffset, 1);
  assert.equal(savedData.presets[1].visibleOnHome, false);
  assert.equal(shiftLibraries.has("member-1"), true);

  const restored = await worker.fetch(
    authRequest("/api/shift-library", "member-token", null, "GET"),
    { DB: db }
  );
  assert.equal(restored.status, 200);
  const data = await restored.json();
  assert.equal(data.presets[0].id, "day");
  assert.equal(data.presets[1].name, "24 小时");
});

test("rejects a password change when the current password is wrong", async () => {
  const { db, users, sessions } = createAuthFixture();
  const originalHash = users.get("member-1").password_hash;
  const response = await worker.fetch(
    authRequest("/api/auth/password", "member-token", {
      currentPassword: "wrong-password",
      newPassword: "new-password-456"
    }),
    { DB: db }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_current_password" });
  assert.equal(users.get("member-1").password_hash, originalHash);
  assert.equal(sessions.has(sessionHash("member-other-token")), true);
});

test("lets an admin reset a member password and revoke all target sessions", async () => {
  const { db, users, sessions } = createAuthFixture();
  const forbidden = await worker.fetch(
    authRequest("/api/admin/users/member-2/password", "member-token", {
      newPassword: "member-chosen-789"
    }),
    { DB: db }
  );
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: "admin_required" });

  const response = await worker.fetch(
    authRequest("/api/admin/users/member-1/password", "admin-token", {
      newPassword: "admin-reset-789"
    }),
    { DB: db }
  );
  assert.equal(response.status, 204);
  assert.equal(sessions.has(sessionHash("member-token")), false);
  assert.equal(sessions.has(sessionHash("member-other-token")), false);
  assert.ok(sessions.has(sessionHash("admin-token")));

  const member = users.get("member-1");
  assert.equal(
    member.password_hash,
    passwordHash("admin-reset-789", member.password_salt)
  );
});

test("exports a complete admin backup without sessions", async () => {
  const { db, users } = createBackupFixture();
  const forbidden = await worker.fetch(
    authRequest("/api/admin/backup", "member-token", null, "GET"),
    { DB: db }
  );
  assert.equal(forbidden.status, 403);

  const response = await worker.fetch(
    authRequest("/api/admin/backup", "admin-token", null, "GET"),
    { DB: db }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="sloop-backup-/);

  const snapshot = await response.json();
  assert.equal(snapshot.format, "sloop-backup");
  assert.equal(snapshot.version, 1);
  assert.deepEqual(snapshot.counts, {
    users: 3,
    invites: 1,
    calendars: 1,
    shiftLibraries: 1
  });
  assert.equal(snapshot.data.users[0].passwordHash, users.get("admin-1").password_hash);
  assert.equal(snapshot.data.calendars[0].plan.cycle.length, 3);
  assert.equal(snapshot.data.shiftLibraries[0].presets[0].id, "day");
  assert.equal("sessions" in snapshot.data, false);
});

test("replaces all data from an admin backup and revokes every session", async () => {
  const {
    db,
    users,
    sessions,
    invites,
    calendars,
    shiftLibraries
  } = createBackupFixture();
  const exportResponse = await worker.fetch(
    authRequest("/api/admin/backup", "admin-token", null, "GET"),
    { DB: db }
  );
  const snapshot = await exportResponse.json();
  snapshot.data.users.find((user) => user.id === "member-1").nickname = "导入成员";

  const response = await worker.fetch(
    authRequest("/api/admin/backup", "admin-token", snapshot, "POST"),
    { DB: db }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    imported: { users: 3, invites: 1, calendars: 1, shiftLibraries: 1 },
    sessionsRevoked: true
  });
  assert.equal(users.get("member-1").nickname, "导入成员");
  assert.equal(sessions.size, 0);
  assert.equal(invites.size, 1);
  assert.equal(calendars.size, 1);
  assert.equal(shiftLibraries.size, 1);
});

test("rejects an incomplete backup without modifying existing data", async () => {
  const { db, users, sessions } = createBackupFixture();
  const exportResponse = await worker.fetch(
    authRequest("/api/admin/backup", "admin-token", null, "GET"),
    { DB: db }
  );
  const snapshot = await exportResponse.json();
  snapshot.data.users.find((user) => user.id === "admin-1").status = "disabled";

  const response = await worker.fetch(
    authRequest("/api/admin/backup", "admin-token", snapshot, "POST"),
    { DB: db }
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_backup" });
  assert.equal(users.size, 3);
  assert.equal(sessions.size, 3);
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

test("starts post-night rest when the overnight shift ends", () => {
  const calendar = buildCalendar(normalizePlan(samplePlan), {
    startDate: "2026-10-18",
    months: 1,
    now: testNow
  });
  assert.match(calendar, /DTSTART:20261018T120000Z/);
  assert.match(calendar, /DTEND:20261019T000000Z/);
  assert.match(calendar, /DTSTART:20261019T000000Z/);
  assert.match(calendar, /DTEND:20261020T000000Z/);
  assert.doesNotMatch(calendar, /DTSTART;VALUE=DATE:20261019/);
  assert.match(calendar, /TRANSP:TRANSPARENT/);
});

test("keeps regular rest days as all-day events", () => {
  const calendar = buildCalendar(
    normalizePlan({
      ...samplePlan,
      i: 0,
      c: [
        ["w", "白班", "08:00", "20:00", "sky"],
        ["o", "休息", "00:00", "00:00", "sage"]
      ]
    }),
    {
      startDate: "2026-10-18",
      months: 1,
      now: testNow
    }
  );
  assert.match(calendar, /DTSTART;VALUE=DATE:20261019/);
  assert.match(calendar, /DTEND;VALUE=DATE:20261020/);
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

test("merges saved calendars without UID collisions", () => {
  const plan = {
    ...samplePlan,
    i: 0,
    d: 1,
    r: 0,
    c: [["w", "白班", "08:00", "20:00", "sky"]]
  };
  const calendar = buildMergedCalendar(
    [
      {
        id: "calendar-a",
        share_slug: "share-a",
        plan_json: JSON.stringify({ ...plan, t: "周期 A" })
      },
      {
        id: "calendar-b",
        share_slug: "share-b",
        plan_json: JSON.stringify({ ...plan, t: "周期 B" })
      }
    ],
    { now: testNow }
  );
  const uids = [...calendar.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);

  assert.equal(uids.length, new Set(uids).size);
  assert.match(calendar, /X-SLOOP-CALENDAR-COUNT:2/);
  assert.match(calendar, /CATEGORIES:周期 A/);
  assert.match(calendar, /CATEGORIES:周期 B/);
  assert.equal(calendar.match(/BEGIN:VCALENDAR/g)?.length, 1);
});

test("serves only explicitly signed calendars from a selected merge", async () => {
  const userId = "visual-user-123456";
  const selectedIds = ["calendar-a0000000", "calendar-b0000000"];
  const ownerSignature = createHmac("sha256", "test-signing-secret")
    .update(`merged-subscription:v2:${userId}`)
    .digest("base64url");
  const selectionSignature = createHmac("sha256", "test-signing-secret")
    .update(`merged-selection:v2:${userId}:${selectedIds.join(",")}`)
    .digest("base64url");
  const rows = [
    {
      id: selectedIds[0],
      share_slug: "share-a",
      plan_json: JSON.stringify({ ...samplePlan, t: "周期 A", d: 1 })
    },
    {
      id: "calendar-c0000000",
      share_slug: "share-c",
      plan_json: JSON.stringify({ ...samplePlan, t: "周期 C", d: 1 })
    }
  ];
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return /SELECT status FROM users/i.test(sql) ? { status: "approved" } : null;
            },
            async all() {
              return { results: rows };
            }
          };
        }
      };
    }
  };
  const token = `${userId}.${ownerSignature}`;
  const query = new URLSearchParams({
    ids: selectedIds.join(","),
    sig: selectionSignature
  });
  const response = await worker.fetch(
    new Request(`https://example.com/api/ics/merged/${token}?${query}`),
    { DB: db, LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /CATEGORIES:周期 A/);
  assert.doesNotMatch(body, /CATEGORIES:周期 C/);
  assert.match(body, /X-SLOOP-CALENDAR-COUNT:1/);

  const tamperedQuery = new URLSearchParams({
    ids: selectedIds.join(","),
    sig: `${selectionSignature}x`
  });
  const tamperedResponse = await worker.fetch(
    new Request(`https://example.com/api/ics/merged/${token}?${tamperedQuery}`),
    { DB: db, LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(tamperedResponse.status, 404);
});

test("requires a signed capability token for member subscriptions", async () => {
  const shareSlug = "member-share-token";
  const signature = createHmac("sha256", "test-signing-secret")
    .update(`member-subscription:v2:${shareSlug}`)
    .digest("base64url");
  const row = {
    id: "calendar-row",
    share_slug: shareSlug,
    plan_json: JSON.stringify({ ...samplePlan, d: 1 })
  };
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return row;
            }
          };
        }
      };
    }
  };

  const signedResponse = await worker.fetch(
    new Request(`https://example.com/api/ics/${shareSlug}.${signature}`),
    { DB: db, LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(signedResponse.status, 200);

  const unsignedResponse = await worker.fetch(
    new Request(`https://example.com/api/ics/${shareSlug}`),
    { DB: db, LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(unsignedResponse.status, 404);
  assert.deepEqual(await unsignedResponse.json(), { error: "calendar_not_found" });

  const legacySignature = createHmac("sha256", "test-signing-secret")
    .update(`member-subscription:${shareSlug}`)
    .digest("base64url");
  const legacyResponse = await worker.fetch(
    new Request(`https://example.com/api/ics/${shareSlug}.${legacySignature}`),
    { DB: db, LINK_SIGNING_SECRET: "test-signing-secret" }
  );
  assert.equal(legacyResponse.status, 404);
  assert.deepEqual(await legacyResponse.json(), { error: "calendar_not_found" });
});

test("decodes deflated share data", async () => {
  const json = JSON.stringify(samplePlan);
  const encoded = `z${deflateSync(Buffer.from(json)).toString("base64url")}`;
  const plan = await decodePlan(encoded);
  assert.equal(plan.timezone, "Asia/Shanghai");
  assert.equal(plan.todayIndex, 1);
});

test("permanently disables guest access and every legacy public guest link", async () => {
  for (const endpoint of ["/api/guest-link", "/api/guest-export"]) {
    const response = await worker.fetch(
      new Request(`https://example.com${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com"
        },
        body: JSON.stringify({ plan: samplePlan })
      })
    );
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "guest_access_disabled" });
  }

  const legacyLink = await worker.fetch(
    new Request("https://example.com/api/guest.ics?token=legacy-public-subscription")
  );
  assert.equal(legacyLink.status, 410);
  assert.deepEqual(await legacyLink.json(), { error: "guest_access_disabled" });
});

test("rejects equal start and end times", async () => {
  const invalid = {
    ...samplePlan,
    c: [["w", "错误班次", "09:00", "09:00", "sky", "", 0]]
  };
  assert.throws(() => normalizePlan(invalid), /shift_times_match/);
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
