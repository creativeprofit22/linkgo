import { useMemo, useSyncExternalStore } from "react";
import {
  formatRouteHash,
  splitRouteHash,
  type RouteDefinition,
  type RouteParams,
} from "@/lib/navigation/route-contract";

/** localStorage key for the last opened main-window screen (id only). */
export const LAST_SCREEN_STORAGE_KEY = "linkgo.navigation.last-screen";

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash(): string {
  return window.location.hash;
}

/** True when the current link shows `route` with params that format to `hash`. */
function isShowing<Id extends string, Params extends RouteParams>(
  route: RouteDefinition<Id, Params>,
  hash: string,
): boolean {
  const { id, search } = splitRouteHash(window.location.hash);
  if (id !== route.id) return false;
  const result = route.search.safeParse(search);
  if (!result.success) return false;
  try {
    return formatRouteHash(route, result.data) === hash;
  } catch {
    // Parsed params that do not round-trip are simply not "the same link".
    return false;
  }
}

/**
 * Opens a screen. Pushing adds a history entry so back/forward work;
 * opening the screen that is already showing is a no-op.
 */
export function navigateTo<Id extends string, Params extends RouteParams>(
  route: RouteDefinition<Id, Params>,
  params?: Params,
  options: NavigateOptions = {},
): void {
  const hash = formatRouteHash(route, params);
  if (window.location.hash === hash) return;
  // Same screen and params behind a non-canonical link (`#drafts`, unsorted
  // or unknown keys): never push a duplicate; a replace may canonicalize it.
  if (isShowing(route, hash) && !options.replace) return;
  if (options.replace) {
    // replaceState does not fire hashchange, so announce it ourselves.
    window.history.replaceState(window.history.state, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = hash;
}

/** The current `location.hash`, re-rendering on every change. */
export function useHashLocation(): string {
  return useSyncExternalStore(subscribeToHash, readHash, () => "");
}

export interface RouteParamsState<Params extends RouteParams> {
  /** Validated params when this route is showing with a valid link. */
  params: Params | null;
  /** True when this route is showing but its link params were invalid. */
  linkIssue: boolean;
}

/** Reads this route's params from the current link, validated. */
export function useRouteParams<Id extends string, Params extends RouteParams>(
  route: RouteDefinition<Id, Params>,
): RouteParamsState<Params> {
  const hash = useHashLocation();
  return useMemo(() => {
    const { id, search } = splitRouteHash(hash);
    if (id !== route.id) return { params: null, linkIssue: false };
    const result = route.search.safeParse(search);
    return result.success
      ? { params: result.data, linkIssue: false }
      : { params: null, linkIssue: true };
  }, [hash, route]);
}

/** Last opened screen id if it is still one of `allowedIds`. */
export function readLastScreen<Id extends string>(
  allowedIds: readonly Id[],
  storageKey: string = LAST_SCREEN_STORAGE_KEY,
): Id | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return allowedIds.find((id) => id === stored) ?? null;
  } catch {
    return null;
  }
}

export function writeLastScreen(
  id: string,
  storageKey: string = LAST_SCREEN_STORAGE_KEY,
): void {
  try {
    window.localStorage.setItem(storageKey, id);
  } catch {
    // Storage can be unavailable (private mode, quota); restoring is optional.
  }
}
