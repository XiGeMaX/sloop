export const DEFAULT_TIMEZONE = "Asia/Shanghai";
export const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC"
];

export function isValidTimeZone(value) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value, fallback = DEFAULT_TIMEZONE) {
  const timeZone = String(value ?? "").trim();
  if (isValidTimeZone(timeZone)) return timeZone;
  return isValidTimeZone(fallback) ? fallback : "UTC";
}

export function detectTimeZone(fallback = DEFAULT_TIMEZONE) {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, fallback);
  } catch {
    return normalizeTimeZone(fallback);
  }
}

export function compactTimeZones(preferred = []) {
  return [...new Set([...preferred, ...COMMON_TIMEZONES])].filter(isValidTimeZone);
}

export function formatTimeZoneOffset(timeZone, locale = "en") {
  try {
    return (
      new Intl.DateTimeFormat(locale, {
        timeZone,
        timeZoneName: "shortOffset"
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}
