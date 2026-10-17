/// <reference types="node" />
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/** Reads one shared Rust/fake contract from tests/fixtures. */
/** Callers cast the result to the table shape they read. */
export function readContract(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  );
}

/** A contract case: `base` with the case's overrides applied. */
export function withOverrides<T extends object>(
  base: T,
  overrides: Partial<T> | undefined,
): T {
  return { ...base, ...overrides };
}

export type GateExpectation = { ok: true } | { error: string };

/** Calls one of the fake's pure gates (see `__LINKGO_CONTRACT_GATES__`). */
export function callFakeGate<R>(
  page: Page,
  gate: string,
  args: unknown[],
): Promise<R> {
  return page.evaluate(
    ({ gate, args }) => {
      const gates = (
        window as unknown as {
          __LINKGO_CONTRACT_GATES__: Record<
            string,
            (...values: unknown[]) => unknown
          >;
        }
      ).__LINKGO_CONTRACT_GATES__;
      const fn = gates[gate];
      if (fn === undefined) throw new Error(`Unknown fake gate ${gate}`);
      return fn(...args);
    },
    { gate, args },
  ) as Promise<R>;
}
