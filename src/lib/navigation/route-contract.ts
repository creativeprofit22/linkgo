import { z } from "zod";

/**
 * Typed in-app links for the main window. See
 * docs/decisions/0001-in-app-navigation.md and docs/features/navigation.md.
 *
 * Link shape: `#/<screen-id>?<key>=<value>` with sorted keys. This module is
 * Zod-only (no React) so feature contracts (`schemas.ts`) can import it.
 */

/** Values a route param may hold once validated. */
export type RouteParamValue = string | number | boolean | undefined;

/** Validated params of one screen. */
export type RouteParams = Readonly<Record<string, RouteParamValue>>;

/**
 * The slice of a Zod schema the router needs. Kept structural so a route with
 * specific params is still assignable to a list of generic routes.
 */
export interface RouteSearchSchema<Params extends RouteParams> {
  safeParse(
    input: unknown,
  ): { success: true; data: Params } | { success: false; error: unknown };
}

/** One addressable screen, declared by the feature that owns it. */
export interface RouteDefinition<
  Id extends string = string,
  Params extends RouteParams = RouteParams,
> {
  readonly id: Id;
  /** Validates raw string search values into typed params. */
  readonly search: RouteSearchSchema<Params>;
}

/** Result of reading a link. Never throws; every failure has a kind. */
export type ParsedRoute<Id extends string = string> =
  | { kind: "ok"; routeId: Id; params: RouteParams }
  | { kind: "unknown-screen"; routeId: Id; requestedId: string }
  | { kind: "invalid-params"; routeId: Id; params: RouteParams };

const ROUTE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Screen ids appear in links, so keep them to lowercase slug characters. */
export function defineRoute<Id extends string, Params extends RouteParams>(
  id: Id,
  search: RouteSearchSchema<Params>,
): RouteDefinition<Id, Params> {
  if (!ROUTE_ID_PATTERN.test(id)) {
    throw new Error(`Route id "${id}" must be a lowercase slug.`);
  }
  return Object.freeze({ id, search });
}

/** Schema for screens that take no params; unknown keys are dropped. */
export function emptyRouteSearch(): RouteSearchSchema<Record<string, never>> {
  return z.object({});
}

/** Required positive integer id read from a link string. */
export function routeId(): z.ZodCoercedNumber {
  return z.coerce.number().int().positive();
}

/** Optional positive integer id read from a link string. */
export function optionalRouteId(): z.ZodOptional<z.ZodCoercedNumber> {
  return routeId().optional();
}

/**
 * Optional one-shot action flag (`?write=1`). Only the literal "1" is valid,
 * so `true`, `yes` or `0` are rejected rather than guessed at.
 */
export function optionalRouteFlag(): z.ZodOptional<z.ZodLiteral<"1">> {
  return z.literal("1").optional();
}

/**
 * Builds the link for a screen. Outgoing params are checked against the
 * route's own schema (as the strings the link will carry), so a link the
 * destination would reject throws here instead of shipping broken. Invalid
 * params are a programmer bug, not user input.
 */
export function formatRouteHash<Id extends string, Params extends RouteParams>(
  route: RouteDefinition<Id, Params>,
  params?: Params,
): string {
  const entries = Object.entries(params ?? {})
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined,
    )
    .map(([key, value]): [string, string] => [key, String(value)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (!route.search.safeParse(Object.fromEntries(entries)).success) {
    throw new Error(`Invalid link params for route "${route.id}".`);
  }
  if (entries.length === 0) return `#/${route.id}`;
  return `#/${route.id}?${new URLSearchParams(entries).toString()}`;
}

/** Splits `#/drafts?a=1` into the screen id and raw search values. */
export function splitRouteHash(hash: string): {
  id: string;
  search: Record<string, string>;
} {
  const body = hash.replace(/^#/, "").replace(/^\//, "");
  const queryStart = body.indexOf("?");
  const rawId = queryStart === -1 ? body : body.slice(0, queryStart);
  const rawQuery = queryStart === -1 ? "" : body.slice(queryStart + 1);
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    // First value wins so repeated keys cannot smuggle a second meaning.
    if (!(key in search)) search[key] = value;
  }
  return { id, search };
}

export function parseRouteHash<Id extends string>(
  hash: string,
  routes: readonly RouteDefinition<Id>[],
  defaultRouteId: Id,
): ParsedRoute<Id> {
  const { id, search } = splitRouteHash(hash);
  const route = routes.find((candidate) => candidate.id === id);
  if (!route) {
    return { kind: "unknown-screen", routeId: defaultRouteId, requestedId: id };
  }
  const result = route.search.safeParse(search);
  if (!result.success) {
    return { kind: "invalid-params", routeId: route.id, params: {} };
  }
  return { kind: "ok", routeId: route.id, params: result.data };
}
