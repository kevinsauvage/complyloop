import { isPublicError } from "../contract/public-error.ts";
import { TOO_MANY_REDIRECTS_MESSAGE } from "./url-safety.ts";

export const RUNTIME_SCAN_FAILED_MESSAGE = "Runtime scan failed.";

interface RuntimeScanErrorPattern {
  test: (raw: string, name: string) => boolean;
  message: string;
}

const PATTERNS: RuntimeScanErrorPattern[] = [
  {
    test: (raw) => /ERR_TOO_MANY_REDIRECTS/.test(raw),
    message: TOO_MANY_REDIRECTS_MESSAGE,
  },
  {
    // Vercel file tracing omits sparticuz's non-JS `bin/` assets unless
    // `outputFileTracingIncludes` covers the scanning route (see
    // next.config.ts). Actionable on purpose: the fix is in the bundle, not
    // the preview URL. Must precede the generic sparticuz pattern below.
    test: (raw) => /@sparticuz\/chromium\/bin/.test(raw),
    message:
      "The serverless browser package is incomplete in this deployment (missing @sparticuz/chromium binaries). The deploy needs outputFileTracingIncludes for the scanning route — redeploy after fixing the bundle, not the preview URL.",
  },
  {
    // `resolveAxeMinJsPath` loads `axe-core/axe.min.js` from disk via
    // `require.resolve` (the `source` string breaks under Next/webpack), so
    // file tracing omits it unless `outputFileTracingIncludes` covers it
    // (see next.config.ts). Actionable on purpose: the fix is in the bundle,
    // not the preview URL. Must precede the generic fallback below; matches
    // only module-resolution failures, never raw filesystem paths.
    test: (raw) => /Cannot find module ['"]axe-core\//.test(raw),
    message:
      "The accessibility engine is incomplete in this deployment (missing axe-core bundle). The deploy needs outputFileTracingIncludes for axe-core/axe.min.js — redeploy after fixing the bundle, not the preview URL.",
  },
  {
    test: (raw) => /ERR_CONNECTION_REFUSED/.test(raw),
    message:
      "Could not connect to the preview URL (connection refused). Confirm it is up and publicly reachable.",
  },
  {
    test: (raw) => /ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/.test(raw),
    message: "Could not resolve the preview URL hostname. Check the DNS name.",
  },
  {
    test: (raw, name) =>
      name === "TimeoutError" ||
      /Timeout \d+ms exceeded/i.test(raw) ||
      /ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_ADDRESS_UNREACHABLE/.test(
        raw,
      ),
    message:
      "Timed out loading the preview URL. The page may be down, require sign-in, or keep network connections open.",
  },
  {
    test: (raw) => /ERR_CERT_|ERR_SSL_|ERR_TLS_/.test(raw),
    message:
      "TLS/SSL error loading the preview URL. Check that the certificate is valid for that host.",
  },
  {
    test: (raw) =>
      /ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(raw),
    message:
      "The preview URL closed the connection before the page finished loading.",
  },
  {
    test: (raw) =>
      /Executable doesn't exist/i.test(raw) ||
      /browserType\.launch/i.test(raw) ||
      /sparticuz/i.test(raw),
    message: "Could not start the browser used for preview audits.",
  },
];

/** Origin + path only — never query strings (preview tokens) or filesystem paths. */
function previewUrlHint(raw: string): string | undefined {
  const match = raw.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return undefined;
  try {
    const parsed = new URL(match[0].replace(/[.,;:]+$/, ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    const path =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${path}`;
  } catch {
    return undefined;
  }
}

/** Maps Playwright/Chromium failures to user-safe copy. Never returns raw paths. */
export function classifyRuntimeScanError(error: unknown): string {
  if (isPublicError(error)) return error.message;

  const name = error instanceof Error ? error.name : "";
  const raw = error instanceof Error ? error.message : String(error);

  for (const pattern of PATTERNS) {
    if (pattern.test(raw, name)) {
      const where = previewUrlHint(raw);
      return where ? `${pattern.message} (${where})` : pattern.message;
    }
  }

  return RUNTIME_SCAN_FAILED_MESSAGE;
}
