import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";

/** sessionStorage key prefix for remembered dialog forms. */
export const SESSION_FORM_KEY_PREFIX = "linkgo.form.";

function readStored<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const result = schema.safeParse(JSON.parse(raw));
    if (result.success) return result.data;
    window.sessionStorage.removeItem(key);
    return null;
  } catch {
    // Unavailable storage or bad JSON: start fresh, never block the form.
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: remembering is optional.
  }
}

function removeStored(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

interface StoredState<T> {
  key: string | null;
  value: T;
  /** Only edited forms are written, so opening a dialog stores nothing. */
  dirty: boolean;
}

function isUpdater<T>(next: T | ((value: T) => T)): next is (value: T) => T {
  return typeof next === "function";
}

export interface SessionFormState<T> {
  value: T;
  setValue: (next: T | ((current: T) => T)) => void;
  /** Forget the remembered form and go back to `initial`. */
  clear: () => void;
}

/**
 * Form state that survives Cancel, closing a dialog and browser Back for the
 * rest of this window session. Stored under `linkgo.form.<key>` in
 * sessionStorage, validated with `schema` on read (bad data is dropped).
 * Changing `key` loads that key's remembered form or `initial`. Pass
 * `key: null` to keep state in memory only. Never logs the stored text.
 * `initial` runs whenever there is nothing (valid) remembered for the key.
 */
export function useSessionFormState<T>(
  key: string | null,
  schema: z.ZodType<T>,
  initial: () => T,
): SessionFormState<T> {
  const storageKey = key === null ? null : `${SESSION_FORM_KEY_PREFIX}${key}`;
  const load = (forKey: string | null): T =>
    (forKey === null ? null : readStored(forKey, schema)) ?? initial();

  const [state, setState] = useState<StoredState<T>>(() => ({
    key: storageKey,
    value: load(storageKey),
    dirty: false,
  }));

  // Switching to another item loads that item's form during render so the
  // old item's text never flashes or gets written under the new key.
  let current = state;
  if (state.key !== storageKey) {
    current = { key: storageKey, value: load(storageKey), dirty: false };
    setState(current);
  }

  useEffect(() => {
    if (current.key === null || !current.dirty) return;
    writeStored(current.key, current.value);
  }, [current]);

  const setValue = useCallback((next: T | ((value: T) => T)): void => {
    setState((previous) => ({
      key: previous.key,
      value: isUpdater(next) ? next(previous.value) : next,
      dirty: true,
    }));
  }, []);

  const clear = (): void => {
    if (storageKey !== null) removeStored(storageKey);
    setState({ key: storageKey, value: initial(), dirty: false });
  };

  return { value: current.value, setValue, clear };
}
