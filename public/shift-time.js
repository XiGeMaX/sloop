const MINUTES_PER_DAY = 24 * 60;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MAX_END_DAY_OFFSET = 7;

function clockMinutes(value) {
  const match = CLOCK_PATTERN.exec(String(value ?? ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function inferEndDayOffset(start, end) {
  const startMinutes = clockMinutes(start);
  const endMinutes = clockMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return endMinutes <= startMinutes ? 1 : 0;
}

export function normalizeEndDayOffset(value, start, end, kind = "work") {
  if (kind === "off") return 0;
  const offset = Number(value);
  if (Number.isInteger(offset) && offset >= 0 && offset <= MAX_END_DAY_OFFSET) {
    return offset;
  }
  return inferEndDayOffset(start, end);
}

export function shiftDurationMinutes(shift) {
  const startMinutes = clockMinutes(shift?.start);
  const endMinutes = clockMinutes(shift?.end);
  const offset = Number(shift?.endDayOffset);
  if (
    startMinutes === null ||
    endMinutes === null ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > MAX_END_DAY_OFFSET
  ) {
    return 0;
  }
  return offset * MINUTES_PER_DAY + endMinutes - startMinutes;
}
