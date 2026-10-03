// Protocol section 5.3 rule: a `site:` query can return results from other
// hosts (Google adds them). For matrix queries, keep only results on the
// query's platform (the site host, its subdomains, or known aliases such as
// youtu.be). Disconfirmation queries are open-web and are not filtered.
// Queries outside the frozen list (logged additions) are filtered by their
// own `site:` host when they have one.
import { normaliseHost, platformForHost } from "../dedupe.mjs";

const SITE = /(?:^|\s)site:(\S+)/i;

export function siteHostOf(queryText) {
  const match = SITE.exec(String(queryText ?? ""));
  return match ? normaliseHost(match[1]) : null;
}

function hostOf(link) {
  try {
    return normaliseHost(new URL(link).hostname);
  } catch {
    return null;
  }
}

/**
 * Decides which filter applies to a query.
 * `meta` is the frozen-list entry (or undefined); `queryText` the run input.
 * Returns { mode: "platform", platform } | { mode: "host", host } | { mode: "none" }.
 */
export function onsiteRule(meta, queryText) {
  if (meta?.kind === "matrix")
    return { mode: "platform", platform: meta.platform };
  if (meta?.kind === "disconfirmation") return { mode: "none" };
  const host = siteHostOf(queryText ?? meta?.query);
  return host ? { mode: "host", host } : { mode: "none" };
}

export function isOnSite(link, rule, platforms) {
  if (rule.mode === "none") return true;
  const host = hostOf(link);
  if (!host) return false;
  if (rule.mode === "platform") {
    return platformForHost(host, platforms) === rule.platform;
  }
  return host === rule.host || host.endsWith(`.${rule.host}`);
}

/**
 * Finds the frozen-list entry for a run envelope: by id, then by the exact
 * query text (pilot ids carry an `sNN-` prefix). Unknown queries -> undefined.
 */
export function queryResolver(queries) {
  const byId = new Map(queries.map((q) => [q.id, q]));
  const byText = new Map(queries.map((q) => [q.query, q]));
  return (queryId, input) =>
    byId.get(queryId) ??
    (typeof input === "string" ? byText.get(input) : undefined) ??
    byId.get(String(queryId).replace(/^[a-z]\d+-/, ""));
}

/** Splits SERP results into kept (on-site) and dropped (off-site). */
export function splitOnSite(results, rule, platforms) {
  const kept = [];
  const dropped = [];
  for (const r of results) {
    (isOnSite(r.link, rule, platforms) ? kept : dropped).push(r);
  }
  return { kept, dropped };
}
