import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

/**
 * Tauri v2 rejects `invoke` with the raw `Err(String)` payload of a native
 * command, not an `Error`. Normalize every rejection so callers can rely on
 * `error.message` carrying the native domain message.
 */
export function toNativeCommandError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim() !== "") return new Error(value);
  // `ErrorOptions` is not in the configured lib; attach `cause` explicitly.
  return Object.assign(new Error("Native command failed"), { cause: value });
}

/** Invokes a native command and rejects only with `Error` instances. */
export async function invokeCommand<T = unknown>(
  command: string,
  args?: InvokeArgs,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    throw toNativeCommandError(error);
  }
}
