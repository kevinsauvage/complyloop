/**
 * SSRF policy for runtime axe audits.
 * Classification via `ssrf-guard`; this module maps failures to product-safe
 * errors and keeps an injectable lookup for tests (Playwright cannot use
 * undici IP pinning).
 */

import {
  isPublicHostname,
  validateResolvedAddresses,
  type BlockedHostnamePolicy,
} from "ssrf-guard";
import { UnsafeUrlError, validateUrl } from "ssrf-guard/node";
import net from "node:net";

export const UNSAFE_RUNTIME_URL_MESSAGE =
  "Runtime audit URL cannot target localhost, private, or metadata hosts.";

/** Extra hosts beyond ssrf-guard's built-in localhost/.local policy. */
const EXTRA_BLOCKED_HOSTNAMES: BlockedHostnamePolicy = {
  exact: ["metadata.google.internal", "metadata.goog", "metadata"],
  suffixes: [".internal"],
};

// `validateUrl` does not merge the localhost policy — pass the full set.
const VALIDATE_URL_POLICY: BlockedHostnamePolicy = {
  exact: ["localhost", ...EXTRA_BLOCKED_HOSTNAMES.exact],
  suffixes: [".localhost", ".local", ...EXTRA_BLOCKED_HOSTNAMES.suffixes],
};

export type DnsLookup = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid http(s) preview URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Runtime audit URL must be http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Runtime audit URL must not include credentials.");
  }
  return parsed;
}

function assertPublicHostname(hostname: string): void {
  if (
    !isPublicHostname(hostname, { blockedHostnames: EXTRA_BLOCKED_HOSTNAMES })
  ) {
    throw new Error(UNSAFE_RUNTIME_URL_MESSAGE);
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
 * Injectable `lookup` is for tests; production uses `validateUrl`.
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

  if (options?.lookup) {
    let records: ReadonlyArray<{ address: string; family: number }>;
    try {
      records = await options.lookup(hostname);
    } catch {
      throw new Error("Runtime audit URL could not be resolved.");
    }
    if (records.length === 0) {
      throw new Error("Runtime audit URL could not be resolved.");
    }
    try {
      validateResolvedAddresses(parsed.href, hostname, records);
    } catch {
      throw new Error(UNSAFE_RUNTIME_URL_MESSAGE);
    }
    return parsed.href;
  }

  try {
    await validateUrl(parsed.href, { blockedHostnames: VALIDATE_URL_POLICY });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw new Error(UNSAFE_RUNTIME_URL_MESSAGE);
    }
    throw new Error("Runtime audit URL could not be resolved.");
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
      message:
        error instanceof Error ? error.message : UNSAFE_RUNTIME_URL_MESSAGE,
    };
  }
}
