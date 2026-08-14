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

/** Extra hosts beyond ssrf-guard's built-in localhost/.local policy. */
const EXTRA_BLOCKED_HOSTNAMES: BlockedHostnamePolicy = {
  exact: ["metadata.google.internal", "metadata.goog", "metadata"],
  suffixes: [".internal"],
};

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

/** Sync check for form saves: scheme, credentials, and literal private hosts. */
export function assertSafeRuntimeBaseUrl(raw: string): string {
  const parsed = parseHttpUrl(raw);
  assertPublicHostname(parsed.hostname);
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
