const STORAGE_KEY = "sloop.plan.v2";
const TIMEZONE = "Asia/Shanghai";
const TONE_ORDER = ["sky", "indigo", "sage", "sun", "coral", "rose"];
const TONE_NAMES = {
  sky: "天蓝",
  indigo: "靛蓝",
  sage: "鼠尾草",
  sun: "暖黄",
  coral: "珊瑚",
  rose: "玫瑰"
};
const PRESETS = {
  day: {
    kind: "work",
    name: "白班",
    start: "08:00",
    end: "20:00",
    tone: "sky",
    icon: "sun"
  },
  night: {
    kind: "work",
    name: "夜班",
    start: "20:00",
    end: "08:00",
    tone: "indigo",
    icon: "moon"
  },
  off: {
    kind: "off",
    name: "休息",
    start: "00:00",
    end: "00:00",
    tone: "sage",
    icon: "coffee"
  }
};
const ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.42 1.42"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  calendarPlus: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M16 14v6"/><path d="M13 17h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5"/><path d="m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
};

const elements = {
  builderView: document.querySelector("#builderView"),
  calendarsView: document.querySelector("#calendarsView"),
  adminView: document.querySelector("#adminView"),
  title: document.querySelector("#calendarTitle"),
  includeRest: document.querySelector("#includeRest"),
  presetRow: document.querySelector("#presetRow"),
  cycleList: document.querySelector("#cycleList"),
  cycleMeta: document.querySelector("#cycleMeta"),
  todayShiftName: document.querySelector("#todayShiftName"),
  todayShiftTime: document.querySelector("#todayShiftTime"),
  cycleLengthLabel: document.querySelector("#cycleLengthLabel"),
  addCustom: document.querySelector("#addCustom"),
  previewDetails: document.querySelector("#previewDetails"),
  rangeCopy: document.querySelector("#rangeCopy"),
  coverageBadge: document.querySelector("#coverageBadge"),
  sequenceTrack: document.querySelector("#sequenceTrack"),
  scheduleList: document.querySelector("#scheduleList"),
  eventEstimate: document.querySelector("#eventEstimate"),
  validityBadge: document.querySelector("#validityBadge"),
  linkText: document.querySelector("#linkText"),
  copyLinkIcon: document.querySelector("#copyLinkIcon"),
  copyLink: document.querySelector("#copyLink"),
  primaryActionLabel: document.querySelector("#primaryActionLabel"),
  saveCalendar: document.querySelector("#saveCalendar"),
  saveCalendarLabel: document.querySelector("#saveCalendarLabel"),
  downloadIcs: document.querySelector("#downloadIcs"),
  openCalendar: document.querySelector("#openCalendar"),
  privacyNote: document.querySelector("#privacyNote"),
  navCalendars: document.querySelector("#navCalendars"),
  navAdmin: document.querySelector("#navAdmin"),
  authButton: document.querySelector("#authButton"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountName: document.querySelector("#accountName"),
  accountRole: document.querySelector("#accountRole"),
  accountStrip: document.querySelector("#accountStrip"),
  accountStripText: document.querySelector("#accountStripText"),
  inlineAuthButton: document.querySelector("#inlineAuthButton"),
  calendarList: document.querySelector("#calendarList"),
  newCalendarButton: document.querySelector("#newCalendarButton"),
  adminCount: document.querySelector("#adminCount"),
  pendingCount: document.querySelector("#pendingCount"),
  peopleList: document.querySelector("#peopleList"),
  peoplePanel: document.querySelector("#peoplePanel"),
  invitesPanel: document.querySelector("#invitesPanel"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteCode: document.querySelector("#inviteCode"),
  inviteMaxUses: document.querySelector("#inviteMaxUses"),
  inviteExpiry: document.querySelector("#inviteExpiry"),
  inviteCount: document.querySelector("#inviteCount"),
  inviteList: document.querySelector("#inviteList"),
  authDialog: document.querySelector("#authDialog"),
  authClose: document.querySelector("#authClose"),
  authTitle: document.querySelector("#authTitle"),
  authStatus: document.querySelector("#authStatus"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  registerNote: document.querySelector("#registerNote"),
  authTabs: document.querySelector(".auth-tabs"),
  accountPanel: document.querySelector("#accountPanel"),
  accountPanelAvatar: document.querySelector("#accountPanelAvatar"),
  accountPanelName: document.querySelector("#accountPanelName"),
  accountPanelUsername: document.querySelector("#accountPanelUsername"),
  accountPanelRole: document.querySelector("#accountPanelRole"),
  logoutButton: document.querySelector("#logoutButton"),
  toastRegion: document.querySelector("#toastRegion")
};

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

let state = createDefaultState();
let currentUser = null;
let currentView = "builder";
let activeCalendarId = null;
let currentLinks = null;
let savedPlanTimer = 0;
let dragState = null;
let calendars = [];
let adminUsers = [];
let invites = [];

const ERROR_MESSAGES = {
  invalid_credentials: "用户名或密码不正确",
  username_exists: "这个用户名已经注册",
  invalid_username: "用户名需为 3–24 位，可使用文字、数字、下划线或短横线",
  invalid_password: "密码需为 8–128 位",
  invalid_nickname: "请输入昵称",
  invalid_invite: "邀请码无效或已过期",
  invalid_invite_code: "邀请码格式不正确",
  account_pending: "账号仍在等待管理员审批",
  account_rejected: "注册申请未通过",
  account_disabled: "账号已停用",
  authentication_required: "请先登录",
  admin_required: "需要管理员权限",
  calendar_limit: "已达到周期数量上限",
  calendar_not_found: "这个周期不存在",
  invite_exists: "邀请码已存在",
  invalid_expiry: "有效期必须晚于现在",
  last_admin: "至少需要保留一名管理员",
  cannot_modify_self: "不能在这里修改自己的管理员状态",
  signing_secret_missing: "服务端签名尚未配置",
  database_not_configured: "数据库尚未配置"
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ""}</svg>`;
}

function hydrateStaticIcons() {
  for (const node of document.querySelectorAll("[data-icon]")) {
    node.innerHTML = icon(node.dataset.icon, 18);
  }
}

function makeId() {
  return crypto.randomUUID?.() ?? `shift-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeShift(preset = PRESETS.day) {
  return {
    id: makeId(),
    kind: preset.kind,
    name: preset.name,
    start: preset.start,
    end: preset.end,
    tone: preset.tone
  };
}

function createDefaultState() {
  const cycle = [
    makeShift(PRESETS.day),
    makeShift(PRESETS.day),
    makeShift(PRESETS.night),
    makeShift(PRESETS.night),
    makeShift(PRESETS.off),
    makeShift(PRESETS.off)
  ];
  return {
    title: "轮转班表",
    includeRest: false,
    cycle,
    todayId: cycle[0].id
  };
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function normalizeClientPlan(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid plan");
  const sourceCycle = raw.c ?? raw.cycle;
  if (!Array.isArray(sourceCycle) || sourceCycle.length === 0 || sourceCycle.length > 35) {
    throw new Error("invalid cycle");
  }

  const cycle = sourceCycle.map((source, index) => {
    const item = Array.isArray(source)
      ? { kind: source[0], name: source[1], start: source[2], end: source[3], tone: source[4] }
      : source;
    const kindValue = String(item?.k ?? item?.kind ?? "w");
    const kind = kindValue === "off" || kindValue === "o" ? "off" : "work";
    const toneValue = String(item?.o ?? item?.tone ?? (kind === "off" ? "sage" : "sky"));
    return {
      id: makeId(),
      kind,
      name: cleanText(item?.n ?? item?.name, 28) || (kind === "off" ? "休息" : `班次 ${index + 1}`),
      start: cleanTime(item?.a ?? item?.start, kind === "off" ? "00:00" : "09:00"),
      end: cleanTime(item?.b ?? item?.end, kind === "off" ? "00:00" : "18:00"),
      tone: TONE_ORDER.includes(toneValue) ? toneValue : "sky"
    };
  });

  const sourceToday = Number(raw.i ?? raw.todayIndex ?? 0);
  const todayIndex =
    Number.isInteger(sourceToday) && sourceToday >= 0 && sourceToday < cycle.length ? sourceToday : 0;

  return {
    title: cleanText(raw.t ?? raw.title, 64) || "轮转班表",
    includeRest: Boolean(raw.r ?? raw.includeRest),
    cycle,
    todayId: cycle[todayIndex].id
  };
}

function compactPlan() {
  return {
    v: 2,
    t: state.title,
    z: TIMEZONE,
    r: state.includeRest ? 1 : 0,
    i: getTodayIndex(),
    c: state.cycle.map((item) => [
      item.kind === "off" ? "o" : "w",
      item.name,
      item.start,
      item.end,
      item.tone
    ])
  };
}

function getTodayIndex() {
  const index = state.cycle.findIndex((shift) => shift.id === state.todayId);
  return index < 0 ? 0 : index;
}

function getTodayShift() {
  return state.cycle[getTodayIndex()] ?? state.cycle[0];
}

function todayParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function todayISODate() {
  const value = todayParts();
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(value, days) {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addMonths(value, months) {
  const date = parseISODate(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - parseISODate(start).getTime()) / 86400000));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parseISODate(value));
}

function coverageMonths() {
  return currentUser ? 12 : 3;
}

function formatRange() {
  const start = todayISODate();
  const end = addMonths(start, coverageMonths());
  return `${formatDate(start)}至${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(end)}`;
}

function shiftTimeLabel(shift) {
  if (shift.kind === "off") return "全天";
  const overnight = toMinutes(shift.end) <= toMinutes(shift.start);
  return `${shift.start}–${overnight ? "次日 " : ""}${shift.end}`;
}

function toMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function shiftIcon(shift) {
  if (shift.kind === "off") return "coffee";
  if (toMinutes(shift.end) <= toMinutes(shift.start) || toMinutes(shift.start) >= 17 * 60) {
    return "moon";
  }
  return "sun";
}

function renderPresets() {
  elements.presetRow.innerHTML = Object.entries(PRESETS)
    .map(
      ([key, preset]) => `
        <button class="preset-button tone-${preset.tone}" type="button" data-preset="${key}">
          <span class="preset-glyph">${icon(preset.icon, 16)}</span>
          <span class="preset-copy">
            <strong>${escapeHTML(preset.name)}</strong>
            <small>${preset.kind === "off" ? "全天" : `${preset.start}–${preset.end}`}</small>
          </span>
        </button>
      `
    )
    .join("");
}

function renderCycle(options = {}) {
  elements.cycleList.innerHTML = state.cycle
    .map((shift, index) => {
      const hasError =
        shift.kind === "work" &&
        (shift.start === shift.end || !shift.name.trim());
      const isToday = shift.id === state.todayId;
      return `
        <article
          class="cycle-item tone-${shift.tone}${shift.kind === "off" ? " is-off" : ""}${hasError ? " has-error" : ""}${isToday ? " is-today" : ""}"
          data-id="${shift.id}"
          data-index="${index}"
        >
          <button
            class="drag-handle"
            type="button"
            aria-label="拖动第 ${index + 1} 天排序，按上下方向键移动"
            title="拖动排序"
          >
            ${icon("grip", 15)}
          </button>
          <button
            class="day-number"
            type="button"
            data-action="today"
            aria-label="将第 ${index + 1} 天设为今天"
            aria-pressed="${isToday}"
            title="设为今天"
          >${isToday ? "今" : String(index + 1).padStart(2, "0")}</button>

          <div class="shift-identity">
            <button
              class="color-dot"
              type="button"
              data-action="color"
              aria-label="更换颜色，当前${TONE_NAMES[shift.tone]}"
              title="更换颜色"
            ></button>
            <input
              class="shift-name"
              type="text"
              value="${escapeHTML(shift.name)}"
              maxlength="28"
              data-field="name"
              aria-label="第 ${index + 1} 天班次名称"
              autocomplete="off"
            />
            <div class="kind-control" role="group" aria-label="第 ${index + 1} 天类型">
              <button
                type="button"
                data-action="kind"
                data-kind="work"
                aria-pressed="${shift.kind === "work"}"
              >工作</button>
              <button
                type="button"
                data-action="kind"
                data-kind="off"
                aria-pressed="${shift.kind === "off"}"
              >休息</button>
            </div>
          </div>

          <div class="time-fields">
            <label class="time-input">
              <span>开始</span>
              <input
                type="time"
                value="${shift.start}"
                data-field="start"
                aria-label="第 ${index + 1} 天开始时间"
              />
            </label>
            <span class="time-arrow" aria-hidden="true">→</span>
            <label class="time-input">
              <span>结束</span>
              <input
                type="time"
                value="${shift.end}"
                data-field="end"
                aria-label="第 ${index + 1} 天结束时间"
              />
            </label>
          </div>
          <span class="off-label">全天休息，不占用日历时间</span>

          <button class="remove-button" type="button" data-action="remove" aria-label="删除第 ${index + 1} 天">
            ${icon("trash", 15)}
          </button>
        </article>
      `;
    })
    .join("");

  if (options.animateId) animateNewRow(options.animateId);
}

function animateNewRow(id) {
  if (reduceMotionQuery.matches) return;
  requestAnimationFrame(() => {
    const row = [...elements.cycleList.children].find((item) => item.dataset.id === id);
    if (!row) return;
    row.animate(
      [
        { opacity: 0.2, transform: "translateY(10px) scale(0.985)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ],
      { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  });
}

function syncFieldValues() {
  elements.title.value = state.title;
  elements.includeRest.checked = state.includeRest;
}

function renderMeta() {
  const workCount = state.cycle.filter((shift) => shift.kind === "work").length;
  elements.cycleMeta.textContent = `${state.cycle.length} 天循环 · ${workCount} 个班次`;
  elements.cycleLengthLabel.textContent = `${state.cycle.length} 天`;

  const today = getTodayShift();
  elements.todayShiftName.textContent = today?.name || "未设置";
  elements.todayShiftTime.textContent = today ? shiftTimeLabel(today) : "";
}

function renderSequence() {
  const visible = state.cycle.slice(0, 10);
  const remaining = state.cycle.length - visible.length;
  const todayIndex = getTodayIndex();
  const chips = visible
    .map(
      (shift, index) => `
        <div
          class="sequence-chip tone-${shift.tone}${index === todayIndex ? " is-today" : ""}"
          data-kind="${shift.kind}"
          title="${escapeHTML(shift.name)}${index === todayIndex ? " · 今天" : ""}"
        >
          ${String(index + 1).padStart(2, "0")}
        </div>
      `
    )
    .join("");
  const more = remaining > 0 ? `<div class="sequence-more">+${remaining}</div>` : "";
  elements.sequenceTrack.innerHTML = chips + more;
}

function renderSchedule() {
  const startDate = todayISODate();
  const totalDays = daysBetween(startDate, addMonths(startDate, coverageMonths()));
  const todayIndex = getTodayIndex();
  let eventCount = 0;

  for (let offset = 0; offset < totalDays; offset += 1) {
    const shift = state.cycle[(todayIndex + offset) % state.cycle.length];
    if (shift.kind === "work" || state.includeRest) eventCount += 1;
  }

  const rows = [];
  for (let offset = 0; offset < 8; offset += 1) {
    const dateValue = addDays(startDate, offset);
    const date = parseISODate(dateValue);
    const shift = state.cycle[(todayIndex + offset) % state.cycle.length];
    rows.push(`
      <div class="schedule-row tone-${shift.tone}">
        <span class="schedule-date">${formatShortDate(date)} ${formatWeekday(date)}</span>
        <span class="schedule-tone" aria-hidden="true"></span>
        <span class="schedule-name">${escapeHTML(shift.name)}${offset === 0 ? " · 今天" : ""}</span>
        <span class="schedule-time">${escapeHTML(shiftTimeLabel(shift))}</span>
      </div>
    `);
  }

  elements.scheduleList.innerHTML = rows.join("");
  elements.eventEstimate.textContent = `${eventCount} 个事件`;
  elements.rangeCopy.textContent = `从今天起 · ${formatRange()}`;
}

function getValidationErrors() {
  const errors = [];
  if (!state.title.trim()) errors.push("日历名称不能为空");
  if (!state.cycle.length) errors.push("至少需要一个班次");
  for (const [index, shift] of state.cycle.entries()) {
    if (!shift.name.trim()) errors.push(`第 ${index + 1} 天缺少名称`);
    if (shift.kind === "work" && shift.start === shift.end) {
      errors.push(`第 ${index + 1} 天的开始和结束时间相同`);
    }
  }
  if (!state.cycle.some((shift) => shift.id === state.todayId)) {
    errors.push("需要选择一个今天的班次");
  }
  return errors;
}

function updateActionLabels() {
  const months = coverageMonths();
  elements.coverageBadge.textContent = `${months} 个月`;
  elements.saveCalendar.hidden = !currentUser;
  elements.saveCalendarLabel.textContent = activeCalendarId ? "保存当前修改" : "保存周期";

  if (!currentUser) {
    elements.primaryActionLabel.textContent = "复制 3 个月订阅链接";
    elements.privacyNote.textContent =
      "游客链接由服务端签名，最多覆盖未来 3 个月。班次信息不包含账户或个人资料。";
  } else {
    elements.primaryActionLabel.textContent =
      activeCalendarId ? "更新并复制 1 年订阅链接" : "保存并复制 1 年订阅链接";
    elements.privacyNote.textContent =
      "订阅地址保存在你的周期列表中，固定覆盖未来 12 个月。你可以创建多个独立周期链接。";
  }
}

function updateValidation() {
  const errors = getValidationErrors();
  const valid = errors.length === 0;
  elements.validityBadge.classList.toggle("is-invalid", !valid);
  elements.validityBadge.innerHTML = `${icon(valid ? "check" : "alert", 12)}<span>${valid ? "准备就绪" : "需要调整"}</span>`;
  elements.validityBadge.title = valid ? "" : errors[0];
  elements.copyLink.disabled = !valid;
  elements.saveCalendar.disabled = !valid;
  elements.downloadIcs.disabled = !valid;
  elements.openCalendar.disabled = !valid;
  elements.copyLinkIcon.disabled = !valid || !currentLinks;
  updateActionLabels();
  return valid;
}

function updateRowErrors() {
  for (const row of elements.cycleList.children) {
    const index = Number(row.dataset.index);
    const shift = state.cycle[index];
    const hasError =
      shift &&
      shift.kind === "work" &&
      (shift.start === shift.end || !shift.name.trim());
    row.classList.toggle("has-error", Boolean(hasError));
  }
}

function updateTone(row, tone) {
  for (const className of [...row.classList]) {
    if (className.startsWith("tone-")) row.classList.remove(className);
  }
  row.classList.add(`tone-${tone}`);
}

function renderPreview() {
  renderMeta();
  renderSequence();
  renderSchedule();
  updateValidation();
}

function invalidateLinks() {
  currentLinks = null;
  elements.linkText.textContent = currentUser ? "保存周期后生成链接" : "生成后显示日历链接";
  elements.copyLinkIcon.disabled = true;
  updateValidation();
  scheduleSave();
}

function updateAllPreview() {
  renderPreview();
  updateRowErrors();
  invalidateLinks();
}

function scheduleSave() {
  window.clearTimeout(savedPlanTimer);
  savedPlanTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The generator remains usable when storage is unavailable.
    }
  }, 120);
}

function addShift(preset, options = {}) {
  if (state.cycle.length >= 35) {
    showToast("一个周期最多包含 35 天", "error");
    return;
  }
  const shift = makeShift(preset);
  state.cycle.push(shift);
  renderCycle({ animateId: shift.id });
  updateAllPreview();
  requestAnimationFrame(() => {
    const row = [...elements.cycleList.children].find((item) => item.dataset.id === shift.id);
    row?.scrollIntoView({
      block: "nearest",
      behavior: reduceMotionQuery.matches ? "auto" : "smooth"
    });
    if (options.focus) {
      row?.querySelector(".shift-name")?.focus();
      row?.querySelector(".shift-name")?.select();
    }
  });
}

function removeShift(id) {
  if (state.cycle.length <= 1) {
    showToast("至少保留一个班次", "error");
    return;
  }
  const index = state.cycle.findIndex((shift) => shift.id === id);
  state.cycle = state.cycle.filter((shift) => shift.id !== id);
  if (state.todayId === id) {
    const nextIndex = Math.max(0, Math.min(index - 1, state.cycle.length - 1));
    state.todayId = state.cycle[nextIndex].id;
  }
  renderCycle();
  updateAllPreview();
}

function setToday(id) {
  if (!state.cycle.some((shift) => shift.id === id)) return;
  state.todayId = id;
  renderCycle();
  updateAllPreview();
  navigator.vibrate?.(6);
}

function changeKind(row, id, kind) {
  const shift = state.cycle.find((item) => item.id === id);
  if (!shift || shift.kind === kind) return;

  if (kind === "off") {
    shift.kind = "off";
    shift.name = "休息";
    shift.start = "00:00";
    shift.end = "00:00";
    shift.tone = "sage";
  } else {
    shift.kind = "work";
    shift.name = "白班";
    shift.start = "08:00";
    shift.end = "20:00";
    shift.tone = "sky";
  }

  renderCycle();
  updateAllPreview();
}

function changeTone(row, id) {
  const shift = state.cycle.find((item) => item.id === id);
  if (!shift) return;
  const currentIndex = TONE_ORDER.indexOf(shift.tone);
  shift.tone = TONE_ORDER[(currentIndex + 1) % TONE_ORDER.length];
  updateTone(row, shift.tone);
  row.querySelector(".color-dot")?.setAttribute("aria-label", `更换颜色，当前${TONE_NAMES[shift.tone]}`);
  updateAllPreview();
}

function captureRows() {
  return new Map(
    [...elements.cycleList.children].map((row) => [row.dataset.id, row.getBoundingClientRect()])
  );
}

function playFlip(beforeRects) {
  if (reduceMotionQuery.matches) return;
  requestAnimationFrame(() => {
    for (const row of elements.cycleList.children) {
      const before = beforeRects.get(row.dataset.id);
      if (!before) continue;
      const after = row.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 1) continue;
      row.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
  });
}

function moveShift(fromIndex, insertionIndex) {
  const before = captureRows();
  const [shift] = state.cycle.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  state.cycle.splice(Math.max(0, Math.min(adjustedIndex, state.cycle.length)), 0, shift);
  renderCycle();
  playFlip(before);
  updateAllPreview();
}

function clearDropIndicators() {
  for (const row of elements.cycleList.children) {
    row.classList.remove("is-drop-before", "is-drop-after");
  }
}

function startDrag(event, handle) {
  if (event.button !== 0) return;
  const row = handle.closest(".cycle-item");
  const index = Number(row.dataset.index);
  dragState = {
    pointerId: event.pointerId,
    handle,
    row,
    fromIndex: index,
    startY: event.clientY,
    moved: false,
    insertionIndex: index
  };
  handle.setPointerCapture(event.pointerId);
}

function onDragMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const deltaY = event.clientY - dragState.startY;
  if (!dragState.moved && Math.abs(deltaY) < 6) return;

  if (!dragState.moved) {
    dragState.moved = true;
    dragState.row.classList.add("is-dragging");
  }

  event.preventDefault();
  dragState.row.style.transform = `translateY(${deltaY}px)`;
  clearDropIndicators();

  const siblings = [...elements.cycleList.children].filter((row) => row !== dragState.row);
  let insertionIndex = state.cycle.length;
  let targetRow = siblings.at(-1) ?? null;
  let targetBefore = false;

  for (const row of siblings) {
    const rect = row.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      insertionIndex = Number(row.dataset.index);
      targetRow = row;
      targetBefore = true;
      break;
    }
  }

  dragState.insertionIndex = insertionIndex;
  targetRow?.classList.add(targetBefore ? "is-drop-before" : "is-drop-after");
}

function finishDrag(event, cancelled = false) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const drag = dragState;
  dragState = null;
  clearDropIndicators();

  if (drag.handle.hasPointerCapture?.(event.pointerId)) {
    drag.handle.releasePointerCapture(event.pointerId);
  }
  if (!drag.moved) return;

  drag.row.classList.remove("is-dragging");
  drag.row.style.transform = "";

  if (cancelled || drag.insertionIndex === drag.fromIndex) {
    if (!reduceMotionQuery.matches) {
      drag.row.animate(
        [
          { transform: `translateY(${event.clientY - drag.startY}px)` },
          { transform: "translateY(0)" }
        ],
        { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
    return;
  }

  moveShift(drag.fromIndex, drag.insertionIndex);
  navigator.vibrate?.(8);
}

function onHandleKeyDown(event) {
  const handle = event.target.closest(".drag-handle");
  if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;

  const row = handle.closest(".cycle-item");
  const index = Number(row.dataset.index);
  const direction = event.key === "ArrowUp" ? -1 : 1;
  const target = index + direction;
  if (target < 0 || target >= state.cycle.length) return;

  event.preventDefault();
  const id = row.dataset.id;
  const before = captureRows();
  [state.cycle[index], state.cycle[target]] = [state.cycle[target], state.cycle[index]];
  renderCycle();
  playFlip(before);
  updateAllPreview();
  requestAnimationFrame(() => {
    const nextRow = [...elements.cycleList.children].find((item) => item.dataset.id === id);
    nextRow?.querySelector(".drag-handle")?.focus();
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.error || "request_failed");
  }
  return data;
}

function errorMessage(error) {
  return ERROR_MESSAGES[error?.message] || "操作没有完成，请重试";
}

function applyUserUI() {
  const loggedIn = Boolean(currentUser);
  elements.navCalendars.hidden = !loggedIn;
  elements.navAdmin.hidden = currentUser?.role !== "admin";
  elements.inlineAuthButton.hidden = loggedIn;
  elements.accountName.textContent = currentUser?.nickname || "登录";
  elements.accountRole.textContent = currentUser
    ? currentUser.role === "admin"
      ? "管理员"
      : "成员"
    : "游客";
  elements.accountAvatar.innerHTML = loggedIn
    ? escapeHTML(currentUser.nickname.trim().slice(0, 1).toUpperCase())
    : icon("user", 15);

  elements.accountStripText.textContent = loggedIn
    ? `${currentUser.nickname} · 订阅覆盖未来 12 个月`
    : "游客订阅覆盖未来 3 个月";
  renderPreview();

  if (!loggedIn && currentView !== "builder") {
    showView("builder");
  }
}

async function refreshSession() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  applyUserUI();
}

function setAuthTab(tab) {
  for (const button of elements.authTabs.querySelectorAll("[data-auth-tab]")) {
    const active = button.dataset.authTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  elements.loginForm.hidden = tab !== "login";
  elements.registerForm.hidden = tab !== "register";
  elements.authTitle.textContent = tab === "login" ? "登录" : "注册";
  setAuthStatus("");
}

function openAuthDialog(tab = "login") {
  elements.accountPanel.hidden = true;
  elements.authTabs.hidden = false;
  setAuthTab(tab);
  if (!elements.authDialog.open) elements.authDialog.showModal();
}

function openAccountDialog() {
  if (!currentUser) {
    openAuthDialog("login");
    return;
  }
  elements.authTabs.hidden = true;
  elements.loginForm.hidden = true;
  elements.registerForm.hidden = true;
  elements.accountPanel.hidden = false;
  elements.authTitle.textContent = "账户";
  setAuthStatus("");
  elements.accountPanelAvatar.textContent = currentUser.nickname.trim().slice(0, 1).toUpperCase();
  elements.accountPanelName.textContent = currentUser.nickname;
  elements.accountPanelUsername.textContent = `@${currentUser.username}`;
  elements.accountPanelRole.textContent = currentUser.role === "admin" ? "管理员" : "成员";
  elements.accountPanelRole.dataset.status = "approved";
  if (!elements.authDialog.open) elements.authDialog.showModal();
}

function setAuthStatus(message, isError = false) {
  elements.authStatus.textContent = message;
  elements.authStatus.classList.toggle("is-error", isError);
}

function closeAuthDialog() {
  if (elements.authDialog.open) elements.authDialog.close();
  setAuthStatus("");
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(elements.loginForm);
  const button = elements.loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  setAuthStatus("正在登录…");
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    currentUser = data.user;
    currentLinks = null;
    applyUserUI();
    invalidateLinks();
    closeAuthDialog();
    elements.loginForm.reset();
    showToast("已登录");
  } catch (error) {
    setAuthStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = new FormData(elements.registerForm);
  const button = elements.registerForm.querySelector("button[type='submit']");
  button.disabled = true;
  setAuthStatus("正在提交…");
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        nickname: form.get("nickname"),
        password: form.get("password"),
        inviteCode: form.get("inviteCode")
      })
    });

    if (data.user?.status === "approved") {
      currentUser = data.user;
      currentLinks = null;
      applyUserUI();
      invalidateLinks();
      closeAuthDialog();
      elements.registerForm.reset();
      showToast(data.bootstrap ? "管理员账号已创建" : "注册成功");
    } else {
      setAuthStatus("注册申请已提交，等待管理员审批。");
      elements.registerForm.reset();
    }
  } catch (error) {
    setAuthStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Clear the local session state even if the server is unavailable.
  }
  currentUser = null;
  calendars = [];
  activeCalendarId = null;
  currentLinks = null;
  applyUserUI();
  closeAuthDialog();
  showView("builder");
  showToast("已退出登录");
}

function absoluteUrl(path) {
  return new URL(path, window.location.origin).href;
}

function buildLinks(path, months) {
  const ics = absoluteUrl(path);
  return {
    ics,
    download: `${ics}${ics.includes("?") ? "&" : "?"}download=1`,
    webcal: ics.replace(/^https?:/, "webcal:"),
    months
  };
}

async function persistCalendar() {
  if (!currentUser) throw new Error("authentication_required");
  const payload = {
    title: state.title,
    plan: compactPlan()
  };
  const data = activeCalendarId
    ? await api(`/api/calendars/${activeCalendarId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      })
    : await api("/api/calendars", {
        method: "POST",
        body: JSON.stringify(payload)
      });

  activeCalendarId = data.calendar.id;
  currentLinks = buildLinks(data.calendar.subscriptionPath, 12);
  elements.linkText.textContent = `${window.location.host}${data.calendar.subscriptionPath}`;
  elements.copyLinkIcon.disabled = false;
  updateActionLabels();
  await refreshCalendars({ quiet: true });
  return currentLinks;
}

async function ensureLinks() {
  if (!updateValidation()) throw new Error(getValidationErrors()[0]);
  if (currentLinks) return currentLinks;

  if (currentUser) return persistCalendar();

  const data = await api("/api/guest-link", {
    method: "POST",
    body: JSON.stringify({ plan: compactPlan() })
  });
  currentLinks = buildLinks(data.path, data.months);
  elements.linkText.textContent = `${window.location.host}/api/guest.ics · 已签名`;
  elements.copyLinkIcon.disabled = false;
  return currentLinks;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("copy_failed");
}

async function copySubscriptionLink() {
  try {
    const links = await ensureLinks();
    await copyText(links.ics);
    showToast(currentUser ? "1 年订阅链接已复制" : "3 个月订阅链接已复制");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function downloadCalendar() {
  try {
    const links = await ensureLinks();
    window.location.href = links.download;
    showToast("正在下载日历文件");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function openCalendarApp() {
  try {
    const links = await ensureLinks();
    window.location.href = links.webcal;
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function saveCurrentCalendar() {
  if (!currentUser) {
    openAuthDialog("login");
    return;
  }
  try {
    await persistCalendar();
    showToast(activeCalendarId ? "周期已保存" : "周期已创建");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function calendarSequence(plan) {
  const source = plan?.c ?? plan?.cycle ?? [];
  return source
    .slice(0, 12)
    .map((item) => {
      const tone = Array.isArray(item) ? item[4] : item?.tone;
      return `<span class="tone-${TONE_ORDER.includes(tone) ? tone : "sky"}"></span>`;
    })
    .join("");
}

function renderCalendarList() {
  if (!calendars.length) {
    elements.calendarList.innerHTML = `
      <div class="empty-state">
        <strong>还没有保存的周期</strong>
        <p>新建周期后会出现在这里。</p>
      </div>
    `;
    return;
  }

  elements.calendarList.innerHTML = calendars
    .map((calendar) => {
      const cycleLength = calendar.plan?.c?.length ?? calendar.plan?.cycle?.length ?? 0;
      const updated = new Date(calendar.updatedAt);
      const updatedCopy = new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric"
      }).format(updated);
      return `
        <article class="calendar-row" data-id="${calendar.id}">
          <div class="calendar-row-copy">
            <h3>${escapeHTML(calendar.title)}</h3>
            <div class="calendar-row-meta">
              <span>${cycleLength} 天循环</span>
              <span>12 个月</span>
              <span>更新于 ${updatedCopy}</span>
              <span class="calendar-sequence" aria-hidden="true">${calendarSequence(calendar.plan)}</span>
            </div>
          </div>
          <div class="calendar-row-actions">
            <button class="row-action" type="button" data-calendar-action="copy" data-id="${calendar.id}" aria-label="复制订阅链接" title="复制订阅链接">${icon("copy", 15)}</button>
            <button class="row-action" type="button" data-calendar-action="edit" data-id="${calendar.id}" aria-label="编辑周期" title="编辑周期">${icon("edit", 15)}</button>
            <button class="row-action is-danger" type="button" data-calendar-action="delete" data-id="${calendar.id}" aria-label="删除周期" title="删除周期">${icon("trash", 15)}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshCalendars(options = {}) {
  if (!currentUser) {
    calendars = [];
    renderCalendarList();
    return;
  }
  try {
    const data = await api("/api/calendars");
    calendars = data.calendars || [];
    renderCalendarList();
  } catch (error) {
    if (!options.quiet) showToast(errorMessage(error), "error");
  }
}

function loadCalendarIntoBuilder(calendar) {
  state = normalizeClientPlan(calendar.plan);
  state.title = calendar.title;
  activeCalendarId = calendar.id;
  currentLinks = buildLinks(calendar.subscriptionPath, 12);
  syncFieldValues();
  renderCycle();
  renderPreview();
  elements.linkText.textContent = `${window.location.host}${calendar.subscriptionPath}`;
  elements.copyLinkIcon.disabled = false;
  showView("builder");
}

function startNewCalendar() {
  state = createDefaultState();
  activeCalendarId = null;
  currentLinks = null;
  syncFieldValues();
  renderCycle();
  renderPreview();
  showView("builder");
  document.querySelector(".editor-heading")?.scrollIntoView({
    block: "start",
    behavior: reduceMotionQuery.matches ? "auto" : "smooth"
  });
}

async function copyCalendarLink(calendar) {
  try {
    await copyText(absoluteUrl(calendar.subscriptionPath));
    showToast("订阅链接已复制");
  } catch {
    showToast("复制失败，请重试", "error");
  }
}

async function deleteSavedCalendar(calendar) {
  if (!window.confirm(`删除“${calendar.title}”？订阅链接会立即失效。`)) return;
  try {
    await api(`/api/calendars/${calendar.id}`, { method: "DELETE" });
    if (activeCalendarId === calendar.id) {
      activeCalendarId = null;
      currentLinks = null;
    }
    await refreshCalendars({ quiet: true });
    showToast("周期已删除");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function renderPeople() {
  const pending = adminUsers.filter((user) => user.status === "pending").length;
  elements.adminCount.textContent = `${adminUsers.length} 位成员`;
  elements.pendingCount.textContent = `${pending} 个待审批`;

  if (!adminUsers.length) {
    elements.peopleList.innerHTML = '<div class="empty-state"><strong>暂无成员</strong></div>';
    return;
  }

  const statusLabels = {
    pending: "待审批",
    approved: "已通过",
    rejected: "已拒绝",
    disabled: "已停用"
  };

  elements.peopleList.innerHTML = adminUsers
    .map((user) => {
      const isSelf = user.id === currentUser?.id;
      const actions = [];
      if (!isSelf) {
        if (user.status === "pending") {
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="approved">批准</button>`);
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="rejected">拒绝</button>`);
        } else if (user.status === "approved") {
          actions.push(`<button type="button" data-admin-action="role" data-id="${user.id}" data-role="${user.role === "admin" ? "user" : "admin"}">${user.role === "admin" ? "设为成员" : "设为管理员"}</button>`);
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="disabled">停用</button>`);
        } else {
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="approved">恢复</button>`);
        }
      }

      return `
        <article class="person-row">
          <div class="person-copy">
            <strong>${escapeHTML(user.nickname)}${isSelf ? " · 你" : ""}</strong>
            <span>@${escapeHTML(user.username)}${user.inviteCode ? ` · ${escapeHTML(user.inviteCode)}` : ""}</span>
          </div>
          <div class="person-stats">
            <span>${user.role === "admin" ? "管理员" : "成员"}</span>
            <span>${user.calendarCount} 个周期</span>
          </div>
          <span class="status-pill" data-status="${user.status}">${statusLabels[user.status]}</span>
          <div class="person-actions">${actions.join("")}</div>
        </article>
      `;
    })
    .join("");
}

function inviteState(invite) {
  if (invite.disabled) return "已停用";
  if (invite.uses >= invite.maxUses) return "已用完";
  if (invite.expiresAt && invite.expiresAt * 1000 <= Date.now()) return "已过期";
  return "可使用";
}

function renderInvites() {
  elements.inviteCount.textContent = `${invites.length} 个`;
  if (!invites.length) {
    elements.inviteList.innerHTML = '<div class="empty-state"><strong>暂无邀请码</strong></div>';
    return;
  }

  elements.inviteList.innerHTML = invites
    .map((invite) => {
      const stateLabel = inviteState(invite);
      const expiry = invite.expiresAt
        ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(
            new Date(invite.expiresAt * 1000)
          )
        : "长期";
      return `
        <article class="invite-row">
          <div class="invite-code">
            <strong>${escapeHTML(invite.code)}</strong>
            <button class="invite-copy" type="button" data-invite-action="copy" data-code="${escapeHTML(invite.code)}" aria-label="复制邀请码">${icon("copy", 13)}</button>
          </div>
          <div class="invite-row-actions">
            <span class="status-pill" data-status="${stateLabel === "可使用" ? "approved" : "disabled"}">${stateLabel}</span>
            ${
              stateLabel === "可使用"
                ? `<button class="row-action is-danger" type="button" data-invite-action="disable" data-id="${invite.id}" aria-label="停用邀请码">${icon("close", 14)}</button>`
                : ""
            }
          </div>
          <div class="invite-meta">
            <span>${invite.uses}/${invite.maxUses} 次 · ${expiry} · ${escapeHTML(invite.creatorName)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadAdminData() {
  if (currentUser?.role !== "admin") return;
  try {
    const [userData, inviteData] = await Promise.all([
      api("/api/admin/users"),
      api("/api/admin/invites")
    ]);
    adminUsers = userData.users || [];
    invites = inviteData.invites || [];
    renderPeople();
    renderInvites();
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function updateAdminUser(userId, payload) {
  try {
    await api(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await loadAdminData();
    showToast("成员状态已更新");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function submitInvite(event) {
  event.preventDefault();
  const button = elements.inviteForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const expiry = elements.inviteExpiry.value
      ? new Date(`${elements.inviteExpiry.value}T23:59:59+08:00`).toISOString()
      : null;
    await api("/api/admin/invites", {
      method: "POST",
      body: JSON.stringify({
        code: elements.inviteCode.value,
        maxUses: Number(elements.inviteMaxUses.value) || 1,
        expiresAt: expiry
      })
    });
    elements.inviteForm.reset();
    elements.inviteMaxUses.value = 1;
    elements.inviteExpiry.value = addDays(todayISODate(), 7);
    await loadAdminData();
    showToast("邀请码已生成");
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

function showAdminTab(tab) {
  for (const button of document.querySelectorAll("[data-admin-tab]")) {
    const active = button.dataset.adminTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  elements.peoplePanel.hidden = tab !== "people";
  elements.invitesPanel.hidden = tab !== "invites";
}

function showView(view) {
  currentView = view;
  elements.builderView.hidden = view !== "builder";
  elements.calendarsView.hidden = view !== "calendars";
  elements.adminView.hidden = view !== "admin";
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }

  if (view === "calendars") refreshCalendars();
  if (view === "admin") loadAdminData();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.innerHTML = `${icon(type === "error" ? "alert" : "check", 15)}<span></span>`;
  toast.querySelector("span").textContent = message;
  elements.toastRegion.append(toast);

  if (!reduceMotionQuery.matches) {
    toast.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.985)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ],
      { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }

  window.setTimeout(() => {
    const animation = toast.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(8px)" }
      ],
      { duration: reduceMotionQuery.matches ? 1 : 180, easing: "ease-out", fill: "forwards" }
    );
    animation.finished.finally(() => toast.remove());
  }, 3200);
}

function loadStoredPlan() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeClientPlan(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }

  for (const link of document.querySelectorAll("[data-nav='builder']")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView("builder");
    });
  }

  elements.title.addEventListener("input", () => {
    state.title = elements.title.value.slice(0, 64);
    updateAllPreview();
  });

  elements.includeRest.addEventListener("change", () => {
    state.includeRest = elements.includeRest.checked;
    updateAllPreview();
  });

  elements.presetRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) addShift(PRESETS[button.dataset.preset]);
  });

  elements.addCustom.addEventListener("click", () => {
    addShift(
      {
        kind: "work",
        name: "自定义班次",
        start: "09:00",
        end: "18:00",
        tone: "coral"
      },
      { focus: !coarsePointerQuery.matches }
    );
  });

  elements.cycleList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const row = action.closest(".cycle-item");
    if (!row) return;
    const id = row.dataset.id;
    if (action.dataset.action === "remove") removeShift(id);
    if (action.dataset.action === "color") changeTone(row, id);
    if (action.dataset.action === "kind") changeKind(row, id, action.dataset.kind);
    if (action.dataset.action === "today") setToday(id);
  });

  elements.cycleList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const row = input.closest(".cycle-item");
    const shift = state.cycle.find((item) => item.id === row.dataset.id);
    if (!shift) return;
    shift[input.dataset.field] = input.value;
    updateAllPreview();
  });

  elements.cycleList.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (handle) startDrag(event, handle);
  });

  elements.cycleList.addEventListener("keydown", onHandleKeyDown);
  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", (event) => finishDrag(event, false));
  window.addEventListener("pointercancel", (event) => finishDrag(event, true));

  elements.copyLink.addEventListener("click", copySubscriptionLink);
  elements.copyLinkIcon.addEventListener("click", copySubscriptionLink);
  elements.downloadIcs.addEventListener("click", downloadCalendar);
  elements.openCalendar.addEventListener("click", openCalendarApp);
  elements.saveCalendar.addEventListener("click", saveCurrentCalendar);

  elements.authButton.addEventListener("click", () => {
    if (currentUser) openAccountDialog();
    else openAuthDialog("login");
  });
  elements.inlineAuthButton.addEventListener("click", () => openAuthDialog("register"));
  elements.authClose.addEventListener("click", closeAuthDialog);
  elements.authDialog.addEventListener("click", (event) => {
    if (event.target === elements.authDialog) closeAuthDialog();
  });
  for (const button of elements.authTabs.querySelectorAll("[data-auth-tab]")) {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  }
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.logoutButton.addEventListener("click", logout);

  elements.newCalendarButton.addEventListener("click", startNewCalendar);
  elements.calendarList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-calendar-action]");
    if (!button) return;
    const calendar = calendars.find((item) => item.id === button.dataset.id);
    if (!calendar) return;
    if (button.dataset.calendarAction === "copy") await copyCalendarLink(calendar);
    if (button.dataset.calendarAction === "edit") loadCalendarIntoBuilder(calendar);
    if (button.dataset.calendarAction === "delete") await deleteSavedCalendar(calendar);
  });

  for (const button of document.querySelectorAll("[data-admin-tab]")) {
    button.addEventListener("click", () => showAdminTab(button.dataset.adminTab));
  }
  elements.peopleList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    if (button.dataset.adminAction === "status") {
      updateAdminUser(button.dataset.id, { status: button.dataset.status });
    }
    if (button.dataset.adminAction === "role") {
      updateAdminUser(button.dataset.id, { role: button.dataset.role });
    }
  });
  elements.inviteForm.addEventListener("submit", submitInvite);
  elements.inviteList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invite-action]");
    if (!button) return;
    if (button.dataset.inviteAction === "copy") {
      try {
        await copyText(button.dataset.code);
        showToast("邀请码已复制");
      } catch {
        showToast("复制失败，请重试", "error");
      }
    }
    if (button.dataset.inviteAction === "disable") {
      try {
        await api(`/api/admin/invites/${button.dataset.id}`, { method: "DELETE" });
        await loadAdminData();
        showToast("邀请码已停用");
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    }
  });
}

async function initialize() {
  hydrateStaticIcons();
  renderPresets();
  state = loadStoredPlan() ?? createDefaultState();
  syncFieldValues();
  renderCycle();
  renderPreview();
  bindEvents();

  elements.inviteExpiry.value = addDays(todayISODate(), 7);

  await refreshSession();
  scheduleSave();
}

initialize();
