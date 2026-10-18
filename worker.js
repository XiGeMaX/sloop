const DEFAULT_TIMEZONE = "Asia/Shanghai";
const MAX_CYCLE_DAYS = 35;
const MAX_GUEST_MONTHS = 3;
const MAX_GUEST_EXPORT_MONTHS = 6;
const DEFAULT_MEMBER_MONTHS = 12;
const MAX_MEMBER_MONTHS = 24;
const MAX_ENCODED_PLAN_LENGTH = 24000;
const MAX_DECODED_PLAN_LENGTH = 100000;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const GUEST_LINK_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_ACTIVE_GUEST_SUBSCRIPTIONS = 10000;
const MAX_CALENDARS_PER_USER = 50;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const BACKUP_FORMAT = "sloop-backup";
const BACKUP_VERSION = 1;
const PASSWORD_ITERATIONS = 210000;
const SESSION_COOKIE = "sloop_session";
const TONES = {
  sky: "#5f96f4",
  indigo: "#8b8ff6",
  sage: "#86b89a",
  sun: "#e7b85e",
  coral: "#e98e7d",
  rose: "#dc89ad",
  teal: "#58a99f",
  lime: "#9ab95f",
  plum: "#a58bc9",
  clay: "#c9785f",
  slate: "#7189a4",
  berry: "#bb7bb0"
};
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback;
}

function normalizeUsername(value) {
  const username = String(value ?? "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  if (
    username.length < 3 ||
    username.length > 24 ||
    !/^[\p{L}\p{N}_-]+$/u.test(username)
  ) {
    throw new ApiError(400, "invalid_username");
  }
  return username;
}

function normalizePassword(value) {
  const password = String(value ?? "");
  if (password.length < 8 || password.length > 128) {
    throw new ApiError(400, "invalid_password");
  }
  return password;
}

function normalizeNickname(value) {
  const nickname = cleanText(value, 30);
  if (!nickname) throw new ApiError(400, "invalid_nickname");
  return nickname;
}

function normalizeInviteCode(value) {
  const code = cleanText(value, 32).toLocaleUpperCase("en-US");
  if (!code) return "";
  if (!/^[\p{L}\p{N}_-]{4,32}$/u.test(code)) {
    throw new ApiError(400, "invalid_invite_code");
  }
  return code;
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== "object") {
    throw new ApiError(400, "invalid_plan");
  }

  const sourceCycle = raw.c ?? raw.cycle;
  if (!Array.isArray(sourceCycle) || sourceCycle.length === 0 || sourceCycle.length > MAX_CYCLE_DAYS) {
    throw new ApiError(400, "invalid_cycle");
  }

  const cycle = sourceCycle.map((source, index) => {
    const item = Array.isArray(source)
      ? {
          kind: source[0],
          name: source[1],
          start: source[2],
          end: source[3],
          tone: source[4],
          presetId: source[5]
        }
      : source;
    const kindValue = String(item?.k ?? item?.kind ?? "w");
    const kind = kindValue === "off" || kindValue === "o" ? "off" : "work";
    const name = cleanText(item?.n ?? item?.name, 28);
    const fallbackName = kind === "off" ? "休息" : `班次 ${index + 1}`;
    const startTime = cleanTime(item?.a ?? item?.start, kind === "off" ? "00:00" : "09:00");
    const endTime = cleanTime(item?.b ?? item?.end, kind === "off" ? "00:00" : "18:00");
    const toneValue = String(item?.o ?? item?.tone ?? (kind === "off" ? "sage" : "sky"));
    const tone = Object.hasOwn(TONES, toneValue) ? toneValue : "sky";
    const presetId = cleanText(item?.p ?? item?.presetId, 80) || null;

    if (kind === "work" && startTime === endTime) {
      throw new ApiError(400, "shift_times_match");
    }

    return {
      kind,
      name: name || fallbackName,
      start: startTime,
      end: endTime,
      tone,
      presetId
    };
  });

  const todayIndex = Number(raw.i ?? raw.todayIndex ?? 0);
  const timezone = cleanText(raw.z ?? raw.timezone, 64) || DEFAULT_TIMEZONE;
  const durationValue = Number(raw.d ?? raw.durationMonths ?? DEFAULT_MEMBER_MONTHS);
  const durationMonths = Number.isFinite(durationValue)
    ? Math.max(1, Math.min(MAX_MEMBER_MONTHS, Math.round(durationValue)))
    : DEFAULT_MEMBER_MONTHS;

  return {
    title: cleanText(raw.t ?? raw.title, 64) || "轮转班表",
    timezone,
    durationMonths,
    todayIndex:
      Number.isInteger(todayIndex) && todayIndex >= 0 && todayIndex < cycle.length ? todayIndex : 0,
    includeRest: Boolean(raw.r ?? raw.includeRest),
    cycle
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function hashPassword(password, saltBase64) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64(saltBase64),
      iterations: PASSWORD_ITERATIONS
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function passwordMatches(row, password) {
  const hash = await hashPassword(String(password ?? ""), row.password_salt);
  return constantTimeEqual(hash, row.password_hash);
}

async function hmacBase64Url(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function encodePlan(plan) {
  const normalized = normalizePlan(plan);
  const json = JSON.stringify(normalized);
  const bytes = textEncoder.encode(json);
  const raw = `j${bytesToBase64Url(bytes)}`;

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const packed = `z${bytesToBase64Url(compressed)}`;
    return packed.length < raw.length ? packed : raw;
  } catch {
    return raw;
  }
}

async function decodePlan(encoded) {
  if (typeof encoded !== "string" || encoded.length < 2 || encoded.length > MAX_ENCODED_PLAN_LENGTH) {
    throw new ApiError(400, "invalid_encoded_plan");
  }

  const mode = encoded[0];
  const payload = fromBase64Url(encoded.slice(1));
  let json;

  if (mode === "z") {
    const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate"));
    json = await new Response(stream).text();
  } else if (mode === "j") {
    json = textDecoder.decode(payload);
  } else {
    throw new ApiError(400, "unsupported_encoding");
  }

  if (json.length > MAX_DECODED_PLAN_LENGTH) {
    throw new ApiError(400, "plan_too_large");
  }

  try {
    return normalizePlan(JSON.parse(json));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_plan");
  }
}

function addMonths(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function addUtcDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

const dateTimeFormatters = new Map();

function getZonedParts(timestamp, timezone) {
  let formatter = dateTimeFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    dateTimeFormatters.set(timezone, formatter);
  }

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getTimezoneOffset(timestamp, timezone) {
  const parts = getZonedParts(timestamp, timezone);
  const localSerial = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return localSerial - Math.floor(timestamp / 1000) * 1000;
}

function localDateTimeToUtc(year, month, day, hour, minute, timezone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = getTimezoneOffset(guess, timezone);
    const adjusted = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
    if (adjusted === guess) break;
    guess = adjusted;
  }

  return new Date(guess);
}

function formatIcsUtc(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "T",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
    "Z"
  ].join("");
}

function formatIcsDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function todayDateParts(now, timezone) {
  const parts = getZonedParts(now.getTime(), timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function buildCalendar(planInput, options = {}) {
  const plan = normalizePlan(planInput);
  const now = options.now ?? new Date();
  const months = Math.max(1, Math.min(24, Number(options.months) || MAX_GUEST_MONTHS));
  const uidNamespace = String(options.uidNamespace ?? "");
  const start = options.startDate ? parseDateParts(options.startDate) : todayDateParts(now, plan.timezone);
  if (!start) throw new ApiError(400, "invalid_start_date");

  const rangeStart = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const rangeEnd = addMonths(rangeStart, months);
  const stamp = formatIcsUtc(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sloop//Shift Cycle Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(plan.title)}`,
    `X-WR-TIMEZONE:${escapeIcsText(plan.timezone)}`,
    `X-WR-CALDESC:${escapeIcsText(`从今天起 ${months} 个月的周期班表`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    `X-SLOOP-TODAY-INDEX:${plan.todayIndex + 1}`
  ];

  for (let dayOffset = 0; ; dayOffset += 1) {
    const date = addUtcDays(rangeStart, dayOffset);
    if (date >= rangeEnd) break;

    const cycleIndex = (plan.todayIndex + dayOffset) % plan.cycle.length;
    const shift = plan.cycle[cycleIndex];
    const previousShift =
      plan.cycle[(cycleIndex - 1 + plan.cycle.length) % plan.cycle.length];

    if (shift.kind === "off" && !(options.includeRest ?? plan.includeRest)) continue;

    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    const uidSeed = `${uidNamespace ? `${uidNamespace}|` : ""}${cycleIndex}|${shift.name}|${shift.start}|${shift.end}|${shift.tone}`;
    const uid = `sloop-${formatIcsDate(date)}-${stableHash(uidSeed)}@shift-cycle.ics`;
    const description = `周期第 ${cycleIndex + 1} 天 · ${plan.title}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`LAST-MODIFIED:${stamp}`);
    lines.push("SEQUENCE:0");
    lines.push(`SUMMARY:${escapeIcsText(shift.name)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push(`CATEGORIES:${escapeIcsText(plan.title)}`);
    lines.push(`X-SLOOP-CYCLE-DAY:${cycleIndex + 1}`);

    if (shift.kind === "off") {
      const previousOvernight =
        previousShift.kind === "work" &&
        timeToMinutes(previousShift.end) <= timeToMinutes(previousShift.start);

      if (previousOvernight) {
        const [restHour, restMinute] = previousShift.end.split(":").map(Number);
        const restEnd = addUtcDays(date, 1);
        const restStartUtc = localDateTimeToUtc(
          year,
          month,
          day,
          restHour,
          restMinute,
          plan.timezone
        );
        const restEndUtc = localDateTimeToUtc(
          restEnd.getUTCFullYear(),
          restEnd.getUTCMonth() + 1,
          restEnd.getUTCDate(),
          restHour,
          restMinute,
          plan.timezone
        );
        lines.push(`DTSTART:${formatIcsUtc(restStartUtc)}`);
        lines.push(`DTEND:${formatIcsUtc(restEndUtc)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(date)}`);
        lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addUtcDays(date, 1))}`);
      }
      lines.push("TRANSP:TRANSPARENT");
      lines.push(`COLOR:${TONES[shift.tone]}`);
    } else {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      const overnight = timeToMinutes(shift.end) <= timeToMinutes(shift.start);
      const endDate = overnight ? addUtcDays(date, 1) : date;
      const startUtc = localDateTimeToUtc(year, month, day, startHour, startMinute, plan.timezone);
      const endUtc = localDateTimeToUtc(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth() + 1,
        endDate.getUTCDate(),
        endHour,
        endMinute,
        plan.timezone
      );

      lines.push(`DTSTART:${formatIcsUtc(startUtc)}`);
      lines.push(`DTEND:${formatIcsUtc(endUtc)}`);
      lines.push("TRANSP:OPAQUE");
      lines.push(`COLOR:${TONES[shift.tone]}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

function buildMergedCalendar(calendarRows, options = {}) {
  if (!Array.isArray(calendarRows)) throw new ApiError(500, "calendar_data_invalid");
  const now = options.now ?? new Date();
  const plans = calendarRows.map((row, index) => {
    try {
      return {
        row,
        index,
        plan: normalizePlan(JSON.parse(row.plan_json))
      };
    } catch {
      throw new ApiError(500, "calendar_data_invalid");
    }
  });
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sloop//Merged Shift Cycle Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Sloop 合并班表",
    `X-WR-TIMEZONE:${DEFAULT_TIMEZONE}`,
    `X-WR-CALDESC:${escapeIcsText(`合并 ${plans.length} 个已保存周期`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    `X-SLOOP-CALENDAR-COUNT:${plans.length}`
  ]
    .map(foldIcsLine)
    .join("\r\n");
  const events = plans
    .map(({ row, index, plan }) => {
      const calendar = buildCalendar(plan, {
        now,
        months: plan.durationMonths,
        includeRest: plan.includeRest,
        uidNamespace: row.share_slug || row.id || String(index)
      });
      const eventStart = calendar.indexOf("BEGIN:VEVENT");
      const calendarEnd = calendar.lastIndexOf("END:VCALENDAR");
      return eventStart >= 0 && calendarEnd > eventStart
        ? calendar.slice(eventStart, calendarEnd)
        : "";
    })
    .join("");

  return `${header}\r\n${events}END:VCALENDAR\r\n`;
}

function foldIcsLine(line) {
  const output = [];
  let current = "";
  let bytes = 0;
  let isFirstLine = true;

  for (const character of line) {
    const characterBytes = textEncoder.encode(character).length;
    const limit = isFirstLine ? 75 : 74;

    if (bytes + characterBytes > limit) {
      output.push(current);
      current = ` ${character}`;
      bytes = 1 + characterBytes;
      isFirstLine = false;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }

  output.push(current);
  return output.join("\r\n");
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function emptyResponse(status = 204, extraHeaders = {}) {
  return new Response(null, { status, headers: extraHeaders });
}

async function readJson(request, maxBytes = 64000) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) throw new ApiError(413, "request_too_large");
  try {
    const text = await request.text();
    if (textEncoder.encode(text).byteLength > maxBytes) {
      throw new ApiError(413, "request_too_large");
    }
    const value = JSON.parse(text);
    if (!value || typeof value !== "object") throw new Error("invalid");
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json");
  }
}

function requireDatabase(env) {
  if (!env.DB) throw new ApiError(503, "database_not_configured");
  return env.DB;
}

function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "cross_origin_request");
  }
  if (site === "cross-site") throw new ApiError(403, "cross_origin_request");
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const separator = value.indexOf("=");
        return separator < 0
          ? [value, ""]
          : [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))];
      })
  );
}

function sessionCookie(token, request, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function serializeUser(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at
  };
}

async function createSession(env, userId, request) {
  const token = randomToken(32);
  const tokenHash = await sha256Base64(token);
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE;
  await requireDatabase(env)
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now.toISOString(), expiresAt)
    .run();
  return {
    token,
    cookie: sessionCookie(token, request, SESSION_MAX_AGE)
  };
}

async function getSessionUser(request, env) {
  const db = requireDatabase(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256Base64(token);
  const row = await db
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'approved'
       LIMIT 1`
    )
    .bind(tokenHash, Math.floor(Date.now() / 1000))
    .first();
  return row ? serializeUser(row) : null;
}

async function requireUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) throw new ApiError(401, "authentication_required");
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new ApiError(403, "admin_required");
  return user;
}

async function registerUser(request, env) {
  const db = requireDatabase(env);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);
  const nickname = normalizeNickname(body.nickname);
  const inviteCode = normalizeInviteCode(body.inviteCode);
  const now = new Date().toISOString();

  const existing = await db
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .bind(username)
    .first();
  if (existing) throw new ApiError(409, "username_exists");

  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM users").first();
  const bootstrap = Number(countRow?.count || 0) === 0;

  let invite = null;
  if (inviteCode) {
    invite = await db
      .prepare(
        `SELECT *
         FROM invites
         WHERE code = ? AND disabled = 0 AND uses < max_uses
           AND (expires_at IS NULL OR expires_at > ?)
         LIMIT 1`
      )
      .bind(inviteCode, Math.floor(Date.now() / 1000))
      .first();
    if (!invite) throw new ApiError(400, "invalid_invite");
  }

  const approved = bootstrap || Boolean(invite);
  const role = bootstrap ? "admin" : "user";
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await hashPassword(password, salt);
  const userId = randomToken(16);

  await db
    .prepare(
      `INSERT INTO users
       (id, username, nickname, password_hash, password_salt, role, status, invite_code, created_at, approved_at, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      username,
      nickname,
      passwordHash,
      salt,
      role,
      approved ? "approved" : "pending",
      inviteCode || null,
      now,
      approved ? now : null,
      approved ? userId : null
    )
    .run();

  if (invite) {
    await db
      .prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?")
      .bind(invite.id)
      .run();
  }

  const user = {
    id: userId,
    username,
    nickname,
    role,
    status: approved ? "approved" : "pending",
    createdAt: now,
    approvedAt: approved ? now : null
  };

  if (!approved) {
    return jsonResponse({ user, bootstrap, message: "awaiting_approval" }, 201);
  }

  const session = await createSession(env, userId, request);
  return jsonResponse(
    { user, bootstrap, message: bootstrap ? "admin_created" : "registered" },
    201,
    { "Set-Cookie": session.cookie }
  );
}

async function loginUser(request, env) {
  const db = requireDatabase(env);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);
  const row = await db
    .prepare("SELECT * FROM users WHERE username = ? LIMIT 1")
    .bind(username)
    .first();

  if (!row) throw new ApiError(401, "invalid_credentials");
  if (!(await passwordMatches(row, password))) throw new ApiError(401, "invalid_credentials");
  if (row.status === "pending") throw new ApiError(403, "account_pending");
  if (row.status === "rejected") throw new ApiError(403, "account_rejected");
  if (row.status === "disabled") throw new ApiError(403, "account_disabled");

  const session = await createSession(env, row.id, request);
  return jsonResponse(
    { user: serializeUser(row) },
    200,
    { "Set-Cookie": session.cookie }
  );
}

async function logoutUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    const tokenHash = await sha256Base64(token);
    await requireDatabase(env).prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return emptyResponse(204, {
    "Set-Cookie": sessionCookie("", request, 0)
  });
}

async function updateOwnProfile(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const username = normalizeUsername(body.username ?? user.username);
  const nickname = normalizeNickname(body.nickname ?? user.nickname);
  const db = requireDatabase(env);

  if (username !== user.username) {
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1")
      .bind(username, user.id)
      .first();
    if (existing) throw new ApiError(409, "username_exists");
  }

  await db
    .prepare("UPDATE users SET username = ?, nickname = ? WHERE id = ?")
    .bind(username, nickname, user.id)
    .run();

  return jsonResponse({
    user: {
      ...user,
      username,
      nickname
    }
  });
}

async function changeOwnPassword(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const newPassword = normalizePassword(body.newPassword);
  const db = requireDatabase(env);
  const row = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(user.id).first();
  if (!row) throw new ApiError(404, "user_not_found");
  if (!(await passwordMatches(row, body.currentPassword))) {
    throw new ApiError(400, "invalid_current_password");
  }

  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await hashPassword(newPassword, salt);
  await db
    .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(passwordHash, salt, user.id)
    .run();

  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) throw new ApiError(401, "authentication_required");
  const tokenHash = await sha256Base64(token);
  await db
    .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
    .bind(user.id, tokenHash)
    .run();

  return emptyResponse();
}

async function listUsers(request, env) {
  await requireAdmin(request, env);
  const rows = await requireDatabase(env)
    .prepare(
      `SELECT u.id, u.username, u.nickname, u.role, u.status, u.invite_code,
              u.created_at, u.approved_at, COUNT(c.id) AS calendar_count
       FROM users u
       LEFT JOIN calendars c ON c.user_id = u.id
       GROUP BY u.id
       ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC`
    )
    .all();

  return jsonResponse({
    users: (rows.results || []).map((row) => ({
      ...serializeUser(row),
      inviteCode: row.invite_code,
      calendarCount: Number(row.calendar_count || 0)
    }))
  });
}

async function updateUser(request, env, userId) {
  const db = requireDatabase(env);
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const target = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!target) throw new ApiError(404, "user_not_found");

  const status = body.status ?? target.status;
  const role = body.role ?? target.role;
  if (!["pending", "approved", "rejected", "disabled"].includes(status)) {
    throw new ApiError(400, "invalid_status");
  }
  if (!["admin", "user"].includes(role)) throw new ApiError(400, "invalid_role");

  if (target.id === admin.id && (status !== "approved" || role !== target.role)) {
    throw new ApiError(400, "cannot_modify_self");
  }

  if (
    target.role === "admin" &&
    target.status === "approved" &&
    (role !== "admin" || status !== "approved")
  ) {
    const adminCount = await db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'approved'")
      .first();
    if (Number(adminCount?.count || 0) <= 1) {
      throw new ApiError(400, "last_admin");
    }
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE users
       SET status = ?, role = ?,
           approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
           approved_by = CASE WHEN ? = 'approved' THEN COALESCE(approved_by, ?) ELSE approved_by END
       WHERE id = ?`
    )
    .bind(status, role, status, now, status, admin.id, target.id)
    .run();

  if (status !== "approved") {
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
  }

  return jsonResponse({
    user: {
      ...serializeUser({ ...target, status, role }),
      approvedAt: status === "approved" ? target.approved_at || now : target.approved_at
    }
  });
}

async function resetUserPassword(request, env, userId) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const newPassword = normalizePassword(body.newPassword);
  const db = requireDatabase(env);
  const target = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!target) throw new ApiError(404, "user_not_found");
  if (target.id === admin.id) throw new ApiError(400, "cannot_reset_self");

  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await hashPassword(newPassword, salt);
  await db
    .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(passwordHash, salt, target.id)
    .run();
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();

  return emptyResponse();
}

function invalidBackup() {
  return new ApiError(400, "invalid_backup");
}

function normalizeBackupId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw invalidBackup();
  return id;
}

function normalizeBackupTimestamp(value, nullable = false) {
  if (value == null || value === "") {
    if (nullable) return null;
    throw invalidBackup();
  }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw invalidBackup();
  return new Date(timestamp).toISOString();
}

function normalizeBackupPasswordPart(value, expectedBytes) {
  const encoded = String(value ?? "");
  try {
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
      fromBase64(encoded).byteLength !== expectedBytes
    ) {
      throw invalidBackup();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidBackup();
  }
  return encoded;
}

function normalizeBackupInteger(value, min, max, nullable = false) {
  if ((value == null || value === "") && nullable) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw invalidBackup();
  return number;
}

function normalizeBackupFlag(value) {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  throw invalidBackup();
}

function normalizeBackupUser(source) {
  if (!source || typeof source !== "object") throw invalidBackup();
  let username;
  let nickname;
  try {
    username = normalizeUsername(source.username);
    nickname = normalizeNickname(source.nickname);
  } catch {
    throw invalidBackup();
  }
  const role = source.role;
  const status = source.status;
  if (!["admin", "user"].includes(role)) throw invalidBackup();
  if (!["pending", "approved", "rejected", "disabled"].includes(status)) {
    throw invalidBackup();
  }
  return {
    id: normalizeBackupId(source.id),
    username,
    nickname,
    passwordHash: normalizeBackupPasswordPart(source.passwordHash, 32),
    passwordSalt: normalizeBackupPasswordPart(source.passwordSalt, 16),
    role,
    status,
    inviteCode: source.inviteCode ? cleanText(source.inviteCode, 32) || null : null,
    createdAt: normalizeBackupTimestamp(source.createdAt),
    approvedAt: normalizeBackupTimestamp(source.approvedAt, true),
    approvedBy: source.approvedBy ? normalizeBackupId(source.approvedBy) : null
  };
}

function normalizeBackupInvite(source) {
  if (!source || typeof source !== "object") throw invalidBackup();
  const code = cleanText(source.code, 32).toLocaleUpperCase("en-US");
  if (!/^[\p{L}\p{N}_-]{4,32}$/u.test(code)) throw invalidBackup();
  const maxUses = normalizeBackupInteger(source.maxUses, 1, 100);
  return {
    id: normalizeBackupId(source.id),
    code,
    createdBy: normalizeBackupId(source.createdBy),
    maxUses,
    uses: normalizeBackupInteger(source.uses, 0, maxUses),
    expiresAt: normalizeBackupInteger(source.expiresAt, 0, 9999999999, true),
    disabled: normalizeBackupFlag(source.disabled),
    createdAt: normalizeBackupTimestamp(source.createdAt)
  };
}

function normalizeBackupCalendar(source) {
  if (!source || typeof source !== "object") throw invalidBackup();
  let plan;
  try {
    plan = normalizePlan(source.plan);
  } catch {
    throw invalidBackup();
  }
  const title = cleanText(source.title, 64) || plan.title;
  plan.title = title;
  return {
    id: normalizeBackupId(source.id),
    userId: normalizeBackupId(source.userId),
    title,
    plan,
    shareSlug: normalizeBackupId(source.shareSlug),
    createdAt: normalizeBackupTimestamp(source.createdAt),
    updatedAt: normalizeBackupTimestamp(source.updatedAt)
  };
}

function normalizeBackupSnapshot(source) {
  if (
    !source ||
    typeof source !== "object" ||
    source.format !== BACKUP_FORMAT ||
    Number(source.version) !== BACKUP_VERSION ||
    !source.data ||
    typeof source.data !== "object"
  ) {
    throw invalidBackup();
  }
  const { users: sourceUsers, invites: sourceInvites, calendars: sourceCalendars } = source.data;
  if (
    !Array.isArray(sourceUsers) ||
    !Array.isArray(sourceInvites) ||
    !Array.isArray(sourceCalendars) ||
    sourceUsers.length > 10000 ||
    sourceInvites.length > 10000 ||
    sourceCalendars.length > 50000
  ) {
    throw invalidBackup();
  }

  const users = sourceUsers.map(normalizeBackupUser);
  const invites = sourceInvites.map(normalizeBackupInvite);
  const calendars = sourceCalendars.map(normalizeBackupCalendar);
  const userIds = new Set(users.map((user) => user.id));
  const usernames = new Set(users.map((user) => user.username));
  const inviteIds = new Set(invites.map((invite) => invite.id));
  const inviteCodes = new Set(invites.map((invite) => invite.code));
  const calendarIds = new Set(calendars.map((calendar) => calendar.id));
  const calendarSlugs = new Set(calendars.map((calendar) => calendar.shareSlug));

  if (
    !users.some((user) => user.role === "admin" && user.status === "approved") ||
    userIds.size !== users.length ||
    usernames.size !== users.length ||
    inviteIds.size !== invites.length ||
    inviteCodes.size !== invites.length ||
    calendarIds.size !== calendars.length ||
    calendarSlugs.size !== calendars.length ||
    invites.some((invite) => !userIds.has(invite.createdBy)) ||
    calendars.some((calendar) => !userIds.has(calendar.userId))
  ) {
    throw invalidBackup();
  }

  return {
    counts: {
      users: users.length,
      invites: invites.length,
      calendars: calendars.length
    },
    data: {
      users,
      invites,
      calendars
    }
  };
}

async function exportBackup(request, env) {
  await requireAdmin(request, env);
  const db = requireDatabase(env);
  const [userRows, inviteRows, calendarRows] = await Promise.all([
    db.prepare("SELECT * FROM users ORDER BY created_at, id").all(),
    db.prepare("SELECT * FROM invites ORDER BY created_at, id").all(),
    db.prepare("SELECT * FROM calendars ORDER BY created_at, id").all()
  ]);
  const users = (userRows.results || []).map((row) => ({
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    role: row.role,
    status: row.status,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by
  }));
  const invites = (inviteRows.results || []).map((row) => ({
    id: row.id,
    code: row.code,
    createdBy: row.created_by,
    maxUses: Number(row.max_uses),
    uses: Number(row.uses),
    expiresAt: row.expires_at,
    disabled: Number(row.disabled),
    createdAt: row.created_at
  }));
  const calendars = (calendarRows.results || []).map((row) => {
    let plan = null;
    try {
      plan = JSON.parse(row.plan_json);
    } catch {
      plan = null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      plan,
      shareSlug: row.share_slug,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
  const exportedAt = new Date().toISOString();

  return jsonResponse(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      counts: {
        users: users.length,
        invites: invites.length,
        calendars: calendars.length
      },
      data: {
        users,
        invites,
        calendars
      }
    },
    200,
    {
      "Content-Disposition":
        `attachment; filename="sloop-backup-${exportedAt.slice(0, 10)}.json"`
    }
  );
}

async function importBackup(request, env) {
  await requireAdmin(request, env);
  const snapshot = normalizeBackupSnapshot(await readJson(request, MAX_BACKUP_BYTES));
  const db = requireDatabase(env);
  const statements = [
    db.prepare("DELETE FROM guest_subscriptions"),
    db.prepare("DELETE FROM sessions"),
    db.prepare("DELETE FROM calendars"),
    db.prepare("DELETE FROM invites"),
    db.prepare("DELETE FROM users")
  ];

  for (const user of snapshot.data.users) {
    statements.push(
      db
        .prepare(
          `INSERT INTO users
           (id, username, nickname, password_hash, password_salt, role, status, invite_code,
            created_at, approved_at, approved_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          user.id,
          user.username,
          user.nickname,
          user.passwordHash,
          user.passwordSalt,
          user.role,
          user.status,
          user.inviteCode,
          user.createdAt,
          user.approvedAt,
          user.approvedBy
        )
    );
  }

  for (const invite of snapshot.data.invites) {
    statements.push(
      db
        .prepare(
          `INSERT INTO invites
           (id, code, created_by, max_uses, uses, expires_at, disabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          invite.id,
          invite.code,
          invite.createdBy,
          invite.maxUses,
          invite.uses,
          invite.expiresAt,
          invite.disabled,
          invite.createdAt
        )
    );
  }

  for (const calendar of snapshot.data.calendars) {
    statements.push(
      db
        .prepare(
          `INSERT INTO calendars
           (id, user_id, title, plan_json, share_slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          calendar.id,
          calendar.userId,
          calendar.title,
          JSON.stringify(calendar.plan),
          calendar.shareSlug,
          calendar.createdAt,
          calendar.updatedAt
        )
    );
  }

  try {
    await db.batch(statements);
  } catch (error) {
    console.error("backup_import_failed", error);
    throw invalidBackup();
  }

  return jsonResponse({
    ok: true,
    imported: snapshot.counts,
    sessionsRevoked: true
  });
}

function randomInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function listInvites(request, env) {
  await requireAdmin(request, env);
  const rows = await requireDatabase(env)
    .prepare(
      `SELECT i.*, u.nickname AS creator_name
       FROM invites i
       JOIN users u ON u.id = i.created_by
       ORDER BY i.created_at DESC`
    )
    .all();

  return jsonResponse({
    invites: (rows.results || []).map((row) => ({
      id: row.id,
      code: row.code,
      maxUses: Number(row.max_uses),
      uses: Number(row.uses),
      expiresAt: row.expires_at,
      disabled: Boolean(row.disabled),
      creatorName: row.creator_name,
      createdAt: row.created_at
    }))
  });
}

async function createInvite(request, env) {
  const db = requireDatabase(env);
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const requestedCode = normalizeInviteCode(body.code);
  const code = requestedCode || randomInviteCode();
  const maxUses = Math.max(1, Math.min(100, Number(body.maxUses) || 1));
  let expiresAt = null;

  if (body.expiresAt) {
    const timestamp = Date.parse(body.expiresAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw new ApiError(400, "invalid_expiry");
    }
    expiresAt = Math.floor(timestamp / 1000);
  }

  const existing = await db.prepare("SELECT id FROM invites WHERE code = ? LIMIT 1").bind(code).first();
  if (existing) throw new ApiError(409, "invite_exists");

  const now = new Date().toISOString();
  const id = randomToken(16);
  await db
    .prepare(
      `INSERT INTO invites
       (id, code, created_by, max_uses, uses, expires_at, disabled, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 0, ?)`
    )
    .bind(id, code, admin.id, maxUses, expiresAt, now)
    .run();

  return jsonResponse(
    {
      invite: {
        id,
        code,
        maxUses,
        uses: 0,
        expiresAt,
        disabled: false,
        creatorName: admin.nickname,
        createdAt: now
      }
    },
    201
  );
}

async function disableInvite(request, env, inviteId) {
  await requireAdmin(request, env);
  const result = await requireDatabase(env)
    .prepare("UPDATE invites SET disabled = 1 WHERE id = ?")
    .bind(inviteId)
    .run();
  if (!result.meta?.changes) throw new ApiError(404, "invite_not_found");
  return emptyResponse();
}

async function memberSubscriptionSignature(slug, secret) {
  return hmacBase64Url(`member-subscription:${slug}`, secret);
}

async function serializeCalendar(row, env) {
  const secret = env.LINK_SIGNING_SECRET;
  if (!secret) throw new ApiError(503, "signing_secret_missing");
  let plan;
  try {
    plan = JSON.parse(row.plan_json);
  } catch {
    plan = null;
  }
  const signature = await memberSubscriptionSignature(row.share_slug, secret);
  return {
    id: row.id,
    title: row.title,
    slug: row.share_slug,
    plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subscriptionPath: `/api/ics/${row.share_slug}.${signature}`
  };
}

async function listCalendars(request, env) {
  const user = await requireUser(request, env);
  const rows = await requireDatabase(env)
    .prepare("SELECT * FROM calendars WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(user.id)
    .all();
  const calendars = await Promise.all(
    (rows.results || []).map((row) => serializeCalendar(row, env))
  );
  return jsonResponse({ calendars });
}

async function createCalendar(request, env) {
  const db = requireDatabase(env);
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const plan = normalizePlan(body.plan);
  if (body.title) plan.title = cleanText(body.title, 64) || plan.title;

  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM calendars WHERE user_id = ?")
    .bind(user.id)
    .first();
  if (Number(count?.count || 0) >= MAX_CALENDARS_PER_USER) {
    throw new ApiError(400, "calendar_limit");
  }

  const now = new Date().toISOString();
  const id = randomToken(16);
  const slug = randomToken(24);
  await db
    .prepare(
      `INSERT INTO calendars
       (id, user_id, title, plan_json, share_slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, user.id, plan.title, JSON.stringify(plan), slug, now, now)
    .run();

  const calendar = await serializeCalendar(
    {
      id,
      title: plan.title,
      plan_json: JSON.stringify(plan),
      share_slug: slug,
      created_at: now,
      updated_at: now
    },
    env
  );
  return jsonResponse(
    {
      calendar
    },
    201
  );
}

async function updateCalendar(request, env, calendarId) {
  const db = requireDatabase(env);
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await db
    .prepare("SELECT * FROM calendars WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(calendarId, user.id)
    .first();
  if (!existing) throw new ApiError(404, "calendar_not_found");

  const plan = body.plan ? normalizePlan(body.plan) : JSON.parse(existing.plan_json);
  if (body.title) plan.title = cleanText(body.title, 64) || plan.title;
  const now = new Date().toISOString();

  await db
    .prepare("UPDATE calendars SET title = ?, plan_json = ?, updated_at = ? WHERE id = ?")
    .bind(plan.title, JSON.stringify(plan), now, calendarId)
    .run();

  const calendar = await serializeCalendar(
    {
      ...existing,
      title: plan.title,
      plan_json: JSON.stringify(plan),
      updated_at: now
    },
    env
  );
  return jsonResponse({
    calendar: {
      ...calendar
    }
  });
}

async function deleteCalendar(request, env, calendarId) {
  const user = await requireUser(request, env);
  const result = await requireDatabase(env)
    .prepare("DELETE FROM calendars WHERE id = ? AND user_id = ?")
    .bind(calendarId, user.id)
    .run();
  if (!result.meta?.changes) throw new ApiError(404, "calendar_not_found");
  return emptyResponse();
}

async function createGuestLink(request, env) {
  requireSameOrigin(request);
  const body = await readJson(request);
  return createGuestRecord(request, env, normalizePlan(body.plan), MAX_GUEST_MONTHS);
}

async function createGuestExport(request, env) {
  requireSameOrigin(request);
  const body = await readJson(request);
  return createGuestRecord(
    request,
    env,
    normalizePlan(body.plan),
    MAX_GUEST_EXPORT_MONTHS,
    true
  );
}

async function createGuestRecord(request, env, plan, months, download = false) {
  const db = requireDatabase(env);
  const now = Math.floor(Date.now() / 1000);
  await cleanupGuestSubscriptions(env, now);
  const active = await db
    .prepare("SELECT COUNT(*) AS count FROM guest_subscriptions WHERE expires_at > ?")
    .bind(now)
    .first();
  if (Number(active?.count || 0) >= MAX_ACTIVE_GUEST_SUBSCRIPTIONS) {
    throw new ApiError(503, "guest_capacity_reached");
  }

  const token = randomToken(32);
  const tokenHash = await sha256Base64(token);
  const expiresAt = now + GUEST_LINK_TTL_SECONDS;
  await db
    .prepare(
      `INSERT INTO guest_subscriptions
       (id, token_hash, plan_json, months, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      randomToken(16),
      tokenHash,
      JSON.stringify(plan),
      months,
      new Date(now * 1000).toISOString(),
      expiresAt
    )
    .run();

  return jsonResponse({
    path: `/api/guest.ics?token=${token}${download ? "&download=1" : ""}`,
    months,
    expiresAt
  });
}

async function cleanupGuestSubscriptions(env, now = Math.floor(Date.now() / 1000)) {
  return requireDatabase(env)
    .prepare("DELETE FROM guest_subscriptions WHERE expires_at <= ?")
    .bind(now)
    .run();
}

async function mergedSubscriptionToken(userId, secret) {
  const signature = await hmacBase64Url(`merged-subscription:${userId}`, secret);
  return `${userId}.${signature}`;
}

function normalizeMergedCalendarIds(value, errorStatus = 400) {
  if (!value) return [];
  const ids = String(value)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (
    ids.length > MAX_CALENDARS_PER_USER ||
    ids.some((id) => !/^[A-Za-z0-9_-]{16,64}$/.test(id))
  ) {
    throw new ApiError(
      errorStatus,
      errorStatus === 404 ? "merged_calendar_not_found" : "invalid_calendar_selection"
    );
  }
  return [...new Set(ids)].sort();
}

async function mergedSelectionSignature(userId, calendarIds, secret) {
  return hmacBase64Url(
    `merged-selection:${userId}:${calendarIds.join(",")}`,
    secret
  );
}

async function createMergedSubscription(request, env) {
  const user = await requireUser(request, env);
  const secret = env.LINK_SIGNING_SECRET;
  if (!secret) throw new ApiError(503, "signing_secret_missing");
  const db = requireDatabase(env);
  const url = new URL(request.url);
  const selectedIds = normalizeMergedCalendarIds(url.searchParams.get("ids"));
  const rows = await db
    .prepare("SELECT id FROM calendars WHERE user_id = ? ORDER BY created_at, id")
    .bind(user.id)
    .all();
  const availableIds = new Set((rows.results || []).map((row) => row.id));
  if (selectedIds.some((id) => !availableIds.has(id))) {
    throw new ApiError(404, "calendar_not_found");
  }

  const token = await mergedSubscriptionToken(user.id, secret);
  const selectionSignature = selectedIds.length
    ? await mergedSelectionSignature(user.id, selectedIds, secret)
    : "";
  const query = selectedIds.length
    ? `?ids=${encodeURIComponent(selectedIds.join(","))}&sig=${selectionSignature}`
    : "";

  return jsonResponse({
    subscriptionPath: `/api/ics/merged/${token}${query}`,
    calendarCount: selectedIds.length || availableIds.size
  });
}

async function serveGuestCalendar(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    throw new ApiError(403, "link_expired");
  }
  const tokenHash = await sha256Base64(token);
  const row = await requireDatabase(env)
    .prepare(
      `SELECT plan_json, months
       FROM guest_subscriptions
       WHERE token_hash = ? AND expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, Math.floor(Date.now() / 1000))
    .first();
  if (!row) throw new ApiError(403, "link_expired");

  let plan;
  try {
    plan = normalizePlan(JSON.parse(row.plan_json));
  } catch {
    throw new ApiError(500, "calendar_data_invalid");
  }
  const months = Math.max(1, Math.min(MAX_GUEST_EXPORT_MONTHS, Number(row.months) || 3));
  return serveCalendar(plan, months, request);
}

async function serveMemberCalendar(request, env, slug) {
  const secret = env.LINK_SIGNING_SECRET;
  if (!secret) throw new ApiError(503, "signing_secret_missing");
  const separator = slug.lastIndexOf(".");
  const shareSlug = separator > 0 ? slug.slice(0, separator) : "";
  const signature = separator > 0 ? slug.slice(separator + 1) : "";
  const expected = shareSlug ? await memberSubscriptionSignature(shareSlug, secret) : "";
  if (!shareSlug || !constantTimeEqual(signature, expected)) {
    throw new ApiError(404, "calendar_not_found");
  }

  const row = await requireDatabase(env)
    .prepare(
      `SELECT c.*
       FROM calendars c
       JOIN users u ON u.id = c.user_id
       WHERE c.share_slug = ? AND u.status = 'approved'
       LIMIT 1`
    )
    .bind(shareSlug)
    .first();
  if (!row) throw new ApiError(404, "calendar_not_found");
  let plan;
  try {
    plan = normalizePlan(JSON.parse(row.plan_json));
  } catch {
    throw new ApiError(500, "calendar_data_invalid");
  }
  return serveCalendar(plan, plan.durationMonths, request);
}

async function serveMergedCalendar(request, env, token) {
  const secret = env.LINK_SIGNING_SECRET;
  if (!secret) throw new ApiError(503, "signing_secret_missing");
  const url = new URL(request.url);

  const separator = token.indexOf(".");
  const userId = separator > 0 ? token.slice(0, separator) : "";
  const signature = separator > 0 ? token.slice(separator + 1) : "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(userId) || !signature) {
    throw new ApiError(404, "merged_calendar_not_found");
  }
  const expected = await hmacBase64Url(`merged-subscription:${userId}`, secret);
  if (!constantTimeEqual(signature, expected)) {
    throw new ApiError(404, "merged_calendar_not_found");
  }
  const selectedIds = normalizeMergedCalendarIds(url.searchParams.get("ids"), 404);
  if (selectedIds.length) {
    const selectionSignature = url.searchParams.get("sig") || "";
    const expectedSelectionSignature = await mergedSelectionSignature(
      userId,
      selectedIds,
      secret
    );
    if (!constantTimeEqual(selectionSignature, expectedSelectionSignature)) {
      throw new ApiError(404, "merged_calendar_not_found");
    }
  }

  const db = requireDatabase(env);
  const owner = await db
    .prepare("SELECT status FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();
  if (owner?.status !== "approved") throw new ApiError(404, "merged_calendar_not_found");

  const rows = await db
    .prepare("SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at, id")
    .bind(userId)
    .all();
  const selectedSet = new Set(selectedIds);
  const selectedRows = selectedIds.length
    ? (rows.results || []).filter((row) => selectedSet.has(row.id))
    : rows.results || [];
  const calendar = buildMergedCalendar(selectedRows);
  return calendarFileResponse(calendar, "Sloop 合并班表", request);
}

function calendarFileResponse(calendar, title, request) {
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const filename = encodeURIComponent(`${title}.ics`).replace(/'/g, "%27");

  return new Response(request.method === "HEAD" ? null : calendar, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="shift-cycle.ics"; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}

function serveCalendar(plan, months, request) {
  const calendar = buildCalendar(plan, {
    months,
    includeRest: plan.includeRest
  });
  return calendarFileResponse(calendar, plan.title, request);
}

async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) requireSameOrigin(request);

  if (method === "GET" && path === "/api/health") {
    const db = requireDatabase(env);
    await db.prepare("SELECT 1 AS ok").first();
    return jsonResponse({
      ok: true,
      database: true,
      signingSecret: Boolean(env.LINK_SIGNING_SECRET)
    });
  }

  if (path === "/api/auth/register" && method === "POST") return registerUser(request, env);
  if (path === "/api/auth/login" && method === "POST") return loginUser(request, env);
  if (path === "/api/auth/logout" && method === "POST") return logoutUser(request, env);
  if (path === "/api/auth/profile" && method === "PATCH") return updateOwnProfile(request, env);
  if (path === "/api/auth/password" && method === "PATCH") return changeOwnPassword(request, env);
  if (path === "/api/auth/me" && method === "GET") {
    return jsonResponse({ user: await getSessionUser(request, env) });
  }

  if (path === "/api/guest-link" && method === "POST") return createGuestLink(request, env);
  if (path === "/api/guest-export" && method === "POST") return createGuestExport(request, env);

  if (path === "/api/merged-subscription" && method === "GET") {
    return createMergedSubscription(request, env);
  }

  if (path === "/api/calendars" && method === "GET") return listCalendars(request, env);
  if (path === "/api/calendars" && method === "POST") return createCalendar(request, env);

  const calendarMatch = /^\/api\/calendars\/([^/]+)$/.exec(path);
  if (calendarMatch && method === "PUT") return updateCalendar(request, env, calendarMatch[1]);
  if (calendarMatch && method === "DELETE") return deleteCalendar(request, env, calendarMatch[1]);

  if (path === "/api/admin/users" && method === "GET") return listUsers(request, env);
  const userPasswordMatch = /^\/api\/admin\/users\/([^/]+)\/password$/.exec(path);
  if (userPasswordMatch && method === "PATCH") {
    return resetUserPassword(request, env, userPasswordMatch[1]);
  }
  const userMatch = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
  if (userMatch && method === "PATCH") return updateUser(request, env, userMatch[1]);

  if (path === "/api/admin/backup" && method === "GET") return exportBackup(request, env);
  if (path === "/api/admin/backup" && method === "POST") return importBackup(request, env);

  if (path === "/api/admin/invites" && method === "GET") return listInvites(request, env);
  if (path === "/api/admin/invites" && method === "POST") return createInvite(request, env);
  const inviteMatch = /^\/api\/admin\/invites\/([^/]+)$/.exec(path);
  if (inviteMatch && method === "DELETE") return disableInvite(request, env, inviteMatch[1]);

  const mergedCalendarMatch = /^\/api\/ics\/merged\/([^/]+)$/.exec(path);
  if (mergedCalendarMatch && (method === "GET" || method === "HEAD")) {
    return serveMergedCalendar(request, env, mergedCalendarMatch[1]);
  }

  const memberCalendarMatch = /^\/api\/ics\/([^/]+)$/.exec(path);
  if (memberCalendarMatch && (method === "GET" || method === "HEAD")) {
    return serveMemberCalendar(request, env, memberCalendarMatch[1]);
  }

  if (path === "/api/guest.ics" && (method === "GET" || method === "HEAD")) {
    return serveGuestCalendar(request, env);
  }

  throw new ApiError(404, "not_found");
}

function apiErrorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse({ error: error.code }, error.status);
  }
  console.error(error);
  return jsonResponse({ error: "server_error" }, 500);
}

export {
  buildCalendar,
  buildMergedCalendar,
  decodePlan,
  encodePlan,
  escapeIcsText,
  foldIcsLine,
  normalizeNickname,
  normalizePlan,
  normalizeUsername
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/guest.ics" || /^\/api\/ics\//.test(url.pathname)) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
      try {
        return await handleApiRequest(request, env);
      } catch (error) {
        return apiErrorResponse(error);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "same-origin",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }
      try {
        return await handleApiRequest(request, env);
      } catch (error) {
        return apiErrorResponse(error);
      }
    }

    if (env?.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      cleanupGuestSubscriptions(env).catch((error) => {
        console.error("guest_subscription_cleanup_failed", error);
      })
    );
  }
};
