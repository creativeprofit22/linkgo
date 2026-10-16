/**
 * Wall-clock schedule times (`YYYY-MM-DDTHH:mm`) shared by the scheduling
 * screens. Values are split into parts, never parsed as UTC, so a picked time
 * never shifts to a different moment.
 */

/**
 * Stored schedule formats accepted natively (`is_supported_timestamp`):
 * `YYYY-MM-DD[T ]HH:MM[:SS[.fff]]` with an optional `Z` or `±HH:MM` suffix.
 */
const scheduleTimestampPattern =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

const wallClockPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface WallClockParts {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** True for "", "local" (any case): the device's own time zone. */
export function isLocalTimeZone(timezone: string): boolean {
  const zone = timezone.trim();
  return zone === "" || zone.toLowerCase() === "local";
}

/** The device's IANA time zone, or "" when the runtime can't tell. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

/** True when Intl knows the zone ("local" always counts). */
export function isKnownTimeZone(timezone: string): boolean {
  if (isLocalTimeZone(timezone)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock `YYYY-MM-DDTHH:mm` of an instant in a zone; "" if unknown. */
export function toZonedWallClock(instant: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: isLocalTimeZone(timezone) ? undefined : timezone.trim(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    const value = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    return wallClockPattern.test(value) ? value : "";
  } catch {
    // RangeError: the stored time zone isn't one Intl knows.
    return "";
  }
}

/**
 * `datetime-local` value (`YYYY-MM-DDTHH:mm`) from a stored schedule time.
 * `T` or space separators are accepted; seconds are dropped. A `Z` or
 * `±HH:MM` suffix is converted to the wall clock in `timezone` ("local"
 * means the device zone), or "" when the zone is unknown, so the shown
 * time never silently shifts to a different moment.
 */
export function toDateTimeLocalValue(
  value: string,
  timezone = "local",
): string {
  const match = scheduleTimestampPattern.exec(value.trim());
  if (!match) return "";
  const [, date, time, seconds, offset] = match;
  if (date === undefined || time === undefined) return "";
  const wallClock = `${date}T${time}`;
  if (offset === undefined) return wallClock;
  const instant = new Date(`${wallClock}:${seconds ?? "00"}${offset}`);
  if (Number.isNaN(instant.getTime())) return "";
  return toZonedWallClock(instant, timezone);
}

/** Parts of a `YYYY-MM-DDTHH:mm` value; null when malformed or impossible. */
export function parseWallClock(value: string): WallClockParts | null {
  const match = wallClockPattern.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return null;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

/** `YYYY-MM-DD` from parts. */
export function formatWallClockDate(
  parts: Pick<WallClockParts, "year" | "month" | "day">,
): string {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** `HH:mm` from parts. */
export function formatWallClockTime(
  parts: Pick<WallClockParts, "hour" | "minute">,
): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Joins a `YYYY-MM-DD` date and an `HH:mm` time into a wall-clock value. */
export function joinWallClock(date: string, time: string): string {
  return `${date}T${time}`;
}

/**
 * Human-readable wall clock, e.g. "Mon, 2 Nov 2026, 09:30". Formatting uses
 * UTC on purpose: the parts are already the wall clock, so no zone shift.
 * Falls back to the raw value when it can't be read.
 */
export function formatWallClockForDisplay(
  value: string,
  timezone = "local",
  locale?: string,
): string {
  const parts = parseWallClock(toDateTimeLocalValue(value, timezone));
  if (parts === null) return value;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(
    new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
      ),
    ),
  );
}

/** Plain label for a stored zone: the device zone name for "local". */
export function describeTimeZone(timezone: string): string {
  if (!isLocalTimeZone(timezone)) return timezone.trim();
  const device = getDeviceTimeZone();
  return device === "" ? "This computer's time zone" : device;
}
