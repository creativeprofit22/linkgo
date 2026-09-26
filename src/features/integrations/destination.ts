/**
 * Renderer-side hint for when to ask for local-endpoint consent. The native
 * destination policy (`src-tauri/src/net/destination.rs`) is authoritative;
 * this only decides whether the consent checkbox is shown.
 */

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet))) return false;
  const [a = -1, b = -1] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  if (!host.startsWith("[")) return false;
  const address = host.slice(1, -1).toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1] !== undefined) return isPrivateIpv4(mapped[1]);
  return (
    address === "::1" ||
    address === "::" ||
    address.startsWith("::ffff:") ||
    /^f[cd][0-9a-f]{0,2}:/.test(address) ||
    /^fe[89ab][0-9a-f]?:/.test(address)
  );
}

/** True when the Base URL targets this computer, a private network or plain HTTP. */
export function needsLocalDestinationConsent(rawBaseUrl: string): boolean {
  const trimmed = rawBaseUrl.trim();
  if (trimmed === "") return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol === "http:") return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  );
}
