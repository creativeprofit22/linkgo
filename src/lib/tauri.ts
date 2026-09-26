import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { isBrowserPreview } from "@/lib/env";

/** User-facing guidance shown when a desktop-only operation runs in a browser. */
export const DESKTOP_REQUIRED_MESSAGE =
  "Not available in the browser preview. Linkgo saves data only in the desktop app — run `bun run tauri:dev`.";

/**
 * Raised instead of calling a native command when the renderer runs in a plain
 * browser. Distinguishes preview restrictions from real desktop failures.
 */
export class DesktopRequiredError extends Error {
  override readonly name = "DesktopRequiredError";
  /** Native command or plugin the browser preview blocked, when known. */
  readonly command: string | undefined;

  constructor(command?: string) {
    super(DESKTOP_REQUIRED_MESSAGE);
    this.command = command;
  }
}

export function isDesktopRequiredError(
  error: unknown,
): error is DesktopRequiredError {
  return (
    error instanceof DesktopRequiredError ||
    (error instanceof Error && error.name === "DesktopRequiredError")
  );
}

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
  if (isBrowserPreview()) throw new DesktopRequiredError(command);
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    throw toNativeCommandError(error);
  }
}
