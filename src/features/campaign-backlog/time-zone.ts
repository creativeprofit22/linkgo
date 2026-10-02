const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const utcValue = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const normalized = new Date(utcValue);
  if (
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() + 1 !== parts.month ||
    normalized.getUTCDate() !== parts.day ||
    normalized.getUTCHours() !== parts.hour ||
    normalized.getUTCMinutes() !== parts.minute
  ) {
    return null;
  }
  return parts;
}

function getPartsAt(instant: number, timeZone: string): LocalDateTimeParts {
  const values = new Map(
    getFormatter(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  };
}

function partsEqual(
  left: LocalDateTimeParts,
  right: LocalDateTimeParts,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function getOffsetMilliseconds(instant: number, timeZone: string): number {
  const parts = getPartsAt(instant, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return localAsUtc - Math.floor(instant / 60_000) * 60_000;
}

function findMatchingInstants(
  localAsUtc: number,
  localParts: LocalDateTimeParts,
  timeZone: string,
): number[] {
  const twoDays = 2 * 86_400_000;
  const offsets = new Set([
    getOffsetMilliseconds(localAsUtc - twoDays, timeZone),
    getOffsetMilliseconds(localAsUtc, timeZone),
    getOffsetMilliseconds(localAsUtc + twoDays, timeZone),
  ]);

  return [...offsets]
    .map((offset) => localAsUtc - offset)
    .filter((instant) => partsEqual(getPartsAt(instant, timeZone), localParts))
    .sort((left, right) => left - right);
}

export function getCurrentIanaTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isIanaTimeZone(timeZone) ? timeZone : "UTC";
}

export function getSupportedIanaTimeZones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const current = getCurrentIanaTimeZone();
  const values = supportedValuesOf?.("timeZone") ?? [];
  return [...new Set([current, "UTC", ...values])].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function isIanaTimeZone(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function formatUtcAsDateTimeLocal(
  isoTimestamp: string,
  timeZone: string,
): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime()) || !isIanaTimeZone(timeZone)) return "";
  const parts = getPartsAt(date.getTime(), timeZone);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localDateTimeToUtc(
  localDateTime: string,
  timeZone: string,
): string {
  const parts = parseLocalDateTime(localDateTime);
  if (!parts || !isIanaTimeZone(timeZone)) {
    throw new Error("Enter a valid date, time, and time zone");
  }

  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const matches = findMatchingInstants(localAsUtc, parts, timeZone);
  if (matches[0] !== undefined) return new Date(matches[0]).toISOString();

  const twoDays = 2 * 86_400_000;
  const beforeOffset = getOffsetMilliseconds(localAsUtc - twoDays, timeZone);
  const afterOffset = getOffsetMilliseconds(localAsUtc + twoDays, timeZone);
  const forwardGap = afterOffset - beforeOffset;
  if (forwardGap <= 0) {
    throw new Error(
      "That time doesn't exist in this time zone (often because of a clock change). Pick a different time.",
    );
  }

  const shiftedLocalAsUtc = localAsUtc + forwardGap;
  const shiftedDate = new Date(shiftedLocalAsUtc);
  const shiftedParts: LocalDateTimeParts = {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
    hour: shiftedDate.getUTCHours(),
    minute: shiftedDate.getUTCMinutes(),
  };
  const shiftedMatches = findMatchingInstants(
    shiftedLocalAsUtc,
    shiftedParts,
    timeZone,
  );
  if (shiftedMatches[0] === undefined) {
    throw new Error(
      "That time doesn't exist in this time zone (often because of a clock change). Pick a different time.",
    );
  }
  return new Date(shiftedMatches[0]).toISOString();
}
