import {
  applyStaticTranslations,
  getLanguage,
  getLocale,
  initializeLanguage,
  plural,
  setLanguage,
  t
} from "./i18n.js";
import {
  compactTimeZones,
  DEFAULT_TIMEZONE,
  detectTimeZone,
  formatTimeZoneOffset,
  normalizeTimeZone
} from "./timezone.js";
import { minutesRemainingInDay } from "./rest-duration.js";
import {
  buildCycleSharePackage,
  decodeCycleShareInput,
  encodeCycleSharePackage,
  matchSharedPresets
} from "./cycle-share.js";
import {
  MAX_END_DAY_OFFSET,
  inferEndDayOffset,
  isAllDayRest,
  normalizeEndDayOffset,
  shiftDurationMinutes
} from "./shift-time.js";

const STORAGE_KEY = "sloop.plan.v2";
const SHIFT_PRESETS_STORAGE_KEY = "sloop.shift-presets.v1";
const DEFAULT_SHIFT_PRESETS_STORAGE_KEY = SHIFT_PRESETS_STORAGE_KEY;
const USER_SHIFT_PRESETS_STORAGE_KEY_PREFIX = "sloop.shift-presets.user.";
const THEME_STORAGE_KEY = "sloop.theme.v1";
const DEFAULT_MEMBER_MONTHS = 12;
const MAX_MEMBER_MONTHS = 24;
const MAX_SHIFT_PRESETS = 12;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const TONE_ORDER = [
  "sky",
  "indigo",
  "violet",
  "plum",
  "fuchsia",
  "rose",
  "berry",
  "red",
  "orange",
  "coral",
  "clay",
  "amber",
  "sun",
  "lime",
  "sage",
  "emerald",
  "teal",
  "slate"
];
await initializeLanguage();

function getDefaultShiftPresets() {
  return [
    {
      id: "day",
      kind: "work",
      name: t("preset.day"),
      start: "08:00",
      end: "20:00",
      endDayOffset: 0,
      tone: "sky",
      visibleOnHome: true
    },
    {
      id: "night",
      kind: "work",
      name: t("preset.night"),
      start: "20:00",
      end: "08:00",
      endDayOffset: 1,
      tone: "indigo",
      visibleOnHome: true
    },
    {
      id: "off",
      kind: "off",
      name: t("preset.rest"),
      start: "00:00",
      end: "00:00",
      endDayOffset: 0,
      tone: "sage",
      visibleOnHome: true
    }
  ];
}

function toneName(tone) {
  return t(`tone.${tone}`);
}

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
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  settings: '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2"/><path d="M10 12h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h8"/><path d="M16 18h4"/><circle cx="14" cy="18" r="2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.7 6.8-4.2"/><path d="m8.6 13.3 6.8 4.2"/>',
  eye: '<path d="M2.1 12a10 10 0 0 1 19.8 0 10 10 0 0 1-19.8 0Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 8 9 8a17 17 0 0 1-2.1 3.2"/><path d="M6.1 6.1C3.5 7.8 2.1 12 2.1 12s3.5 8 9.9 8a10 10 0 0 0 4.4-1"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
};

const elements = {
  welcomeView: document.querySelector("#welcomeView"),
  appHeader: document.querySelector("#appHeader"),
  appMain: document.querySelector("#appMain"),
  welcomeLoginForm: document.querySelector("#welcomeLoginForm"),
  welcomeRegisterForm: document.querySelector("#welcomeRegisterForm"),
  welcomeLoginSubmit: document.querySelector("#welcomeLoginSubmit"),
  welcomeRegisterSubmit: document.querySelector("#welcomeRegisterSubmit"),
  welcomeAuthTitle: document.querySelector("#welcomeAuthTitle"),
  welcomeAuthDescription: document.querySelector("#welcomeAuthDescription"),
  welcomeAuthStatus: document.querySelector("#welcomeAuthStatus"),
  welcomeTabs: document.querySelector(".welcome-tabs"),
  welcomeLanguageButton: document.querySelector("#welcomeLanguageButton"),
  welcomeLanguageLabel: document.querySelector("#welcomeLanguageLabel"),
  welcomeThemeButton: document.querySelector("#welcomeThemeButton"),
  welcomeThemeIcon: document.querySelector("#welcomeThemeIcon"),
  builderView: document.querySelector("#builderView"),
  calendarsView: document.querySelector("#calendarsView"),
  adminView: document.querySelector("#adminView"),
  title: document.querySelector("#calendarTitle"),
  includeRest: document.querySelector("#includeRest"),
  presetRow: document.querySelector("#presetRow"),
  cycleList: document.querySelector("#cycleList"),
  mobileCycleStrip: document.querySelector("#mobileCycleStrip"),
  mobileShiftPanel: document.querySelector("#mobileShiftPanel"),
  cycleMeta: document.querySelector("#cycleMeta"),
  todayShiftName: document.querySelector("#todayShiftName"),
  todayShiftTime: document.querySelector("#todayShiftTime"),
  cycleLengthLabel: document.querySelector("#cycleLengthLabel"),
  previewDetails: document.querySelector("#previewDetails"),
  rangeCopy: document.querySelector("#rangeCopy"),
  coverageBadge: document.querySelector("#coverageBadge"),
  sequenceTrack: document.querySelector("#sequenceTrack"),
  scheduleList: document.querySelector("#scheduleList"),
  eventEstimate: document.querySelector("#eventEstimate"),
  validityBadge: document.querySelector("#validityBadge"),
  coverageControl: document.querySelector("#coverageControl"),
  subscriptionMonths: document.querySelector("#subscriptionMonths"),
  linkText: document.querySelector("#linkText"),
  copyLinkIcon: document.querySelector("#copyLinkIcon"),
  copyLink: document.querySelector("#copyLink"),
  primaryActionIcon: document.querySelector("#primaryActionIcon"),
  primaryActionLabel: document.querySelector("#primaryActionLabel"),
  saveCalendar: document.querySelector("#saveCalendar"),
  saveCalendarLabel: document.querySelector("#saveCalendarLabel"),
  downloadIcs: document.querySelector("#downloadIcs"),
  downloadIcsLabel: document.querySelector("#downloadIcsLabel"),
  openCalendar: document.querySelector("#openCalendar"),
  privacyNote: document.querySelector("#privacyNote"),
  navCalendars: document.querySelector("#navCalendars"),
  navAdmin: document.querySelector("#navAdmin"),
  authButton: document.querySelector("#authButton"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountName: document.querySelector("#accountName"),
  accountRole: document.querySelector("#accountRole"),
  languageButton: document.querySelector("#languageButton"),
  languageLabel: document.querySelector("#languageLabel"),
  themeButton: document.querySelector("#themeButton"),
  themeIcon: document.querySelector("#themeIcon"),
  calendarList: document.querySelector("#calendarList"),
  newCalendarButton: document.querySelector("#newCalendarButton"),
  importCycleButton: document.querySelector("#importCycleButton"),
  mergedSubscription: document.querySelector("#mergedSubscription"),
  mergedCalendarCount: document.querySelector("#mergedCalendarCount"),
  mergedSubscriptionDescription: document.querySelector("#mergedSubscriptionDescription"),
  mergedSubscriptionLink: document.querySelector("#mergedSubscriptionLink"),
  mergedSubscriptionActionLabel: document.querySelector("#mergedSubscriptionActionLabel"),
  copyMergedSubscription: document.querySelector("#copyMergedSubscription"),
  clearMergedSelection: document.querySelector("#clearMergedSelection"),
  cycleShareDialog: document.querySelector("#cycleShareDialog"),
  cycleShareClose: document.querySelector("#cycleShareClose"),
  cycleShareDescription: document.querySelector("#cycleShareDescription"),
  cycleShareLink: document.querySelector("#cycleShareLink"),
  copyCycleShare: document.querySelector("#copyCycleShare"),
  systemShareCycle: document.querySelector("#systemShareCycle"),
  cycleImportDialog: document.querySelector("#cycleImportDialog"),
  cycleImportClose: document.querySelector("#cycleImportClose"),
  cycleImportForm: document.querySelector("#cycleImportForm"),
  cycleImportInput: document.querySelector("#cycleImportInput"),
  cycleImportStatus: document.querySelector("#cycleImportStatus"),
  cycleImportSubmit: document.querySelector("#cycleImportSubmit"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmCancel: document.querySelector("#confirmCancel"),
  confirmCancelLabel: document.querySelector("#confirmCancelLabel"),
  confirmAccept: document.querySelector("#confirmAccept"),
  confirmAcceptLabel: document.querySelector("#confirmAcceptLabel"),
  adminCount: document.querySelector("#adminCount"),
  pendingCount: document.querySelector("#pendingCount"),
  peopleList: document.querySelector("#peopleList"),
  peoplePanel: document.querySelector("#peoplePanel"),
  invitesPanel: document.querySelector("#invitesPanel"),
  backupPanel: document.querySelector("#backupPanel"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteCode: document.querySelector("#inviteCode"),
  inviteMaxUses: document.querySelector("#inviteMaxUses"),
  inviteExpiry: document.querySelector("#inviteExpiry"),
  inviteCount: document.querySelector("#inviteCount"),
  inviteList: document.querySelector("#inviteList"),
  exportBackupButton: document.querySelector("#exportBackupButton"),
  backupExportStatus: document.querySelector("#backupExportStatus"),
  backupImportForm: document.querySelector("#backupImportForm"),
  backupFile: document.querySelector("#backupFile"),
  backupFileName: document.querySelector("#backupFileName"),
  backupImportButton: document.querySelector("#backupImportButton"),
  backupStatus: document.querySelector("#backupStatus"),
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
  timezoneDialog: document.querySelector("#timezoneDialog"),
  timezoneForm: document.querySelector("#timezoneForm"),
  timezoneSelect: document.querySelector("#timezoneSelect"),
  timezoneClose: document.querySelector("#timezoneClose"),
  timezoneCancel: document.querySelector("#timezoneCancel"),
  timezoneConfirm: document.querySelector("#timezoneConfirm"),
  profileForm: document.querySelector("#profileForm"),
  profileSubmit: document.querySelector("#profileSubmit"),
  profileStatus: document.querySelector("#profileStatus"),
  passwordForm: document.querySelector("#passwordForm"),
  passwordSubmit: document.querySelector("#passwordSubmit"),
  passwordStatus: document.querySelector("#passwordStatus"),
  logoutButton: document.querySelector("#logoutButton"),
  adminPasswordDialog: document.querySelector("#adminPasswordDialog"),
  adminPasswordClose: document.querySelector("#adminPasswordClose"),
  adminPasswordTarget: document.querySelector("#adminPasswordTarget"),
  adminPasswordForm: document.querySelector("#adminPasswordForm"),
  adminPasswordStatus: document.querySelector("#adminPasswordStatus"),
  shiftSettingsDialog: document.querySelector("#shiftSettingsDialog"),
  shiftSettingsClose: document.querySelector("#shiftSettingsClose"),
  shiftSettingsDone: document.querySelector("#shiftSettingsDone"),
  shiftPresetList: document.querySelector("#shiftPresetList"),
  addShiftPreset: document.querySelector("#addShiftPreset"),
  addRestPreset: document.querySelector("#addRestPreset"),
  shiftTimezoneButton: document.querySelector("#shiftTimezoneButton"),
  shiftTimezoneZone: document.querySelector("#shiftTimezoneZone"),
  shiftTimezoneOffset: document.querySelector("#shiftTimezoneOffset"),
  toastRegion: document.querySelector("#toastRegion")
};

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let activeShiftPresetStorageKey = DEFAULT_SHIFT_PRESETS_STORAGE_KEY;
let shiftPresets = loadShiftPresets(activeShiftPresetStorageKey);
let state = createDefaultState();
let currentUser = null;
let authGateReady = false;
let shiftLibrarySyncTimer = 0;
let shiftLibraryRevision = 0;
let currentView = "builder";
let activeCalendarId = null;
let currentLinks = null;
let savedPlanTimer = 0;
let dragState = null;
let selectedShiftId = null;
let pendingTonePaletteScroll = null;
let pendingTonePaletteScrollAt = 0;
let calendars = [];
let activeShareCalendar = null;
let pendingSharedCycleInput = null;
let confirmationResolver = null;
let mergedSubscription = null;
let selectedMergedSubscription = null;
let selectedCalendarIds = new Set();
let selectedMergedRequestId = 0;
let adminUsers = [];
let invites = [];
let adminPasswordUser = null;
let timezoneConfirmedForLink = false;
let timezoneConfirmationResolver = null;

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

function cloneDefaultPresets() {
  return getDefaultShiftPresets().map((preset) => ({ ...preset, removable: true }));
}

function normalizeShiftPreset(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const storedId = cleanText(raw.id, 80);
  const id = /^[a-zA-Z0-9_-]+$/.test(storedId) ? storedId : `preset-${index + 1}`;
  const kind = raw.kind === "off" ? "off" : "work";
  const name =
    cleanText(raw.name, 28) ||
    (kind === "off" ? t("preset.rest") : t("default.shift", { index: index + 1 }));
  let start = cleanTime(raw.start, kind === "off" ? "00:00" : "09:00");
  let end = cleanTime(raw.end, kind === "off" ? "00:00" : "18:00");
  return {
    id,
    kind,
    name,
    start,
    end,
    endDayOffset: normalizeEndDayOffset(raw.endDayOffset, start, end, kind),
    tone: TONE_ORDER.includes(raw.tone) ? raw.tone : kind === "off" ? "sage" : "sky",
    visibleOnHome: raw.visibleOnHome !== false,
    removable: true
  };
}

function normalizeShiftPresetList(stored) {
  if (!Array.isArray(stored)) return null;
  const seen = new Set();
  const presets = stored
    .map((preset, index) => normalizeShiftPreset(preset, index))
    .filter((preset) => {
      if (!preset || seen.has(preset.id)) return false;
      seen.add(preset.id);
      return true;
    })
    .slice(0, MAX_SHIFT_PRESETS);
  if (presets.length && !presets.some((preset) => preset.visibleOnHome)) {
    presets[0].visibleOnHome = true;
  }
  return presets.length ? presets : null;
}

function readStoredShiftPresets(storageKey) {
  try {
    return normalizeShiftPresetList(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    return null;
  }
}

function loadShiftPresets(storageKey = DEFAULT_SHIFT_PRESETS_STORAGE_KEY) {
  return readStoredShiftPresets(storageKey) ?? cloneDefaultPresets();
}

function userShiftPresetsStorageKey(user = currentUser) {
  return user?.id
    ? `${USER_SHIFT_PRESETS_STORAGE_KEY_PREFIX}${user.id}`
    : DEFAULT_SHIFT_PRESETS_STORAGE_KEY;
}

function saveShiftPresets(options = {}) {
  try {
    localStorage.setItem(activeShiftPresetStorageKey, JSON.stringify(shiftPresets));
  } catch {
    // Preset editing remains available when local storage is blocked.
  }
  if (options.sync !== false && currentUser) scheduleShiftLibrarySync();
}

function applyShiftLibrary(rawPresets, user) {
  const presets = normalizeShiftPresetList(rawPresets);
  if (!presets) return false;
  activeShiftPresetStorageKey = userShiftPresetsStorageKey(user);
  shiftPresets = presets;
  ensureCyclePresetAssignments();
  saveShiftPresets({ sync: false });
  renderPresets();
  renderShiftSettings();
  renderCycle();
  updateAllPreview();
  return true;
}

function scheduleShiftLibrarySync() {
  if (!currentUser) return;
  const user = currentUser;
  const revision = ++shiftLibraryRevision;
  window.clearTimeout(shiftLibrarySyncTimer);
  shiftLibrarySyncTimer = window.setTimeout(async () => {
    try {
      await api("/api/shift-library", {
        method: "PUT",
        body: JSON.stringify({ presets: shiftPresets })
      });
      if (currentUser?.id === user.id && revision === shiftLibraryRevision) {
        activeShiftPresetStorageKey = userShiftPresetsStorageKey(user);
        saveShiftPresets({ sync: false });
      }
    } catch (error) {
      console.warn("shift_library_sync_failed", error);
    }
  }, 450);
}

async function flushShiftLibrarySync() {
  window.clearTimeout(shiftLibrarySyncTimer);
  if (!currentUser) return;
  await api("/api/shift-library", {
    method: "PUT",
    body: JSON.stringify({ presets: shiftPresets })
  });
}

async function loadShiftLibraryForUser(user) {
  const userKey = userShiftPresetsStorageKey(user);
  try {
    const data = await api("/api/shift-library");
    if (data.presets?.length) {
      applyShiftLibrary(data.presets, user);
      return;
    }
    const saved = await api("/api/shift-library", {
      method: "PUT",
      body: JSON.stringify({ presets: shiftPresets })
    });
    applyShiftLibrary(saved.presets, user);
  } catch (error) {
    console.warn("shift_library_load_failed", error);
    const cached = readStoredShiftPresets(userKey);
    activeShiftPresetStorageKey = userKey;
    if (cached) {
      applyShiftLibrary(cached, user);
    } else {
      saveShiftPresets({ sync: false });
    }
  }
}

function getShiftPreset(id) {
  return shiftPresets.find((preset) => preset.id === id) ?? null;
}

function defaultPresetName(id) {
  const key = { day: "preset.day", night: "preset.night", off: "preset.rest" }[id];
  return key ? t(key) : null;
}

function localizeBuiltInName(value) {
  const text = String(value ?? "");
  const aliases = [
    ["default.calendarTitle", ["轮转班表", "Rotation schedule"]],
    ["default.customShift", ["自定义班次", "Custom shift"]],
    ["preset.day", ["白班", "Day shift"]],
    ["preset.night", ["夜班", "Night shift"]],
    ["preset.rest", ["休息", "Rest day"]]
  ];
  for (const [key, names] of aliases) {
    if (names.includes(text)) return t(key);
  }
  const indexed = text.match(/^(?:班次|Shift) (\d+)$/);
  return indexed ? t("default.shift", { index: indexed[1] }) : text;
}

function displayPresetName(preset) {
  const localized = defaultPresetName(preset?.id);
  if (!localized) return localizeBuiltInName(preset?.name);
  const aliases = {
    day: ["白班", "Day shift"],
    night: ["夜班", "Night shift"],
    off: ["休息", "Rest day"]
  };
  return aliases[preset.id]?.includes(preset.name) ? localized : localizeBuiltInName(preset.name);
}

function displayShiftName(shift) {
  if (!shift) return "";
  const preset = shift.presetId ? getShiftPreset(shift.presetId) : null;
  return preset ? displayPresetName(preset) : localizeBuiltInName(shift.name);
}

function makeShift(preset = shiftPresets[0] ?? getDefaultShiftPresets()[0]) {
  const fallbackPreset = getDefaultShiftPresets()[0];
  preset ??= fallbackPreset;
  return {
    id: makeId(),
    presetId: preset.id || null,
    kind: preset.kind,
    name: preset.name,
    start: preset.start,
    end: preset.end,
    endDayOffset: preset.endDayOffset,
    tone: preset.tone
  };
}

function createDefaultState() {
  const availableVisible = shiftPresets.filter((preset) => preset.visibleOnHome !== false);
  const available = availableVisible.length ? availableVisible : shiftPresets;
  const day = getShiftPreset("day") ?? available.find((preset) => preset.kind === "work") ?? available[0];
  const night =
    getShiftPreset("night") ??
    available.find((preset) => preset.kind === "work" && preset.id !== day.id) ??
    day;
  const off = getShiftPreset("off") ?? available.find((preset) => preset.kind === "off") ?? available[0];
  const cycle = [
    makeShift(day),
    makeShift(day),
    makeShift(night),
    makeShift(night),
    makeShift(off),
    makeShift(off)
  ];
  return {
    title: t("default.calendarTitle"),
    timezone: DEFAULT_TIMEZONE,
    includeRest: false,
    durationMonths: DEFAULT_MEMBER_MONTHS,
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
    const isCompact = Array.isArray(source);
    const item = isCompact
      ? {
          kind: source[0],
          name: source[1],
          start: source[2],
          end: source[3],
          tone: source[4],
          presetId: source[5],
          endDayOffset: source[6]
        }
      : source;
    const hasPresetId = isCompact
      ? source.length > 5
      : Boolean(item) && (Object.hasOwn(item, "p") || Object.hasOwn(item, "presetId"));
    const kindValue = String(item?.k ?? item?.kind ?? "w");
    const kind = kindValue === "off" || kindValue === "o" ? "off" : "work";
    const toneValue = String(item?.o ?? item?.tone ?? (kind === "off" ? "sage" : "sky"));
    const start = cleanTime(item?.a ?? item?.start, kind === "off" ? "00:00" : "09:00");
    const end = cleanTime(item?.b ?? item?.end, kind === "off" ? "00:00" : "18:00");
    return {
      id: makeId(),
      kind,
      name:
        cleanText(item?.n ?? item?.name, 28) ||
        (kind === "off" ? t("preset.rest") : t("default.shift", { index: index + 1 })),
      start,
      end,
      endDayOffset: normalizeEndDayOffset(
        item?.e ?? item?.endDayOffset,
        start,
        end,
        kind
      ),
      tone: TONE_ORDER.includes(toneValue) ? toneValue : "sky",
      presetId: hasPresetId ? cleanText(item?.p ?? item?.presetId, 80) || null : undefined
    };
  });

  const sourceToday = Number(raw.i ?? raw.todayIndex ?? 0);
  const todayIndex =
    Number.isInteger(sourceToday) && sourceToday >= 0 && sourceToday < cycle.length ? sourceToday : 0;

  return {
    title: cleanText(raw.t ?? raw.title, 64) || t("default.calendarTitle"),
    timezone: normalizeTimeZone(raw.z ?? raw.timezone, DEFAULT_TIMEZONE),
    includeRest: Boolean(raw.r ?? raw.includeRest),
    durationMonths: clampSubscriptionMonths(
      raw.d ?? raw.durationMonths,
      DEFAULT_MEMBER_MONTHS
    ),
    cycle,
    todayId: cycle[todayIndex].id
  };
}

function compactPlan(source = state) {
  const todayIndex = Math.max(
    0,
    source.cycle.findIndex((item) => item.id === source.todayId)
  );
  return {
    v: 2,
    t: source.title,
    z: source.timezone,
    r: source.includeRest ? 1 : 0,
    d: clampSubscriptionMonths(source.durationMonths, DEFAULT_MEMBER_MONTHS),
    i: todayIndex,
    c: source.cycle.map((item) => [
      item.kind === "off" ? "o" : "w",
      item.name,
      item.start,
      item.end,
      item.tone,
      item.presetId || "",
      item.endDayOffset
    ])
  };
}

function presetSignature(preset) {
  return [
    preset.kind,
    preset.name,
    preset.start,
    preset.end,
    preset.endDayOffset,
    preset.tone
  ].join("\u0000");
}

function ensureCyclePresetAssignments() {
  const bySignature = new Map(shiftPresets.map((preset) => [presetSignature(preset), preset]));
  let changed = false;

  for (const shift of state.cycle) {
    if (shift.presetId === null) continue;
    let preset = getShiftPreset(shift.presetId);
    if (preset) continue;

    const signature = presetSignature(shift);
    preset = bySignature.get(signature);
    if (!preset) {
      preset = {
        id: `custom-${makeId()}`,
        kind: shift.kind,
        name: shift.name,
        start: shift.start,
        end: shift.end,
        endDayOffset: shift.endDayOffset,
        tone: shift.tone,
        removable: true
      };
      shiftPresets.push(preset);
      bySignature.set(signature, preset);
      changed = true;
    }
    shift.presetId = preset.id;
  }

  if (changed) saveShiftPresets();
}

function syncCycleShiftsToPreset(preset) {
  for (const shift of state.cycle) {
    if (shift.presetId !== preset.id) continue;
    shift.kind = preset.kind;
    shift.name = preset.name;
    shift.start = preset.start;
    shift.end = preset.end;
    shift.endDayOffset = preset.endDayOffset;
    shift.tone = preset.tone;
  }
}

function detachShiftFromPreset(shift) {
  if (shift) shift.presetId = null;
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
    timeZone: state.timezone,
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
  return new Intl.DateTimeFormat(getLocale(), { month: "numeric", day: "numeric" }).format(date);
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat(getLocale(), { weekday: "short" }).format(date);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parseISODate(value));
}

function coverageMonths() {
  return clampSubscriptionMonths(state.durationMonths, DEFAULT_MEMBER_MONTHS);
}

function clampSubscriptionMonths(value, fallback = DEFAULT_MEMBER_MONTHS) {
  const months = Number(value);
  if (!Number.isFinite(months)) return fallback;
  return Math.max(1, Math.min(MAX_MEMBER_MONTHS, Math.round(months)));
}

function formatRange() {
  const start = todayISODate();
  const end = addMonths(start, coverageMonths());
  const endLabel = new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(end);
  return t("time.range", { start: formatDate(start), end: endLabel });
}

function isOvernightShift(shift) {
  return shift?.kind === "work" && Number(shift.endDayOffset) > 0;
}

function restStartForIndex(index) {
  const shift = state.cycle[index];
  if (!isAllDayRest(shift) || state.cycle.length === 0) return null;
  const previous = state.cycle[(index - 1 + state.cycle.length) % state.cycle.length];
  return isOvernightShift(previous) && previous.endDayOffset === 1 ? previous.end : null;
}

function dayOffsetLabel(offset) {
  return offset > 0 ? `+${plural("units.days", offset)}` : t("time.sameDay");
}

function endDayOptions(selectedOffset) {
  return Array.from({ length: MAX_END_DAY_OFFSET + 1 }, (_, offset) => `
    <option value="${offset}"${offset === selectedOffset ? " selected" : ""}>${dayOffsetLabel(offset)}</option>
  `).join("");
}

function restRemainingLabel(time) {
  const minutes = minutesRemainingInDay(time);
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? t("time.durationHoursMinutes", { hours, minutes: remainder })
    : t("time.durationHours", { hours });
}

function shiftRangeLabel(shift) {
  const dayOffset = shift.endDayOffset > 0 ? `${dayOffsetLabel(shift.endDayOffset)} ` : "";
  return `${shift.start}–${dayOffset}${shift.end}`;
}

function shiftTimeLabel(shift, restStart = null) {
  if (shift.kind === "off") {
    if (!isAllDayRest(shift)) return shiftRangeLabel(shift);
    return restStart ? t("time.restStart", { time: restStart }) : t("time.allDay");
  }
  return shiftRangeLabel(shift);
}

function restSummaryForIndex(index) {
  const restStart = restStartForIndex(index);
  return restStart
    ? t("cycle.overnightRest", {
        time: restStart,
        duration: restRemainingLabel(restStart)
      })
    : t("cycle.restNoCalendar");
}

function mobileRestSummaryForIndex(index) {
  const shift = state.cycle[index];
  if (!isAllDayRest(shift)) return shiftTimeLabel(shift);
  const restStart = restStartForIndex(index);
  return restStart
    ? t("cycle.mobileRest", {
        time: restStart,
        duration: restRemainingLabel(restStart)
      })
    : t("cycle.mobileAllDayRest");
}

function hasShiftTimingError(shift) {
  if (shift.kind === "work") return shiftDurationMinutes(shift) <= 0;
  return !isAllDayRest(shift) && shiftDurationMinutes(shift) <= 0;
}

function toMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function shiftIcon(shift) {
  if (shift.kind === "off") return "coffee";
  if (shift.endDayOffset > 0 || toMinutes(shift.start) >= 17 * 60) {
    return "moon";
  }
  return "sun";
}

function renderPresets() {
  const presetButton = (preset) => `
        <button class="preset-button tone-${preset.tone}" type="button" data-preset="${preset.id}">
          <span class="preset-glyph">${icon(shiftIcon(preset), 16)}</span>
          <span class="preset-copy">
            <strong>${escapeHTML(displayPresetName(preset))}</strong>
            <small>${shiftTimeLabel(preset)}</small>
          </span>
        </button>
      `;

  elements.presetRow.innerHTML = shiftPresets
    .filter((preset) => preset.visibleOnHome !== false)
    .map(presetButton)
    .join("");
}

function renderShiftSettings() {
  elements.shiftPresetList.innerHTML = shiftPresets
    .map((preset, index) => {
      const isOff = preset.kind === "off";
      const allDayRest = isAllDayRest(preset);
      const tones = TONE_ORDER.map(
        (tone) => `
          <button
            class="preset-tone tone-${tone}"
            type="button"
            data-preset-action="tone"
            data-id="${preset.id}"
            data-tone="${tone}"
            aria-label="${escapeHTML(toneName(tone))}"
            aria-pressed="${preset.tone === tone}"
            title="${escapeHTML(toneName(tone))}"
          ></button>
        `
      ).join("");
      const timeFields = `
        <div class="shift-preset-time">
          <label>
            <span>${t("common.start")}</span>
            <input type="time" value="${preset.start}" data-preset-field="start" data-id="${preset.id}" aria-label="${escapeHTML(t("shiftSettings.startAria", { name: displayPresetName(preset) }))}" />
          </label>
          <span aria-hidden="true">→</span>
          <label class="shift-preset-time-end">
            <span>${t("common.end")}</span>
            <input type="time" value="${preset.end}" data-preset-field="end" data-id="${preset.id}" aria-label="${escapeHTML(t("shiftSettings.endAria", { name: displayPresetName(preset) }))}" />
            <select
              class="end-day-select"
              data-preset-field="endDayOffset"
              data-id="${preset.id}"
              aria-label="${escapeHTML(t("shiftSettings.endDayAria", { name: displayPresetName(preset) }))}"
            >${endDayOptions(preset.endDayOffset)}</select>
          </label>
        </div>
      `;

      return `
        <article class="shift-preset-card tone-${preset.tone}${isOff ? " is-off" : ""}" data-id="${preset.id}">
          <div class="shift-preset-card-heading">
            <span class="shift-preset-index">${String(index + 1).padStart(2, "0")}</span>
            <input
              class="shift-preset-name"
              type="text"
              value="${escapeHTML(displayPresetName(preset))}"
              maxlength="28"
              data-preset-field="name"
              data-id="${preset.id}"
              aria-label="${escapeHTML(t("shiftSettings.nameAria", { index: index + 1 }))}"
              autocomplete="off"
            />
            <button
              class="shift-preset-visibility"
              type="button"
              data-preset-action="visibility"
              data-id="${preset.id}"
              aria-label="${escapeHTML(t(
                preset.visibleOnHome !== false
                  ? "shiftSettings.hideFromHome"
                  : "shiftSettings.showOnHome",
                { name: displayPresetName(preset) }
              ))}"
              aria-pressed="${preset.visibleOnHome !== false}"
              title="${escapeHTML(t(
                preset.visibleOnHome !== false
                  ? "shiftSettings.hideFromHome"
                  : "shiftSettings.showOnHome",
                { name: displayPresetName(preset) }
              ))}"
            >${icon(preset.visibleOnHome !== false ? "eye" : "eyeOff", 15)}</button>
            <button class="shift-preset-remove" type="button" data-preset-action="remove" data-id="${preset.id}" aria-label="${escapeHTML(t("shiftSettings.remove", { name: displayPresetName(preset) }))}">${icon("trash", 15)}</button>
          </div>
          <div class="shift-preset-mode">
            <div class="kind-control shift-preset-kind" role="group" aria-label="${escapeHTML(t("shiftSettings.kindAria", { name: displayPresetName(preset) }))}">
              <button
                type="button"
                data-preset-action="kind"
                data-kind="work"
                data-id="${preset.id}"
                aria-pressed="${!isOff}"
              >${t("common.work")}</button>
              <button
                type="button"
                data-preset-action="kind"
                data-kind="off"
                data-id="${preset.id}"
                aria-pressed="${isOff}"
              >${t("common.rest")}</button>
            </div>
            ${
              isOff
                ? `
                  <label class="rest-all-day-control">
                    <input
                      type="checkbox"
                      data-preset-field="allDayRest"
                      data-id="${preset.id}"
                      ${allDayRest ? "checked" : ""}
                    />
                    <span>${t("shiftSettings.allDayRest")}</span>
                  </label>
                `
                : ""
            }
          </div>
          ${
            isOff && allDayRest
              ? `<span class="shift-preset-off">${t("shiftSettings.allDayRestHint")}</span>`
              : timeFields
          }
          <div class="shift-preset-tones" role="group" aria-label="${escapeHTML(t("shiftSettings.colors", { name: displayPresetName(preset) }))}">
            ${tones}
          </div>
        </article>
      `;
    })
    .join("");
  syncShiftTimezoneButton();
}

function syncShiftTimezoneButton() {
  const offset = formatTimeZoneOffset(state.timezone, getLocale());
  elements.shiftTimezoneZone.textContent = state.timezone;
  elements.shiftTimezoneOffset.textContent = offset;
  elements.shiftTimezoneButton.setAttribute(
    "aria-label",
    t("shiftSettings.timezoneAria", {
      zone: state.timezone,
      offset
    })
  );
}

function openShiftSettings() {
  renderShiftSettings();
  if (!elements.shiftSettingsDialog.open) elements.shiftSettingsDialog.showModal();
}

function closeShiftSettings() {
  if (elements.shiftSettingsDialog.open) elements.shiftSettingsDialog.close();
}

function updateShiftPreset(id, patch) {
  const preset = getShiftPreset(id);
  if (!preset) return null;
  Object.assign(preset, patch);
  syncCycleShiftsToPreset(preset);
  saveShiftPresets();
  renderPresets();
  renderCycle();
  updateAllPreview();
  return preset;
}

function addCustomShiftPreset(kind = "work") {
  if (shiftPresets.length >= MAX_SHIFT_PRESETS) {
    showToast(t("shiftSettings.tooMany"), "error");
    return;
  }
  const isOff = kind === "off";
  const preset = {
    id: `custom-${makeId()}`,
    kind: isOff ? "off" : "work",
    name: t(isOff ? "shiftSettings.customRest" : "default.customShift"),
    start: isOff ? "00:00" : "09:00",
    end: isOff ? "00:00" : "18:00",
    endDayOffset: 0,
    tone: isOff ? "sage" : "coral",
    visibleOnHome: true,
    removable: true
  };
  shiftPresets.push(preset);
  saveShiftPresets();
  renderPresets();
  renderShiftSettings();
  requestAnimationFrame(() => {
    const input = elements.shiftPresetList.querySelector(
      `[data-preset-field="name"][data-id="${preset.id}"]`
    );
    input?.focus();
    input?.select();
    input?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function changeShiftPresetKind(id, kind) {
  const preset = getShiftPreset(id);
  if (!preset || preset.kind === kind || !["work", "off"].includes(kind)) return;
  const isOff = kind === "off";
  updateShiftPreset(id, {
    kind,
    name: t(isOff ? "preset.rest" : "preset.day"),
    start: isOff ? "00:00" : "08:00",
    end: isOff ? "00:00" : "20:00",
    endDayOffset: 0,
    tone: isOff ? "sage" : "sky"
  });
  renderShiftSettings();
}

function setShiftPresetAllDayRest(id, allDayRest) {
  const preset = getShiftPreset(id);
  if (!preset || preset.kind !== "off") return;
  updateShiftPreset(
    id,
    allDayRest
      ? { start: "00:00", end: "00:00", endDayOffset: 0 }
      : { start: "00:00", end: "00:00", endDayOffset: 1 }
  );
  renderShiftSettings();
}

async function removeShiftPreset(id) {
  const preset = getShiftPreset(id);
  if (!preset) return;
  if (shiftPresets.length <= 1) {
    showToast(t("shiftSettings.keepOne"), "error");
    return;
  }
  if (state.cycle.some((shift) => shift.presetId === id)) {
    const confirmed = await requestConfirmation({
      message: t("confirm.removePresetInUse", { name: displayPresetName(preset) }),
      confirmLabel: t("confirm.deleteAction"),
      danger: true
    });
    if (!confirmed) return;
    for (const shift of state.cycle) {
      if (shift.presetId === id) detachShiftFromPreset(shift);
    }
  }
  shiftPresets = shiftPresets.filter((item) => item.id !== id);
  saveShiftPresets();
  renderPresets();
  renderShiftSettings();
  renderCycle();
  updateAllPreview();
  showToast(t("shiftSettings.removed"));
}

function toggleShiftPresetVisibility(id) {
  const preset = getShiftPreset(id);
  if (!preset) return;
  const isVisible = preset.visibleOnHome !== false;
  if (isVisible && shiftPresets.filter((item) => item.visibleOnHome !== false).length <= 1) {
    showToast(t("shiftSettings.keepOneVisible"), "error");
    return;
  }
  preset.visibleOnHome = !isVisible;
  saveShiftPresets();
  renderPresets();
  const button = elements.shiftPresetList.querySelector(
    `[data-preset-action="visibility"][data-id="${id}"]`
  );
  if (button) {
    const label = t(
      preset.visibleOnHome ? "shiftSettings.hideFromHome" : "shiftSettings.showOnHome",
      { name: displayPresetName(preset) }
    );
    button.innerHTML = icon(preset.visibleOnHome ? "eye" : "eyeOff", 15);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(preset.visibleOnHome));
    button.title = label;
  }
}

function cycleTimeFields(shift, index) {
  return `
    <div class="time-fields">
      <label class="time-input">
        <span>${t("common.start")}</span>
        <input
          type="time"
          value="${shift.start}"
          data-field="start"
          aria-label="${escapeHTML(t("cycle.startAria", { index: index + 1 }))}"
        />
      </label>
      <span class="time-arrow" aria-hidden="true">→</span>
      <label class="time-input time-input-end">
        <span>${t("common.end")}</span>
        <input
          type="time"
          value="${shift.end}"
          data-field="end"
          aria-label="${escapeHTML(t("cycle.endAria", { index: index + 1 }))}"
        />
        <select
          class="end-day-select"
          data-field="endDayOffset"
          aria-label="${escapeHTML(t("cycle.endDayAria", { index: index + 1 }))}"
        >${endDayOptions(shift.endDayOffset)}</select>
      </label>
    </div>
  `;
}

function renderCycle(options = {}) {
  elements.cycleList.innerHTML = state.cycle
    .map((shift, index) => {
      const hasError = hasShiftTimingError(shift) || !shift.name.trim();
      const isToday = shift.id === state.todayId;
      const allDayRest = isAllDayRest(shift);
      return `
        <article
          class="cycle-item tone-${shift.tone}${allDayRest ? " is-all-day-off" : shift.kind === "off" ? " is-timed-off" : ""}${hasError ? " has-error" : ""}${isToday ? " is-today" : ""}"
          data-id="${shift.id}"
          data-index="${index}"
        >
          <button
            class="drag-handle"
            type="button"
            aria-label="${escapeHTML(t("cycle.dragSort", { index: index + 1 }))}"
            title="${escapeHTML(t("cycle.dragTitle"))}"
          >
            ${icon("grip", 15)}
          </button>
          <button
            class="day-number"
            type="button"
            data-action="today"
            aria-label="${escapeHTML(t("cycle.setToday", { index: index + 1 }))}"
            aria-pressed="${isToday}"
            title="${escapeHTML(t("cycle.setTodayTitle"))}"
          >${isToday ? t("cycle.todayShort") : String(index + 1).padStart(2, "0")}</button>

          <div class="shift-identity">
            <button
              class="color-dot"
              type="button"
              data-action="color"
              aria-label="${escapeHTML(t("cycle.changeColor", { tone: toneName(shift.tone) }))}"
              title="${escapeHTML(t("cycle.changeColorTitle"))}"
            ></button>
            <input
              class="shift-name"
              type="text"
              value="${escapeHTML(displayShiftName(shift))}"
              maxlength="28"
              data-field="name"
              aria-label="${escapeHTML(t("cycle.nameAria", { index: index + 1 }))}"
              autocomplete="off"
            />
            <div class="kind-control" role="group" aria-label="${escapeHTML(t("cycle.typeAria", { index: index + 1 }))}">
              <button
                type="button"
                data-action="kind"
                data-kind="work"
                aria-pressed="${shift.kind === "work"}"
              >${t("common.work")}</button>
              <button
                type="button"
                data-action="kind"
                data-kind="off"
                aria-pressed="${shift.kind === "off"}"
              >${t("common.rest")}</button>
            </div>
          </div>

          ${
            shift.kind === "off"
              ? `
                <div class="rest-time-editor">
                  <label class="rest-all-day-control">
                    <input
                      type="checkbox"
                      data-field="allDayRest"
                      ${allDayRest ? "checked" : ""}
                    />
                    <span>${t("shiftSettings.allDayRest")}</span>
                  </label>
                  ${
                    allDayRest
                      ? `<span class="off-label">${restSummaryForIndex(index)}</span>`
                      : cycleTimeFields(shift, index)
                  }
                </div>
              `
              : cycleTimeFields(shift, index)
          }

          <button class="remove-button" type="button" data-action="remove" aria-label="${escapeHTML(t("cycle.removeAria", { index: index + 1 }))}">
            ${icon("trash", 15)}
          </button>
        </article>
      `;
    })
    .join("");

  renderMobileCycle();
  if (options.animateId) animateNewRow(options.animateId);
}

function getSelectedShift() {
  let index = state.cycle.findIndex((shift) => shift.id === selectedShiftId);
  if (index < 0) {
    selectedShiftId = state.todayId || state.cycle[0]?.id || null;
    index = state.cycle.findIndex((shift) => shift.id === selectedShiftId);
  }
  if (index < 0) {
    selectedShiftId = state.cycle[0]?.id || null;
    index = 0;
  }
  return { shift: state.cycle[index], index };
}

function renderMobileShiftPanel(selected, selectedIndex) {
  elements.mobileShiftPanel.innerHTML = `
    <div class="mobile-editor-heading">
      <span>
        <small>${escapeHTML(t("cycle.mobileCurrent", { index: selectedIndex + 1 }))}</small>
        <strong>${escapeHTML(displayShiftName(selected))}</strong>
      </span>
      <button
        class="mobile-today-button"
        type="button"
        data-mobile-action="today"
        aria-pressed="${selected.id === state.todayId}"
      >${selected.id === state.todayId ? t("cycle.mobileTodayStartButton") : t("cycle.mobileSetToday")}</button>
    </div>

    <div class="mobile-editor-fields">
      <div class="mobile-editor-main">
        <div class="kind-control" role="group" aria-label="${escapeHTML(t("cycle.mobileType"))}">
          <button
            type="button"
            data-mobile-action="kind"
            data-kind="work"
            aria-pressed="${selected.kind === "work"}"
          >${t("common.work")}</button>
          <button
            type="button"
            data-mobile-action="kind"
            data-kind="off"
            aria-pressed="${selected.kind === "off"}"
          >${t("common.rest")}</button>
        </div>
      </div>

      <div class="mobile-editor-side">
        <div class="mobile-editor-actions">
          <button type="button" data-mobile-action="left" aria-label="${escapeHTML(t("cycle.moveBackward"))}" title="${escapeHTML(t("cycle.moveBackward"))}" ${selectedIndex === 0 ? "disabled" : ""}>
            ${icon("arrowLeft", 15)}
          </button>
          <button type="button" data-mobile-action="right" aria-label="${escapeHTML(t("cycle.moveForward"))}" title="${escapeHTML(t("cycle.moveForward"))}" ${selectedIndex === state.cycle.length - 1 ? "disabled" : ""}>
            ${icon("arrowRight", 15)}
          </button>
          <button class="is-danger" type="button" data-mobile-action="remove" aria-label="${escapeHTML(t("cycle.deleteCurrent"))}" title="${escapeHTML(t("cycle.deleteCurrent"))}">
            ${icon("trash", 15)}
          </button>
        </div>
      </div>
    </div>
  `;
}

function revealMobileCycleChip(chip, behavior = "smooth") {
  const strip = elements.mobileCycleStrip;
  const edgePadding = 10;
  const visibleStart = strip.scrollLeft + edgePadding;
  const visibleEnd = strip.scrollLeft + strip.clientWidth - edgePadding;
  const stripRect = strip.getBoundingClientRect();
  const chipRect = chip.getBoundingClientRect();
  const chipStart = chipRect.left - stripRect.left + strip.scrollLeft;
  const chipEnd = chipStart + chipRect.width;
  if (chipStart >= visibleStart && chipEnd <= visibleEnd) return;

  const target = chipStart - (strip.clientWidth - chipRect.width) / 2;
  strip.scrollTo({
    left: Math.max(0, target),
    behavior: reduceMotionQuery.matches ? "auto" : behavior
  });
}

function selectMobileCycleShift(id) {
  if (id === selectedShiftId || !state.cycle.some((shift) => shift.id === id)) return;
  selectedShiftId = id;
  for (const chip of elements.mobileCycleStrip.querySelectorAll("[data-mobile-shift-id]")) {
    const isSelected = chip.dataset.mobileShiftId === id;
    chip.classList.toggle("is-selected", isSelected);
    chip.setAttribute("aria-pressed", String(isSelected));
  }
  const { shift, index } = getSelectedShift();
  renderMobileShiftPanel(shift, index);
  requestAnimationFrame(() => {
    const chip = elements.mobileCycleStrip.querySelector(`[data-mobile-shift-id="${id}"]`);
    if (chip) revealMobileCycleChip(chip);
  });
}

function renderMobileCycle() {
  const { shift: selected, index: selectedIndex } = getSelectedShift();
  if (!selected) {
    elements.mobileCycleStrip.innerHTML = "";
    elements.mobileShiftPanel.innerHTML = `<p class="mobile-empty">${t("cycle.mobileEmpty")}</p>`;
    return;
  }

  elements.mobileCycleStrip.innerHTML = state.cycle
    .map((shift, index) => {
      const isSelected = shift.id === selected.id;
      const isToday = shift.id === state.todayId;
      return `
        <button
          class="mobile-cycle-chip tone-${shift.tone}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}"
          type="button"
          data-mobile-shift-id="${shift.id}"
          aria-pressed="${isSelected}"
          aria-label="${escapeHTML(
            t("cycle.mobileDayAria", {
              index: index + 1,
              name: displayShiftName(shift),
              today: isToday ? t("cycle.mobileTodayStart") : ""
            })
          )}"
        >
          <span class="mobile-chip-index">${isToday ? t("cycle.todayShort") : String(index + 1).padStart(2, "0")}</span>
          <span class="mobile-chip-copy">
            <strong data-mobile-chip-name>${escapeHTML(displayShiftName(shift))}</strong>
            <small data-mobile-chip-time>${
              shift.kind === "off" ? mobileRestSummaryForIndex(index) : shiftTimeLabel(shift)
            }</small>
          </span>
        </button>
      `;
    })
    .join("");

  renderMobileShiftPanel(selected, selectedIndex);
  requestAnimationFrame(() => {
    const chip = elements.mobileCycleStrip.querySelector(
      `[data-mobile-shift-id="${selected.id}"]`
    );
    if (chip) revealMobileCycleChip(chip);
  });
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
  elements.title.value = localizeBuiltInName(state.title);
  elements.includeRest.checked = state.includeRest;
  syncCoverageControl();
}

function syncCoverageControl() {
  const visible = Boolean(currentUser);
  elements.coverageControl.hidden = !visible;
  if (visible) {
    elements.subscriptionMonths.value = String(
      clampSubscriptionMonths(state.durationMonths, DEFAULT_MEMBER_MONTHS)
    );
  }
}

function renderMeta() {
  const workCount = state.cycle.filter((shift) => shift.kind === "work").length;
  elements.cycleMeta.textContent = t("builder.cycleMeta", {
    cycle: plural("units.dayCycle", state.cycle.length),
    shifts: plural("units.shifts", workCount)
  });
  elements.cycleLengthLabel.textContent = plural("units.days", state.cycle.length);

  const today = getTodayShift();
  const todayIndex = getTodayIndex();
  elements.todayShiftName.textContent = today ? displayShiftName(today) : t("common.notSet");
  elements.todayShiftTime.textContent = today
    ? shiftTimeLabel(today, restStartForIndex(todayIndex))
    : "";
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
          title="${escapeHTML(displayShiftName(shift))}${index === todayIndex ? escapeHTML(t("cycle.todaySuffix")) : ""}"
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
    const cycleIndex = (todayIndex + offset) % state.cycle.length;
    const shift = state.cycle[cycleIndex];
    rows.push(`
      <div class="schedule-row tone-${shift.tone}">
        <span class="schedule-date">${formatShortDate(date)} ${formatWeekday(date)}</span>
        <span class="schedule-tone" aria-hidden="true"></span>
        <span class="schedule-name">${escapeHTML(displayShiftName(shift))}${offset === 0 ? escapeHTML(t("cycle.todaySuffix")) : ""}</span>
        <span class="schedule-time">${escapeHTML(
          shiftTimeLabel(shift, restStartForIndex(cycleIndex))
        )}</span>
      </div>
    `);
  }

  elements.scheduleList.innerHTML = rows.join("");
  elements.eventEstimate.textContent = plural("units.events", eventCount);
  elements.rangeCopy.textContent = t("time.todayRange", { range: formatRange() });
}

function getValidationErrors() {
  const errors = [];
  if (!state.title.trim()) errors.push(t("validation.title"));
  if (!state.cycle.length) errors.push(t("validation.cycle"));
  for (const [index, shift] of state.cycle.entries()) {
    if (!shift.name.trim()) errors.push(t("validation.shiftName", { index: index + 1 }));
    if (hasShiftTimingError(shift)) {
      errors.push(t("validation.shiftTimes", { index: index + 1 }));
    }
  }
  if (!state.cycle.some((shift) => shift.id === state.todayId)) {
    errors.push(t("validation.today"));
  }
  return errors;
}

function updateActionLabels() {
  const months = coverageMonths();
  const monthsLabel = plural("units.months", months);
  elements.coverageBadge.textContent = monthsLabel;
  elements.saveCalendar.hidden = !currentUser;
  elements.saveCalendarLabel.textContent = activeCalendarId ? t("export.saveChanges") : t("export.save");
  elements.primaryActionIcon.innerHTML = icon("link", 18);
  elements.primaryActionLabel.textContent = activeCalendarId
    ? t("export.memberUpdate", { months: monthsLabel })
    : t("export.memberSave", { months: monthsLabel });
  elements.downloadIcsLabel.textContent = t("export.download", { months: monthsLabel });
  elements.privacyNote.textContent = t("export.memberPrivacy", { months: monthsLabel });
}

function updateValidation() {
  const errors = getValidationErrors();
  const valid = errors.length === 0;
  elements.validityBadge.classList.toggle("is-invalid", !valid);
  elements.validityBadge.innerHTML = `${icon(valid ? "check" : "alert", 12)}<span>${valid ? t("export.ready") : t("export.needsWork")}</span>`;
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
    const hasError = shift && (hasShiftTimingError(shift) || !shift.name.trim());
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
  elements.linkText.textContent = currentUser
    ? t("export.memberLinkPlaceholder")
    : t("export.linkPlaceholder");
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
    showToast(t("cycle.maxDays"), "error");
    return;
  }
  const shift = makeShift(preset);
  state.cycle.push(shift);
  selectedShiftId = shift.id;
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
    showToast(t("cycle.keepOne"), "error");
    return;
  }
  const index = state.cycle.findIndex((shift) => shift.id === id);
  state.cycle = state.cycle.filter((shift) => shift.id !== id);
  if (state.todayId === id) {
    const nextIndex = Math.max(0, Math.min(index - 1, state.cycle.length - 1));
    state.todayId = state.cycle[nextIndex].id;
  }
  if (selectedShiftId === id) {
    selectedShiftId = state.cycle[Math.min(index, state.cycle.length - 1)].id;
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
  detachShiftFromPreset(shift);

  if (kind === "off") {
    shift.kind = "off";
    shift.name = t("preset.rest");
    shift.start = "00:00";
    shift.end = "00:00";
    shift.endDayOffset = 0;
    shift.tone = "sage";
  } else {
    shift.kind = "work";
    shift.name = t("preset.day");
    shift.start = "08:00";
    shift.end = "20:00";
    shift.endDayOffset = 0;
    shift.tone = "sky";
  }

  renderCycle();
  updateAllPreview();
}

function moveShiftBy(id, direction) {
  const index = state.cycle.findIndex((shift) => shift.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.cycle.length) return;
  [state.cycle[index], state.cycle[target]] = [state.cycle[target], state.cycle[index]];
  selectedShiftId = id;
  renderCycle();
  updateAllPreview();
  navigator.vibrate?.(5);
}

function changeTone(row, id) {
  const shift = state.cycle.find((item) => item.id === id);
  if (!shift) return;
  detachShiftFromPreset(shift);
  const currentIndex = TONE_ORDER.indexOf(shift.tone);
  shift.tone = TONE_ORDER[(currentIndex + 1) % TONE_ORDER.length];
  updateTone(row, shift.tone);
  row
    .querySelector(".color-dot")
    ?.setAttribute("aria-label", t("cycle.changeColor", { tone: toneName(shift.tone) }));
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
  const code = error?.message || "generic";
  const translated = t(`errors.${code}`);
  return translated === `errors.${code}` ? t("errors.generic") : translated;
}

function syncThemeControls() {
  const dark = document.documentElement.dataset.theme === "dark";
  const iconName = dark ? "sun" : "moon";
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  elements.welcomeThemeIcon.innerHTML = icon(iconName, 15);
  elements.themeIcon.innerHTML = icon(iconName, 16);
  for (const button of [elements.welcomeThemeButton, elements.themeButton]) {
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

function applyTheme(theme, options = {}) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", nextTheme === "dark" ? "#141612" : "#eff1eb"));
  if (options.persist !== false) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }
  }
  syncThemeControls();
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function refreshLanguageButton() {
  const label = t("language.label");
  elements.languageLabel.textContent = label;
  elements.welcomeLanguageLabel.textContent = label;
  elements.languageButton.setAttribute("aria-label", t("language.switch"));
  elements.welcomeLanguageButton.setAttribute("aria-label", t("language.switch"));
  elements.languageButton.title = t("language.switch");
  elements.welcomeLanguageButton.title = t("language.switch");
  syncThemeControls();
}

function refreshLocalizedUI() {
  refreshLanguageButton();
  renderPresets();
  renderShiftSettings();
  renderCycle();
  applyUserUI();
  renderCalendarList();
  renderMergedSubscription();
  if (currentUser?.role === "admin") {
    renderPeople();
    renderInvites();
  }
  const backupFile = elements.backupFile.files?.[0];
  elements.backupFileName.textContent = backupFile?.name || t("backup.chooseFile");

  if (!elements.accountPanel.hidden) {
    elements.authTitle.textContent = t("auth.account");
  } else {
    elements.authTitle.textContent = elements.loginForm.hidden ? t("auth.register") : t("auth.login");
  }
  setWelcomeAuthTab(elements.welcomeRegisterForm.hidden ? "login" : "register");

  if (currentLinks) {
    elements.linkText.textContent = currentLinks.ics.replace(/^https?:\/\//, "");
  } else {
    elements.linkText.textContent = currentUser
      ? t("export.memberLinkPlaceholder")
      : t("export.linkPlaceholder");
  }
}

function localizeBuiltInData() {
  state.title = localizeBuiltInName(state.title);
  for (const shift of state.cycle) {
    shift.name = localizeBuiltInName(shift.name);
  }
  for (const preset of shiftPresets) {
    preset.name = localizeBuiltInName(preset.name);
  }
}

async function toggleLanguage() {
  await setLanguage(getLanguage() === "zh-CN" ? "en" : "zh-CN");
  timezoneConfirmedForLink = getLanguage() !== "en";
  localizeBuiltInData();
  refreshLocalizedUI();
  syncFieldValues();
  scheduleSave();
}

function timezoneOptionLabel(timeZone, detectedTimeZone, isDetected) {
  const offset = formatTimeZoneOffset(timeZone, getLocale());
  const label = offset ? `${timeZone} · ${offset}` : timeZone;
  return isDetected ? `${t("timezone.detectedOption")} · ${label}` : label;
}

function populateTimezoneOptions(selectedTimeZone, detectedTimeZone) {
  const zones = compactTimeZones([
    selectedTimeZone,
    detectedTimeZone,
    DEFAULT_TIMEZONE
  ]);
  elements.timezoneSelect.innerHTML = zones
    .map(
      (timeZone) =>
        `<option value="${escapeHTML(timeZone)}"${timeZone === selectedTimeZone ? " selected" : ""}>${escapeHTML(
          timezoneOptionLabel(
            timeZone,
            detectedTimeZone,
            timeZone === detectedTimeZone
          )
        )}</option>`
    )
    .join("");
  elements.timezoneSelect.value = selectedTimeZone;
}

function openTimezoneDialog() {
  const detectedTimeZone = detectTimeZone(state.timezone);
  const selectedTimeZone =
    state.timezone === DEFAULT_TIMEZONE && detectedTimeZone !== DEFAULT_TIMEZONE
      ? detectedTimeZone
      : state.timezone;
  populateTimezoneOptions(selectedTimeZone, detectedTimeZone);
  if (!elements.timezoneDialog.open) elements.timezoneDialog.showModal();
}

function settleTimezoneDialog(confirmed) {
  const resolver = timezoneConfirmationResolver;
  timezoneConfirmationResolver = null;
  if (elements.timezoneDialog.open) elements.timezoneDialog.close();
  resolver?.(confirmed);
}

function cancelTimezoneDialog() {
  settleTimezoneDialog(false);
}

function confirmTimezoneSelection(event) {
  event.preventDefault();
  const timeZone = normalizeTimeZone(elements.timezoneSelect.value, state.timezone);
  state.timezone = timeZone;
  timezoneConfirmedForLink = true;
  invalidateLinks();
  renderPreview();
  syncShiftTimezoneButton();
  scheduleSave();
  settleTimezoneDialog(true);
}

function ensureTimezoneForLink() {
  if (getLanguage() !== "en" || timezoneConfirmedForLink) {
    return Promise.resolve(true);
  }
  if (timezoneConfirmationResolver) return Promise.resolve(false);
  return new Promise((resolve) => {
    timezoneConfirmationResolver = resolve;
    openTimezoneDialog();
  });
}

function applyUserUI() {
  const loggedIn = Boolean(currentUser);
  elements.welcomeView.hidden = loggedIn;
  elements.appHeader.hidden = !loggedIn;
  elements.appMain.hidden = !loggedIn;
  document.body.classList.toggle("is-authenticated", loggedIn);
  document.body.classList.toggle("is-authenticating", !loggedIn && !authGateReady);
  elements.navCalendars.hidden = !loggedIn;
  elements.navAdmin.hidden = currentUser?.role !== "admin";
  elements.accountName.textContent = currentUser?.nickname || t("auth.login");
  elements.accountRole.textContent = currentUser
    ? currentUser.role === "admin"
      ? t("role.admin")
      : t("role.member")
    : t("role.member");
  elements.accountAvatar.innerHTML = loggedIn
    ? escapeHTML(currentUser.nickname.trim().slice(0, 1).toUpperCase())
    : icon("user", 15);

  syncCoverageControl();
  renderPreview();

  if (!loggedIn && currentView !== "builder") {
    showView("builder");
  }
}

function setWelcomeAuthStatus(message, isError = false) {
  setFormStatus(elements.welcomeAuthStatus, message, isError);
}

function setWelcomeAuthReady(ready) {
  authGateReady = ready;
  elements.welcomeView.setAttribute("aria-busy", String(!ready));
  elements.welcomeLoginSubmit.disabled = !ready;
  elements.welcomeRegisterSubmit.disabled = !ready;
  document.body.classList.toggle("is-authenticating", !ready);
}

function setWelcomeAuthTab(tab) {
  const activeTab = tab === "register" ? "register" : "login";
  for (const button of elements.welcomeTabs.querySelectorAll("[data-welcome-auth-tab]")) {
    const active = button.dataset.welcomeAuthTab === activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  elements.welcomeLoginForm.hidden = activeTab !== "login";
  elements.welcomeRegisterForm.hidden = activeTab !== "register";
  elements.welcomeAuthTitle.textContent =
    activeTab === "login" ? t("welcome.welcomeBack") : t("welcome.createAccount");
  elements.welcomeAuthDescription.textContent =
    activeTab === "login"
      ? t("welcome.authDescription")
      : t("welcome.registerDescription");
  setWelcomeAuthStatus("");
}

function showAuthView(focusLogin = false) {
  currentUser = null;
  elements.welcomeView.hidden = false;
  elements.appHeader.hidden = true;
  elements.appMain.hidden = true;
  setWelcomeAuthTab("login");
  window.scrollTo({ top: 0, behavior: "auto" });
  if (focusLogin) {
    requestAnimationFrame(() => {
      elements.welcomeLoginForm.elements.username.focus();
    });
  }
}

async function refreshSession() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user;
    if (currentUser) await loadShiftLibraryForUser(currentUser);
  } catch {
    currentUser = null;
  } finally {
    setWelcomeAuthReady(true);
    if (!currentUser) setWelcomeAuthStatus("");
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
  elements.authTitle.textContent = tab === "login" ? t("auth.login") : t("auth.register");
  setAuthStatus("");
}

function resolveConfirmation(confirmed) {
  const resolve = confirmationResolver;
  confirmationResolver = null;
  if (elements.confirmDialog.open) elements.confirmDialog.close();
  resolve?.(confirmed);
}

function requestConfirmation({
  message,
  confirmLabel = t("confirm.continue"),
  cancelLabel = t("common.cancel"),
  danger = false
}) {
  if (confirmationResolver) resolveConfirmation(false);
  elements.confirmMessage.textContent = message;
  elements.confirmCancelLabel.textContent = cancelLabel;
  elements.confirmAcceptLabel.textContent = confirmLabel;
  elements.confirmAccept.classList.toggle("is-danger", danger);
  return new Promise((resolve) => {
    confirmationResolver = resolve;
    elements.confirmDialog.showModal();
    requestAnimationFrame(() => elements.confirmCancel.focus());
  });
}

function openAuthDialog(tab = "login") {
  if (!currentUser) {
    showAuthView(true);
    return;
  }
  elements.accountPanel.hidden = true;
  elements.authTabs.hidden = false;
  setAuthTab(tab);
  if (!elements.authDialog.open) elements.authDialog.showModal();
}

function openAccountDialog() {
  if (!currentUser) {
    showAuthView(true);
    return;
  }
  elements.authTabs.hidden = true;
  elements.loginForm.hidden = true;
  elements.registerForm.hidden = true;
  elements.accountPanel.hidden = false;
  elements.authTitle.textContent = t("auth.account");
  setAuthStatus("");
  elements.accountPanelAvatar.textContent = currentUser.nickname.trim().slice(0, 1).toUpperCase();
  elements.accountPanelName.textContent = currentUser.nickname;
  elements.accountPanelUsername.textContent = `@${currentUser.username}`;
  elements.accountPanelRole.textContent =
    currentUser.role === "admin" ? t("role.admin") : t("role.member");
  elements.accountPanelRole.dataset.status = "approved";
  elements.profileForm.elements.username.value = currentUser.username;
  elements.profileForm.elements.nickname.value = currentUser.nickname;
  elements.passwordForm.reset();
  setFormStatus(elements.profileStatus, "");
  setFormStatus(elements.passwordStatus, "");
  if (!elements.authDialog.open) elements.authDialog.showModal();
}

function setFormStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setAuthStatus(message, isError = false) {
  setFormStatus(elements.authStatus, message, isError);
}

function closeAuthDialog() {
  if (elements.authDialog.open) elements.authDialog.close();
  setAuthStatus("");
  elements.passwordForm.reset();
  setFormStatus(elements.profileStatus, "");
  setFormStatus(elements.passwordStatus, "");
}

function authStatusSetter(formElement) {
  return formElement === elements.welcomeLoginForm || formElement === elements.welcomeRegisterForm
    ? setWelcomeAuthStatus
    : setAuthStatus;
}

async function establishAuthenticatedSession(user) {
  currentUser = user;
  await loadShiftLibraryForUser(currentUser);
  currentLinks = null;
  applyUserUI();
  invalidateLinks();
}

async function handleLogin(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const button = formElement.querySelector("button[type='submit']");
  const setStatus = authStatusSetter(formElement);
  button.disabled = true;
  setStatus(t("auth.signingIn"));
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    await establishAuthenticatedSession(data.user);
    formElement.reset();
    if (formElement === elements.loginForm) closeAuthDialog();
    else setWelcomeAuthStatus("");
    showToast(t("auth.loggedIn"));
    resumePendingSharedCycleImport();
  } catch (error) {
    setStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const button = formElement.querySelector("button[type='submit']");
  const setStatus = authStatusSetter(formElement);
  button.disabled = true;
  setStatus(t("auth.submitting"));
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
      await establishAuthenticatedSession(data.user);
      formElement.reset();
      if (formElement === elements.registerForm) closeAuthDialog();
      else setWelcomeAuthStatus("");
      showToast(data.bootstrap ? t("auth.adminCreated") : t("auth.registered"));
      resumePendingSharedCycleImport();
    } else {
      setStatus(t("auth.pending"));
      formElement.reset();
    }
  } catch (error) {
    setStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  const form = new FormData(elements.profileForm);
  elements.profileSubmit.disabled = true;
  setFormStatus(elements.profileStatus, t("auth.saving"));
  try {
    const data = await api("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        username: form.get("username"),
        nickname: form.get("nickname")
      })
    });
    currentUser = data.user;
    applyUserUI();
    elements.accountPanelAvatar.textContent = currentUser.nickname.trim().slice(0, 1).toUpperCase();
    elements.accountPanelName.textContent = currentUser.nickname;
    elements.accountPanelUsername.textContent = `@${currentUser.username}`;
    elements.profileForm.elements.username.value = currentUser.username;
    elements.profileForm.elements.nickname.value = currentUser.nickname;
    setFormStatus(elements.profileStatus, t("auth.profileUpdated"));
    showToast(t("auth.profileUpdated"));
  } catch (error) {
    setFormStatus(elements.profileStatus, errorMessage(error), true);
  } finally {
    elements.profileSubmit.disabled = false;
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const form = new FormData(elements.passwordForm);
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (newPassword !== confirmPassword) {
    setFormStatus(elements.passwordStatus, t("auth.passwordMismatch"), true);
    elements.passwordForm.elements.confirmPassword.focus();
    return;
  }

  elements.passwordSubmit.disabled = true;
  setFormStatus(elements.passwordStatus, t("auth.updating"));
  try {
    await api("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword: form.get("currentPassword"),
        newPassword
      })
    });
    elements.passwordForm.reset();
    setFormStatus(elements.passwordStatus, t("auth.passwordUpdated"));
    showToast(t("auth.passwordUpdatedToast"));
  } catch (error) {
    setFormStatus(elements.passwordStatus, errorMessage(error), true);
  } finally {
    elements.passwordSubmit.disabled = false;
  }
}

function clearAuthenticatedState() {
  shiftLibraryRevision += 1;
  window.clearTimeout(shiftLibrarySyncTimer);
  currentUser = null;
  calendars = [];
  adminUsers = [];
  invites = [];
  mergedSubscription = null;
  selectedMergedSubscription = null;
  selectedCalendarIds.clear();
  selectedMergedRequestId += 1;
  activeCalendarId = null;
  currentLinks = null;
  activeShiftPresetStorageKey = DEFAULT_SHIFT_PRESETS_STORAGE_KEY;
  shiftPresets = loadShiftPresets(activeShiftPresetStorageKey);
  ensureCyclePresetAssignments();
  renderPresets();
  renderShiftSettings();
  renderCycle();
  applyUserUI();
}

async function logout() {
  try {
    await flushShiftLibrarySync();
  } catch {
    // The user cache is retained when the final remote sync fails.
  }
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Clear the local session state even if the server is unavailable.
  }
  clearAuthenticatedState();
  closeAuthDialog();
  showView("builder");
  showAuthView(true);
  showToast(t("auth.loggedOut"));
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
  currentLinks = buildLinks(data.calendar.subscriptionPath, coverageMonths());
  elements.linkText.textContent = `${window.location.host}${data.calendar.subscriptionPath}`;
  elements.copyLinkIcon.disabled = false;
  updateActionLabels();
  await refreshCalendars({ quiet: true });
  return currentLinks;
}

async function ensureLinks(confirmTimezone = true) {
  if (!currentUser) {
    showAuthView(true);
    return null;
  }
  if (!updateValidation()) throw new Error(getValidationErrors()[0]);
  if (currentLinks) return currentLinks;
  if (confirmTimezone && !(await ensureTimezoneForLink())) return null;

  return persistCalendar();
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
    if (!links) return;
    await copyText(links.ics);
    showToast(t("toast.linkCopied", { months: plural("units.months", links.months) }));
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function runPrimaryAction() {
  await copySubscriptionLink();
}

async function downloadCalendar() {
  try {
    if (!currentUser) {
      showAuthView(true);
      return;
    }
    const links = await ensureLinks(false);
    if (!links) return;
    window.location.href = links.download;
    showToast(t("toast.downloading"));
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function openCalendarApp() {
  try {
    const links = await ensureLinks();
    if (!links) return;
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
    showToast(activeCalendarId ? t("toast.saved") : t("toast.created"));
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

function takeSharedCycleInputFromLocation() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hashToken = hash.get("share");
  const queryToken = url.searchParams.get("share");
  const token = hashToken || queryToken;
  if (!token) return "";

  const input = url.href;
  if (hashToken) {
    hash.delete("share");
    url.hash = hash.toString();
  } else {
    url.searchParams.delete("share");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return input;
}

function buildCycleShareLink(calendar) {
  const sharePackage = buildCycleSharePackage(calendar.plan, shiftPresets);
  const token = encodeCycleSharePackage(sharePackage);
  return `${window.location.origin}${window.location.pathname}#share=${token}`;
}

function openCycleShareDialog(calendar) {
  try {
    const link = buildCycleShareLink(calendar);
    activeShareCalendar = calendar;
    elements.cycleShareDescription.textContent = t("saved.shareDescription", {
      name: localizeBuiltInName(calendar.title)
    });
    elements.cycleShareLink.value = link;
    elements.systemShareCycle.hidden = typeof navigator.share !== "function";
    if (!elements.cycleShareDialog.open) elements.cycleShareDialog.showModal();
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function closeCycleShareDialog() {
  if (elements.cycleShareDialog.open) elements.cycleShareDialog.close();
  activeShareCalendar = null;
}

async function copyCycleShareLink() {
  try {
    await copyText(elements.cycleShareLink.value);
    showToast(t("toast.cycleShareCopied"));
  } catch {
    showToast(t("toast.copyFailed"), "error");
  }
}

async function shareCycleNatively() {
  if (!activeShareCalendar || typeof navigator.share !== "function") return;
  try {
    await navigator.share({
      title: localizeBuiltInName(activeShareCalendar.title),
      text: t("saved.shareText"),
      url: elements.cycleShareLink.value
    });
  } catch (error) {
    if (error?.name !== "AbortError") showToast(t("toast.shareFailed"), "error");
  }
}

function openCycleImportDialog(prefill = "") {
  if (!currentUser) {
    pendingSharedCycleInput = prefill;
    openAuthDialog("login");
    return;
  }
  showView("calendars");
  elements.cycleImportForm.reset();
  elements.cycleImportInput.value = prefill;
  setFormStatus(elements.cycleImportStatus, "");
  elements.cycleImportSubmit.disabled = false;
  if (!elements.cycleImportDialog.open) elements.cycleImportDialog.showModal();
  requestAnimationFrame(() => {
    elements.cycleImportInput.focus();
    if (prefill) elements.cycleImportInput.select();
  });
}

function closeCycleImportDialog() {
  if (elements.cycleImportDialog.open) elements.cycleImportDialog.close();
  elements.cycleImportForm.reset();
  setFormStatus(elements.cycleImportStatus, "");
  elements.cycleImportSubmit.disabled = false;
}

function resumePendingSharedCycleImport() {
  if (!pendingSharedCycleInput || !currentUser) return false;
  const input = pendingSharedCycleInput;
  pendingSharedCycleInput = null;
  openCycleImportDialog(input);
  return true;
}

async function prepareImportedCycle(sharePackage) {
  const importedState = normalizeClientPlan(sharePackage.plan);
  const { mapping, missing } = matchSharedPresets(sharePackage.presets, shiftPresets);

  if (missing.length) {
    const names = new Intl.ListFormat(getLocale(), {
      style: "long",
      type: "conjunction"
    }).format(missing.slice(0, 4).map((preset) => preset.name));
    const shouldCreate = await requestConfirmation({
      message: t("confirm.createMissingPresets", {
        count: missing.length,
        names,
        more: missing.length > 4 ? t("common.more") : ""
      }),
      confirmLabel: t("confirm.createAndImport"),
      cancelLabel: t("confirm.importWithoutCreating")
    });
    if (shouldCreate) {
      if (shiftPresets.length + missing.length > MAX_SHIFT_PRESETS) {
        throw new Error("shift_library_full");
      }
      for (const sharedPreset of missing) {
        const requestedId = cleanText(sharedPreset.id, 80);
        const id =
          /^[a-zA-Z0-9_-]+$/.test(requestedId) && !getShiftPreset(requestedId)
            ? requestedId
            : `custom-${makeId()}`;
        const preset = normalizeShiftPreset({ ...sharedPreset, id }, shiftPresets.length);
        shiftPresets.push(preset);
        mapping.set(sharedPreset.id, preset.id);
      }
      saveShiftPresets();
      renderPresets();
      renderShiftSettings();
    } else {
      for (const preset of missing) mapping.set(preset.id, null);
    }
  }

  for (const shift of importedState.cycle) {
    if (!shift.presetId) continue;
    shift.presetId = mapping.has(shift.presetId) ? mapping.get(shift.presetId) : null;
  }
  return importedState;
}

async function importSharedCycle(event) {
  event.preventDefault();
  if (!currentUser) {
    pendingSharedCycleInput = elements.cycleImportInput.value.trim();
    closeCycleImportDialog();
    openAuthDialog("login");
    return;
  }
  const input = elements.cycleImportInput.value.trim();
  if (!input) {
    setFormStatus(elements.cycleImportStatus, t("saved.importPlaceholder"), true);
    elements.cycleImportInput.focus();
    return;
  }

  elements.cycleImportSubmit.disabled = true;
  setFormStatus(elements.cycleImportStatus, t("saved.importing"));
  try {
    const sharePackage = decodeCycleShareInput(input);
    const importedState = await prepareImportedCycle(sharePackage);
    await api("/api/calendars", {
      method: "POST",
      body: JSON.stringify({
        title: importedState.title,
        plan: compactPlan(importedState)
      })
    });
    await refreshCalendars({ quiet: true });
    closeCycleImportDialog();
    showView("calendars");
    showToast(t("toast.cycleImported"));
  } catch (error) {
    setFormStatus(elements.cycleImportStatus, errorMessage(error), true);
  } finally {
    elements.cycleImportSubmit.disabled = false;
  }
}

function renderMergedSubscription() {
  const selectedCount = selectedCalendarIds.size;
  const activeSubscription =
    selectedCount > 0 ? selectedMergedSubscription : mergedSubscription;
  const visible =
    Boolean(currentUser) &&
    calendars.length > 0;
  elements.mergedSubscription.hidden = !visible;
  elements.clearMergedSelection.hidden = selectedCount === 0;
  if (!visible) return;

  elements.mergedCalendarCount.textContent =
    selectedCount > 0
      ? plural("units.selected", selectedCount)
      : plural("units.total", calendars.length);
  elements.mergedSubscriptionDescription.textContent =
    selectedCount > 0 ? t("saved.mergedSelected") : t("saved.mergedAuto");
  elements.mergedSubscriptionActionLabel.textContent =
    selectedCount > 0 ? t("saved.copySelected") : t("saved.copyAll");
  elements.copyMergedSubscription.disabled = !activeSubscription?.subscriptionPath;
  elements.mergedSubscriptionLink.textContent = activeSubscription?.subscriptionPath
    ? `${window.location.host}${activeSubscription.subscriptionPath}`
    : selectedCount > 0
      ? t("saved.generating")
      : "";
}

async function refreshMergedSubscription(options = {}) {
  if (!currentUser || !calendars.length) {
    mergedSubscription = null;
    renderMergedSubscription();
    return;
  }

  try {
    mergedSubscription = await api("/api/merged-subscription");
    renderMergedSubscription();
  } catch (error) {
    mergedSubscription = null;
    renderMergedSubscription();
    if (!options.quiet) showToast(errorMessage(error), "error");
  }
}

async function refreshSelectedMergedSubscription(options = {}) {
  const requestId = ++selectedMergedRequestId;
  if (!currentUser || !selectedCalendarIds.size) {
    selectedMergedSubscription = null;
    renderMergedSubscription();
    return;
  }

  const ids = [...selectedCalendarIds].sort();
  selectedMergedSubscription = null;
  renderMergedSubscription();
  try {
    const data = await api(
      `/api/merged-subscription?ids=${encodeURIComponent(ids.join(","))}`
    );
    if (
      requestId !== selectedMergedRequestId ||
      ids.join(",") !== [...selectedCalendarIds].sort().join(",")
    ) {
      return;
    }
    selectedMergedSubscription = data;
    renderMergedSubscription();
  } catch (error) {
    if (requestId !== selectedMergedRequestId) return;
    selectedMergedSubscription = null;
    renderMergedSubscription();
    if (!options.quiet) showToast(errorMessage(error), "error");
  }
}

function updateCalendarSelection(id, selected) {
  if (selected) selectedCalendarIds.add(id);
  else selectedCalendarIds.delete(id);
  renderCalendarList();
  refreshSelectedMergedSubscription();
}

function clearMergedSelection() {
  selectedCalendarIds.clear();
  selectedMergedRequestId += 1;
  selectedMergedSubscription = null;
  renderCalendarList();
  renderMergedSubscription();
}

function renderCalendarList() {
  if (!calendars.length) {
    elements.calendarList.innerHTML = `
      <div class="empty-state">
        <strong>${t("saved.emptyTitle")}</strong>
        <p>${t("saved.emptyBody")}</p>
      </div>
    `;
    return;
  }

  elements.calendarList.innerHTML = calendars
    .map((calendar) => {
      const displayTitle = localizeBuiltInName(calendar.title);
      const cycleLength = calendar.plan?.c?.length ?? calendar.plan?.cycle?.length ?? 0;
      const months = clampSubscriptionMonths(
        calendar.plan?.d ?? calendar.plan?.durationMonths,
        DEFAULT_MEMBER_MONTHS
      );
      const updated = new Date(calendar.updatedAt);
      const updatedCopy = new Intl.DateTimeFormat(getLocale(), {
        month: "numeric",
        day: "numeric"
      }).format(updated);
      const selected = selectedCalendarIds.has(calendar.id);
      return `
        <article class="calendar-row${selected ? " is-selected" : ""}" data-id="${calendar.id}">
          <label class="calendar-select" title="${escapeHTML(t("saved.selectMerge"))}">
            <input
              type="checkbox"
              data-calendar-select
              data-id="${calendar.id}"
              aria-label="${escapeHTML(t("saved.selectCalendar", { name: displayTitle }))}"
              ${selected ? "checked" : ""}
            />
            <span class="calendar-select-control" aria-hidden="true">${icon("check", 12)}</span>
          </label>
          <div class="calendar-row-copy">
            <h3>${escapeHTML(displayTitle)}</h3>
            <div class="calendar-row-meta">
              <span>${plural("units.dayCycle", cycleLength)}</span>
              <span>${plural("units.months", months)}</span>
              <span>${escapeHTML(t("saved.updated", { date: updatedCopy }))}</span>
              <span class="calendar-sequence" aria-hidden="true">${calendarSequence(calendar.plan)}</span>
            </div>
          </div>
          <div class="calendar-row-actions">
            <button class="row-action" type="button" data-calendar-action="share" data-id="${calendar.id}" aria-label="${escapeHTML(t("saved.share"))}" title="${escapeHTML(t("saved.share"))}">${icon("share", 15)}</button>
            <button class="row-action" type="button" data-calendar-action="copy" data-id="${calendar.id}" aria-label="${escapeHTML(t("saved.copyLink"))}" title="${escapeHTML(t("saved.copyLink"))}">${icon("copy", 15)}</button>
            <button class="row-action" type="button" data-calendar-action="edit" data-id="${calendar.id}" aria-label="${escapeHTML(t("saved.edit"))}" title="${escapeHTML(t("saved.edit"))}">${icon("edit", 15)}</button>
            <button class="row-action is-danger" type="button" data-calendar-action="delete" data-id="${calendar.id}" aria-label="${escapeHTML(t("saved.delete"))}" title="${escapeHTML(t("saved.delete"))}">${icon("trash", 15)}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshCalendars(options = {}) {
  if (!currentUser) {
    calendars = [];
    mergedSubscription = null;
    selectedMergedSubscription = null;
    selectedCalendarIds.clear();
    selectedMergedRequestId += 1;
    renderCalendarList();
    renderMergedSubscription();
    return;
  }
  try {
    const data = await api("/api/calendars");
    calendars = data.calendars || [];
    const availableIds = new Set(calendars.map((calendar) => calendar.id));
    for (const id of selectedCalendarIds) {
      if (!availableIds.has(id)) selectedCalendarIds.delete(id);
    }
    renderCalendarList();
    await refreshMergedSubscription(options);
    if (selectedCalendarIds.size) await refreshSelectedMergedSubscription(options);
  } catch (error) {
    if (!options.quiet) showToast(errorMessage(error), "error");
  }
}

function loadCalendarIntoBuilder(calendar) {
  state = normalizeClientPlan(calendar.plan);
  ensureCyclePresetAssignments();
  state.title = localizeBuiltInName(calendar.title);
  timezoneConfirmedForLink = getLanguage() !== "en";
  selectedShiftId = state.todayId;
  activeCalendarId = calendar.id;
  currentLinks = buildLinks(calendar.subscriptionPath, coverageMonths());
  renderPresets();
  syncFieldValues();
  renderCycle();
  renderPreview();
  elements.linkText.textContent = `${window.location.host}${calendar.subscriptionPath}`;
  elements.copyLinkIcon.disabled = false;
  showView("builder");
}

function startNewCalendar() {
  state = createDefaultState();
  timezoneConfirmedForLink = getLanguage() !== "en";
  selectedShiftId = state.todayId;
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
    showToast(t("toast.subscriptionCopied"));
  } catch {
    showToast(t("toast.copyFailed"), "error");
  }
}

async function copyMergedSubscriptionLink() {
  const selectedCount = selectedCalendarIds.size;
  const subscription =
    selectedCount > 0 ? selectedMergedSubscription : mergedSubscription;
  if (!subscription?.subscriptionPath) return;
  try {
    await copyText(absoluteUrl(subscription.subscriptionPath));
    showToast(
      selectedCount > 0
        ? t("toast.mergedSelectedCopied", { count: selectedCount })
        : t("toast.mergedAllCopied", { count: calendars.length })
    );
  } catch {
    showToast(t("toast.copyFailed"), "error");
  }
}

async function deleteSavedCalendar(calendar) {
  const confirmed = await requestConfirmation({
    message: t("confirm.deleteCalendar", { name: localizeBuiltInName(calendar.title) }),
    confirmLabel: t("confirm.deleteAction"),
    danger: true
  });
  if (!confirmed) return;
  try {
    await api(`/api/calendars/${calendar.id}`, { method: "DELETE" });
    if (activeCalendarId === calendar.id) {
      activeCalendarId = null;
      currentLinks = null;
    }
    await refreshCalendars({ quiet: true });
    showToast(t("toast.calendarDeleted"));
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function renderPeople() {
  const pending = adminUsers.filter((user) => user.status === "pending").length;
  elements.adminCount.textContent = plural("units.members", adminUsers.length);
  elements.pendingCount.textContent = plural("units.pending", pending);

  if (!adminUsers.length) {
    elements.peopleList.innerHTML = `<div class="empty-state"><strong>${t("admin.noMembers")}</strong></div>`;
    return;
  }

  const statusLabels = {
    pending: t("status.pending"),
    approved: t("status.approved"),
    rejected: t("status.rejected"),
    disabled: t("status.disabled")
  };

  elements.peopleList.innerHTML = adminUsers
    .map((user) => {
      const isSelf = user.id === currentUser?.id;
      const actions = [];
      if (!isSelf) {
        actions.push(`<button type="button" data-admin-action="password" data-id="${user.id}">${t("admin.changePassword")}</button>`);
        if (user.status === "pending") {
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="approved">${t("admin.approve")}</button>`);
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="rejected">${t("admin.reject")}</button>`);
        } else if (user.status === "approved") {
          actions.push(`<button type="button" data-admin-action="role" data-id="${user.id}" data-role="${user.role === "admin" ? "user" : "admin"}">${user.role === "admin" ? t("admin.makeUser") : t("admin.makeAdmin")}</button>`);
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="disabled">${t("admin.disable")}</button>`);
        } else {
          actions.push(`<button type="button" data-admin-action="status" data-id="${user.id}" data-status="approved">${t("admin.restore")}</button>`);
        }
      }

      return `
        <article class="person-row">
          <div class="person-copy">
            <strong>${escapeHTML(user.nickname)}${isSelf ? ` · ${t("common.you")}` : ""}</strong>
            <span>@${escapeHTML(user.username)}${user.inviteCode ? ` · ${escapeHTML(user.inviteCode)}` : ""}</span>
          </div>
          <div class="person-stats">
            <span>${user.role === "admin" ? t("role.admin") : t("role.member")}</span>
            <span>${plural("units.calendars", user.calendarCount)}</span>
          </div>
          <span class="status-pill" data-status="${user.status}">${statusLabels[user.status]}</span>
          <div class="person-actions">${actions.join("")}</div>
        </article>
      `;
    })
    .join("");
}

function inviteState(invite) {
  if (invite.disabled) return { status: "disabled", label: t("status.disabled") };
  if (invite.uses >= invite.maxUses) return { status: "disabled", label: t("status.usedUp") };
  if (invite.expiresAt && invite.expiresAt * 1000 <= Date.now()) {
    return { status: "disabled", label: t("status.expired") };
  }
  return { status: "approved", label: t("status.available") };
}

function renderInvites() {
  elements.inviteCount.textContent = plural("units.invites", invites.length);
  if (!invites.length) {
    elements.inviteList.innerHTML = `<div class="empty-state"><strong>${t("admin.noInvites")}</strong></div>`;
    return;
  }

  elements.inviteList.innerHTML = invites
    .map((invite) => {
      const inviteStatus = inviteState(invite);
      const expiry = invite.expiresAt
        ? new Intl.DateTimeFormat(getLocale(), { month: "numeric", day: "numeric" }).format(
            new Date(invite.expiresAt * 1000)
          )
        : t("admin.longTerm");
      return `
        <article class="invite-row">
          <div class="invite-code">
            <strong>${escapeHTML(invite.code)}</strong>
            <button class="invite-copy" type="button" data-invite-action="copy" data-code="${escapeHTML(invite.code)}" aria-label="${escapeHTML(t("admin.copyInvite"))}">${icon("copy", 13)}</button>
          </div>
          <div class="invite-row-actions">
            <span class="status-pill" data-status="${inviteStatus.status}">${inviteStatus.label}</span>
            ${
              inviteStatus.status === "approved"
                ? `<button class="row-action is-danger" type="button" data-invite-action="disable" data-id="${invite.id}" aria-label="${escapeHTML(t("admin.disableInvite"))}">${icon("close", 14)}</button>`
                : ""
            }
          </div>
          <div class="invite-meta">
            <span>${escapeHTML(t("admin.uses", { used: invite.uses, max: invite.maxUses, expiry, creator: invite.creatorName }))}</span>
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
    showToast(t("auth.memberStatusUpdated"));
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function openAdminPasswordDialog(user) {
  adminPasswordUser = user;
  elements.adminPasswordTarget.textContent = `${user.nickname} · @${user.username}`;
  elements.adminPasswordForm.reset();
  setFormStatus(elements.adminPasswordStatus, "");
  if (!elements.adminPasswordDialog.open) elements.adminPasswordDialog.showModal();
}

function closeAdminPasswordDialog() {
  if (elements.adminPasswordDialog.open) elements.adminPasswordDialog.close();
  elements.adminPasswordForm.reset();
  setFormStatus(elements.adminPasswordStatus, "");
  adminPasswordUser = null;
}

async function handleAdminPasswordReset(event) {
  event.preventDefault();
  if (!adminPasswordUser) return;
  const form = new FormData(elements.adminPasswordForm);
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (newPassword !== confirmPassword) {
    setFormStatus(elements.adminPasswordStatus, t("auth.passwordMismatch"), true);
    elements.adminPasswordForm.elements.confirmPassword.focus();
    return;
  }

  const button = elements.adminPasswordForm.querySelector("button[type='submit']");
  button.disabled = true;
  setFormStatus(elements.adminPasswordStatus, t("auth.resetting"));
  try {
    await api(`/api/admin/users/${adminPasswordUser.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword })
    });
    const nickname = adminPasswordUser.nickname;
    closeAdminPasswordDialog();
    await loadAdminData();
    showToast(t("auth.resetSuccess", { name: nickname }));
  } catch (error) {
    setFormStatus(elements.adminPasswordStatus, errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function exportAdminBackup() {
  elements.exportBackupButton.disabled = true;
  setFormStatus(elements.backupExportStatus, t("backup.exporting"));
  try {
    const snapshot = await api("/api/admin/backup");
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sloop-backup-${todayISODate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFormStatus(elements.backupExportStatus, t("backup.exported"));
    showToast(t("backup.exported"));
  } catch (error) {
    setFormStatus(elements.backupExportStatus, errorMessage(error), true);
  } finally {
    elements.exportBackupButton.disabled = false;
  }
}

function resetBackupImport() {
  elements.backupImportForm.reset();
  elements.backupFileName.textContent = t("backup.chooseFile");
  elements.backupImportButton.disabled = true;
  setFormStatus(elements.backupStatus, "");
}

function handleBackupFileSelection() {
  const file = elements.backupFile.files?.[0];
  elements.backupFileName.textContent = file?.name || t("backup.chooseFile");
  setFormStatus(elements.backupStatus, "");
  if (file && file.size > MAX_BACKUP_BYTES) {
    elements.backupImportButton.disabled = true;
    setFormStatus(elements.backupStatus, t("backup.fileTooLarge"), true);
    return;
  }
  elements.backupImportButton.disabled = !file;
}

async function importAdminBackup(event) {
  event.preventDefault();
  const file = elements.backupFile.files?.[0];
  if (!file) {
    setFormStatus(elements.backupStatus, t("backup.chooseFile"), true);
    return;
  }
  const confirmed = await requestConfirmation({
    message: t("confirm.importBackup"),
    confirmLabel: t("confirm.importAction"),
    danger: true
  });
  if (!confirmed) return;

  elements.backupImportButton.disabled = true;
  setFormStatus(elements.backupStatus, t("backup.importing"));
  try {
    const text = await file.text();
    await api("/api/admin/backup", {
      method: "POST",
      body: text
    });
    resetBackupImport();
    clearAuthenticatedState();
    closeAuthDialog();
    showView("builder");
    openAuthDialog("login");
    setAuthStatus(t("backup.loginAgain"));
    showToast(t("backup.imported"));
  } catch (error) {
    setFormStatus(elements.backupStatus, errorMessage(error), true);
    elements.backupImportButton.disabled = false;
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
    showToast(t("toast.inviteCreated"));
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
  elements.backupPanel.hidden = tab !== "backup";
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
  for (const button of elements.welcomeTabs.querySelectorAll("[data-welcome-auth-tab]")) {
    button.addEventListener("click", () => setWelcomeAuthTab(button.dataset.welcomeAuthTab));
  }
  elements.welcomeLoginForm.addEventListener("submit", handleLogin);
  elements.welcomeRegisterForm.addEventListener("submit", handleRegister);
  elements.welcomeLanguageButton.addEventListener("click", toggleLanguage);
  elements.welcomeThemeButton.addEventListener("click", toggleTheme);

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

  elements.subscriptionMonths.addEventListener("input", () => {
    if (elements.subscriptionMonths.value === "") return;
    state.durationMonths = clampSubscriptionMonths(elements.subscriptionMonths.value);
    updateAllPreview();
  });

  elements.subscriptionMonths.addEventListener("change", () => {
    state.durationMonths = clampSubscriptionMonths(elements.subscriptionMonths.value);
    syncCoverageControl();
    updateAllPreview();
  });

  elements.presetRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    const preset = button ? getShiftPreset(button.dataset.preset) : null;
    if (preset) addShift(preset);
  });

  for (const button of document.querySelectorAll("[data-shift-settings]")) {
    button.addEventListener("click", openShiftSettings);
  }

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
    detachShiftFromPreset(shift);
    if (input.dataset.field === "allDayRest") {
      shift.start = "00:00";
      shift.end = "00:00";
      shift.endDayOffset = input.checked ? 0 : 1;
      renderCycle();
      updateAllPreview();
      return;
    }
    if (input.dataset.field === "endDayOffset") {
      shift.endDayOffset = normalizeEndDayOffset(
        input.value,
        shift.start,
        shift.end,
        shift.kind
      );
      input.value = String(shift.endDayOffset);
      updateAllPreview();
      return;
    }
    shift[input.dataset.field] = input.value;
    if (
      ["start", "end"].includes(input.dataset.field) &&
      shift.endDayOffset === 0 &&
      inferEndDayOffset(shift.start, shift.end) === 1
    ) {
      shift.endDayOffset = 1;
      const offsetSelect = row.querySelector('[data-field="endDayOffset"]');
      if (offsetSelect) offsetSelect.value = "1";
    }
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

  elements.mobileCycleStrip.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-mobile-shift-id]");
    if (!chip) return;
    selectMobileCycleShift(chip.dataset.mobileShiftId);
  });

  elements.mobileShiftPanel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-mobile-action]");
    if (!action) return;
    const id = selectedShiftId;
    if (!id) return;
    if (action.dataset.mobileAction === "today") setToday(id);
    if (action.dataset.mobileAction === "kind") changeKind(null, id, action.dataset.kind);
    if (action.dataset.mobileAction === "left") moveShiftBy(id, -1);
    if (action.dataset.mobileAction === "right") moveShiftBy(id, 1);
    if (action.dataset.mobileAction === "remove") removeShift(id);
  });

  elements.copyLink.addEventListener("click", runPrimaryAction);
  elements.copyLinkIcon.addEventListener("click", copySubscriptionLink);
  elements.copyMergedSubscription.addEventListener("click", copyMergedSubscriptionLink);
  elements.clearMergedSelection.addEventListener("click", clearMergedSelection);
  elements.downloadIcs.addEventListener("click", downloadCalendar);
  elements.openCalendar.addEventListener("click", openCalendarApp);
  elements.saveCalendar.addEventListener("click", saveCurrentCalendar);

  elements.authButton.addEventListener("click", () => {
    if (currentUser) openAccountDialog();
    else openAuthDialog("login");
  });
  elements.languageButton.addEventListener("click", toggleLanguage);
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.timezoneForm.addEventListener("submit", confirmTimezoneSelection);
  elements.timezoneClose.addEventListener("click", cancelTimezoneDialog);
  elements.timezoneCancel.addEventListener("click", cancelTimezoneDialog);
  elements.timezoneDialog.addEventListener("click", (event) => {
    if (event.target === elements.timezoneDialog) cancelTimezoneDialog();
  });
  elements.timezoneDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelTimezoneDialog();
  });
  elements.authClose.addEventListener("click", closeAuthDialog);
  elements.authDialog.addEventListener("click", (event) => {
    if (event.target === elements.authDialog) closeAuthDialog();
  });
  for (const button of elements.authTabs.querySelectorAll("[data-auth-tab]")) {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  }
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.profileForm.addEventListener("submit", handleProfileUpdate);
  elements.passwordForm.addEventListener("submit", handlePasswordChange);
  elements.logoutButton.addEventListener("click", logout);
  elements.adminPasswordClose.addEventListener("click", closeAdminPasswordDialog);
  elements.adminPasswordDialog.addEventListener("click", (event) => {
    if (event.target === elements.adminPasswordDialog) closeAdminPasswordDialog();
  });
  elements.adminPasswordForm.addEventListener("submit", handleAdminPasswordReset);
  elements.exportBackupButton.addEventListener("click", exportAdminBackup);
  elements.backupFile.addEventListener("change", handleBackupFileSelection);
  elements.backupImportForm.addEventListener("submit", importAdminBackup);

  elements.shiftSettingsClose.addEventListener("click", closeShiftSettings);
  elements.shiftSettingsDone.addEventListener("click", closeShiftSettings);
  elements.shiftTimezoneButton.addEventListener("click", openTimezoneDialog);
  elements.shiftSettingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.shiftSettingsDialog) closeShiftSettings();
  });
  elements.addShiftPreset.addEventListener("click", () => addCustomShiftPreset("work"));
  elements.addRestPreset.addEventListener("click", () => addCustomShiftPreset("off"));
  elements.shiftPresetList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-preset-field]");
    if (!input || input.dataset.presetField !== "name") return;
    updateShiftPreset(input.dataset.id, {
      [input.dataset.presetField]: input.value
    });
  });
  elements.shiftPresetList.addEventListener("change", (event) => {
    const input = event.target.closest("[data-preset-field]");
    if (!input) return;
    const preset = getShiftPreset(input.dataset.id);
    if (!preset) return;
    if (input.dataset.presetField === "name") {
      const name =
        cleanText(preset.name, 28) ||
        (preset.kind === "off" ? t("preset.rest") : t("default.customShift"));
      input.value = name;
      updateShiftPreset(preset.id, { name });
      return;
    }
    if (input.dataset.presetField === "allDayRest") {
      setShiftPresetAllDayRest(preset.id, input.checked);
      return;
    }
    if (input.dataset.presetField === "endDayOffset") {
      const endDayOffset = normalizeEndDayOffset(
        input.value,
        preset.start,
        preset.end,
        preset.kind
      );
      input.value = String(endDayOffset);
      updateShiftPreset(preset.id, { endDayOffset });
      return;
    }
    const fallback =
      input.dataset.presetField === "start"
        ? preset.kind === "off"
          ? "00:00"
          : "09:00"
        : preset.kind === "off"
          ? "00:00"
          : "18:00";
    const value = cleanTime(input.value, fallback);
    input.value = value;
    const next = {
      ...preset,
      [input.dataset.presetField]: value
    };
    const previousOffset = preset.endDayOffset;
    const endDayOffset =
      preset.endDayOffset === 0 && inferEndDayOffset(next.start, next.end) === 1
        ? 1
        : preset.endDayOffset;
    updateShiftPreset(preset.id, {
      [input.dataset.presetField]: value,
      endDayOffset
    });
    if (endDayOffset !== previousOffset) renderShiftSettings();
  });
  elements.shiftPresetList.addEventListener("pointerdown", (event) => {
    const action = event.target.closest('[data-preset-action="tone"]');
    pendingTonePaletteScroll = action
      ? action.closest(".shift-preset-tones")?.scrollLeft ?? 0
      : null;
    pendingTonePaletteScrollAt = action ? performance.now() : 0;
  });
  elements.shiftPresetList.addEventListener("pointercancel", () => {
    pendingTonePaletteScroll = null;
    pendingTonePaletteScrollAt = 0;
  });
  elements.shiftPresetList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-preset-action]");
    if (!action) return;
    if (action.dataset.presetAction === "tone") {
      const paletteScrollLeft =
        Number.isFinite(pendingTonePaletteScroll) &&
        performance.now() - pendingTonePaletteScrollAt < 1000
          ? pendingTonePaletteScroll
          : action.closest(".shift-preset-tones")?.scrollLeft ?? 0;
      pendingTonePaletteScroll = null;
      pendingTonePaletteScrollAt = 0;
      updateShiftPreset(action.dataset.id, { tone: action.dataset.tone });
      const card = action.closest(".shift-preset-card");
      if (card) updateTone(card, action.dataset.tone);
      for (const toneButton of card?.querySelectorAll(".preset-tone") ?? []) {
        toneButton.setAttribute(
          "aria-pressed",
          String(toneButton.dataset.tone === action.dataset.tone)
        );
      }
      const currentPalette = elements.shiftPresetList.querySelector(
        `.shift-preset-card[data-id="${action.dataset.id}"] .shift-preset-tones`
      );
      if (currentPalette) currentPalette.scrollLeft = paletteScrollLeft;
      window.setTimeout(() => {
        const activePalette = elements.shiftPresetList.querySelector(
          `.shift-preset-card[data-id="${action.dataset.id}"] .shift-preset-tones`
        );
        if (activePalette) activePalette.scrollLeft = paletteScrollLeft;
      }, 0);
    }
    if (action.dataset.presetAction === "kind") {
      changeShiftPresetKind(action.dataset.id, action.dataset.kind);
    }
    if (action.dataset.presetAction === "remove") removeShiftPreset(action.dataset.id);
    if (action.dataset.presetAction === "visibility") {
      toggleShiftPresetVisibility(action.dataset.id);
    }
  });

  elements.confirmCancel.addEventListener("click", () => resolveConfirmation(false));
  elements.confirmAccept.addEventListener("click", () => resolveConfirmation(true));
  elements.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirmation(false);
  });
  elements.confirmDialog.addEventListener("click", (event) => {
    if (event.target === elements.confirmDialog) resolveConfirmation(false);
  });
  elements.confirmDialog.addEventListener("close", () => {
    if (confirmationResolver) resolveConfirmation(false);
  });

  elements.newCalendarButton.addEventListener("click", startNewCalendar);
  elements.importCycleButton.addEventListener("click", () => openCycleImportDialog());
  elements.cycleShareClose.addEventListener("click", closeCycleShareDialog);
  elements.cycleShareDialog.addEventListener("click", (event) => {
    if (event.target === elements.cycleShareDialog) closeCycleShareDialog();
  });
  elements.cycleShareDialog.addEventListener("cancel", closeCycleShareDialog);
  elements.copyCycleShare.addEventListener("click", copyCycleShareLink);
  elements.systemShareCycle.addEventListener("click", shareCycleNatively);
  elements.cycleImportClose.addEventListener("click", closeCycleImportDialog);
  elements.cycleImportDialog.addEventListener("click", (event) => {
    if (event.target === elements.cycleImportDialog) closeCycleImportDialog();
  });
  elements.cycleImportDialog.addEventListener("cancel", closeCycleImportDialog);
  elements.cycleImportForm.addEventListener("submit", importSharedCycle);
  elements.cycleImportInput.addEventListener("input", () => {
    setFormStatus(elements.cycleImportStatus, "");
  });
  elements.calendarList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-calendar-select]");
    if (!checkbox) return;
    updateCalendarSelection(checkbox.dataset.id, checkbox.checked);
  });
  elements.calendarList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-calendar-action]");
    if (!button) return;
    const calendar = calendars.find((item) => item.id === button.dataset.id);
    if (!calendar) return;
    if (button.dataset.calendarAction === "copy") await copyCalendarLink(calendar);
    if (button.dataset.calendarAction === "share") openCycleShareDialog(calendar);
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
    if (button.dataset.adminAction === "password") {
      const user = adminUsers.find((item) => item.id === button.dataset.id);
      if (user) openAdminPasswordDialog(user);
    }
  });
  elements.inviteForm.addEventListener("submit", submitInvite);
  elements.inviteList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invite-action]");
    if (!button) return;
    if (button.dataset.inviteAction === "copy") {
      try {
        await copyText(button.dataset.code);
        showToast(t("toast.inviteCopied"));
      } catch {
        showToast(t("toast.copyFailed"), "error");
      }
    }
    if (button.dataset.inviteAction === "disable") {
      try {
        await api(`/api/admin/invites/${button.dataset.id}`, { method: "DELETE" });
        await loadAdminData();
        showToast(t("toast.inviteDisabled"));
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    }
  });
}

async function initialize() {
  hydrateStaticIcons();
  applyTheme(document.documentElement.dataset.theme, { persist: false });
  timezoneConfirmedForLink = getLanguage() !== "en";
  shiftPresets = loadShiftPresets();
  state = loadStoredPlan() ?? createDefaultState();
  localizeBuiltInData();
  ensureCyclePresetAssignments();
  renderPresets();
  syncFieldValues();
  renderCycle();
  renderPreview();
  bindEvents();
  setWelcomeAuthReady(false);
  setWelcomeAuthTab("login");
  setWelcomeAuthStatus(t("welcome.checking"));

  elements.inviteExpiry.value = addDays(todayISODate(), 7);

  await refreshSession();
  const sharedInput = takeSharedCycleInputFromLocation();
  if (sharedInput) {
    pendingSharedCycleInput = sharedInput;
    if (currentUser) resumePendingSharedCycleImport();
    else openAuthDialog("login");
  }
  scheduleSave();
}

initialize();
