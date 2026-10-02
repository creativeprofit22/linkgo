import { expect, test } from "@playwright/test";

import { toDateTimeLocalValue } from "../src/features/content-calendar/components/create-content-calendar-slot-dialog";

const cases: ReadonlyArray<{
  name: string;
  value: string;
  timezone: string;
  expected: string;
}> = [
  {
    name: "T separator",
    value: "2026-11-02T09:30",
    timezone: "local",
    expected: "2026-11-02T09:30",
  },
  {
    name: "space separator",
    value: "2026-11-02 09:30",
    timezone: "local",
    expected: "2026-11-02T09:30",
  },
  {
    name: "space separator with seconds",
    value: "2026-11-02 09:30:00",
    timezone: "local",
    expected: "2026-11-02T09:30",
  },
  {
    name: "fractional seconds, surrounding whitespace",
    value: "  2026-11-02T09:30:15.123456 ",
    timezone: "Europe/Berlin",
    expected: "2026-11-02T09:30",
  },
  {
    name: "Z suffix converted to UTC wall clock",
    value: "2026-11-02T09:30:00.000Z",
    timezone: "UTC",
    expected: "2026-11-02T09:30",
  },
  {
    name: "Z suffix converted to schedule zone",
    value: "2026-11-02T09:30:00.000Z",
    timezone: "America/New_York",
    expected: "2026-11-02T04:30",
  },
  {
    name: "offset converted to schedule zone",
    value: "2026-11-02T09:30+01:00",
    timezone: "UTC",
    expected: "2026-11-02T08:30",
  },
  {
    name: "offset matching schedule zone keeps wall clock",
    value: "2026-11-02T09:30+01:00",
    timezone: "Europe/Berlin",
    expected: "2026-11-02T09:30",
  },
  {
    name: "offset crossing midnight",
    value: "2026-11-02 23:45:00-05:00",
    timezone: "UTC",
    expected: "2026-11-03T04:45",
  },
  {
    name: "offset with unknown zone",
    value: "2026-11-02T09:30+01:00",
    timezone: "Not/AZone",
    expected: "",
  },
  { name: "garbage", value: "next tuesday", timezone: "local", expected: "" },
  { name: "empty", value: "", timezone: "local", expected: "" },
  {
    name: "date only",
    value: "2026-11-02",
    timezone: "local",
    expected: "",
  },
  {
    name: "malformed offset",
    value: "2026-11-02T09:30+0100",
    timezone: "UTC",
    expected: "",
  },
  {
    name: "trailing junk",
    value: "2026-11-02T09:30 tomorrow",
    timezone: "local",
    expected: "",
  },
];

test.describe("toDateTimeLocalValue", () => {
  for (const { name, value, timezone, expected } of cases) {
    test(`${name}: ${JSON.stringify(value)} in ${timezone}`, () => {
      expect(toDateTimeLocalValue(value, timezone)).toBe(expected);
    });
  }

  test("offset in local zone matches the device wall clock", () => {
    const instant = new Date("2026-11-02T09:30:00Z");
    const pad = (n: number): string => String(n).padStart(2, "0");
    const expected = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
    expect(toDateTimeLocalValue("2026-11-02T09:30:00Z", "local")).toBe(
      expected,
    );
    expect(toDateTimeLocalValue("2026-11-02T09:30:00Z")).toBe(expected);
  });
});
