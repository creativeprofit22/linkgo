import { expect, test } from "@playwright/test";

import {
  createFocusRefreshGate,
  FOCUS_REFRESH_MIN_INTERVAL_MS,
} from "../src/lib/data-change-events";

test("focus refresh gate allows the first re-read, then waits for the interval", () => {
  let now = 1_000;
  const gate = createFocusRefreshGate(FOCUS_REFRESH_MIN_INTERVAL_MS, () => now);

  expect(gate.isDue()).toBe(true);
  gate.markRefreshed();
  expect(gate.isDue()).toBe(false);

  now += FOCUS_REFRESH_MIN_INTERVAL_MS - 1;
  expect(gate.isDue()).toBe(false);

  now += 1;
  expect(gate.isDue()).toBe(true);
});
