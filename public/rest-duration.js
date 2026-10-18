const MINUTES_PER_DAY = 24 * 60;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesRemainingInDay(time) {
  const match = CLOCK_PATTERN.exec(String(time ?? ""));
  if (!match) return null;
  return MINUTES_PER_DAY - Number(match[1]) * 60 - Number(match[2]);
}
