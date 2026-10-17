# 0006 — All outbound network calls run in Rust

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: model providers, LinkedIn, Bright Data, OAuth; the webview CSP.

## Context

The app holds OAuth tokens and API keys and calls user-configurable Base URLs.
A webview `fetch` would need those secrets in JavaScript and could reach
private network addresses (SSRF) if a URL is attacker-influenced.

## Options compared

| Option                                     | Fit                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Frontend `fetch` with CSP allow-list       | Simple, but secrets enter the renderer and every new host widens the CSP.   |
| Tauri HTTP plugin from the frontend        | Bypasses CSP, but secrets and URL checks still live in JavaScript.          |
| Rust-only transport (`src-tauri/src/net/`) | Secrets stay in Rust; one place blocks private addresses and sets timeouts. |

## Decision

The renderer's CSP `connect-src` stays `'self' ipc: http://ipc.localhost`
(`scripts/check-csp.test.mjs`, run by `check:architecture`). Every outbound call
uses the Rust `net/` transport, which blocks private addresses unless a
credential has explicit local-destination consent.

## Consequences

- New integrations need a Rust command; the frontend never gets a host.
- The dev CSP adds only the coupled Vite ports (17420/17421).
