/**
 * SSRF policy for runtime axe audits.
 * Classification via isomorphic `ssrf-guard` (hostname + resolved IPs).
 * Do not import `ssrf-guard/node`: it loads undici 8 (`webidl.util.markAsUncloneable`),
 * which Next SSR evaluates on any page that imports assessment actions.
 * Playwright does its own DNS anyway, so undici IP pinning cannot apply.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { PublicError, publicMessage } from "@/core/public-error";
import {
  isPublicHostname,
  validateResolvedAddresses,
  type BlockedHostnamePolicy,
} from "ssrf-guard";

export const UNSAFE_RUNTIME_URL_MESSAGE =
  "Runtime audit URL cannot target localhost, private, or metadata hosts.";

export const UNSAFE_RUNTIME_PORT_MESSAGE =
  "Runtime audit URL must use port 80 or 443 (or the scheme default).";

export const TOO_MANY_REDIRECTS_MESSAGE =
  "Runtime audit stopped: too many redirects while loading the page.";

/** Extra hosts beyond ssrf-guard's built-in localhost/.local policy. */
const EXTRA_BLOCKED_HOSTNAMES: BlockedHostnamePolicy = {
  exact: ["metadata.google.internal", "metadata.goog", "metadata"],
  suffixes: [".internal"],
};

/** Allowed explicit ports for preview audits (scheme defaults always OK). */
const ALLOWED_PORTS = new Set(["80", "443"]);

/** Max redirect/navigation hops per page load (document + intermediate). */
const MAX_RUNTIME_REDIRECT_HOPS = 10;

export type DnsLookup = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

const nodeDnsLookup: DnsLookup = (hostname) =>
  dns.lookup(hostname, { all: true });

function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new PublicError("Enter a valid http(s) preview URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PublicError("Runtime audit URL must be http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new PublicError("Runtime audit URL must not include credentials.");
  }
  return parsed;
}

function assertPublicHostname(hostname: string): void {
  if (
    !isPublicHostname(hostname, { blockedHostnames: EXTRA_BLOCKED_HOSTNAMES })
  ) {
    throw new PublicError(UNSAFE_RUNTIME_URL_MESSAGE);
  }
}

function assertAllowedPort(parsed: URL): void {
  // Empty port means scheme default (80/443) — always allowed.
  if (!parsed.port) return;
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new PublicError(UNSAFE_RUNTIME_PORT_MESSAGE);
  }
}

/** Sync check for form saves: scheme, credentials, port, and literal private hosts. */
export function assertSafeRuntimeBaseUrl(raw: string): string {
  const parsed = parseHttpUrl(raw);
  assertPublicHostname(parsed.hostname);
  assertAllowedPort(parsed);
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Full SSRF check before Playwright navigation (and each redirect hop).
 * Injectable `lookup` is for tests; production uses Node DNS.
 */
export async function assertSafeRuntimeUrl(
  raw: string,
  options?: { lookup?: DnsLookup },
): Promise<string> {
  const parsed = parseHttpUrl(raw);
  assertPublicHostname(parsed.hostname);
  assertAllowedPort(parsed);

  const hostname = parsed.hostname;
  // Literal IPs already covered by isPublicHostname; no DNS needed.
  if (net.isIP(hostname) !== 0) {
    return parsed.href;
  }

  const lookup = options?.lookup ?? nodeDnsLookup;
  let records: ReadonlyArray<{ address: string; family: number }>;
  try {
    records = await lookup(hostname);
  } catch {
    throw new PublicError("Runtime audit URL could not be resolved.");
  }
  if (records.length === 0) {
    throw new PublicError("Runtime audit URL could not be resolved.");
  }
  try {
    validateResolvedAddresses(parsed.href, hostname, records);
  } catch {
    throw new PublicError(UNSAFE_RUNTIME_URL_MESSAGE);
  }
  return parsed.href;
}

/** Route-handler helper for Playwright navigation/redirect hops. */
export async function allowRuntimeNavigation(
  url: string,
  options?: { lookup?: DnsLookup },
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await assertSafeRuntimeUrl(url, options);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: publicMessage(error, UNSAFE_RUNTIME_URL_MESSAGE),
    };
  }
}

/**
 * Tracks document/redirect hops for one page load.
 * Call `countHop` for each main-frame document request; throws when over limit.
 */
export function createRedirectHopGuard(
  maxHops: number = MAX_RUNTIME_REDIRECT_HOPS,
): {
  countHop: (resourceType: string) => void;
  hops: () => number;
} {
  let hops = 0;
  return {
    countHop(resourceType: string) {
      if (resourceType !== "document") return;
      hops += 1;
      if (hops > maxHops) {
        throw new PublicError(TOO_MANY_REDIRECTS_MESSAGE);
      }
    },
    hops: () => hops,
  };
}
