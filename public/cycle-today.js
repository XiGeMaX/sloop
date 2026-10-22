function dateKeyInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  if (!values.year || !values.month || !values.day) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyDayNumber(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  return Date.UTC(year, month - 1, day) / 86400000;
}

export function projectCycleIndex({
  savedAt,
  now = new Date(),
  timeZone,
  savedIndex,
  cycleLength
}) {
  const length = Math.max(1, Math.trunc(Number(cycleLength) || 1));
  const index = ((Math.trunc(Number(savedIndex) || 0) % length) + length) % length;
  const savedDate = dateKeyInTimeZone(savedAt, timeZone);
  const today = dateKeyInTimeZone(now, timeZone);
  const savedDay = dateKeyDayNumber(savedDate);
  const todayDay = dateKeyDayNumber(today);
  if (savedDay === null || todayDay === null) return index;

  const elapsedDays = Math.max(0, Math.round(todayDay - savedDay));
  return (index + elapsedDays) % length;
}
