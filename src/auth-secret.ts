const DEV_ONLY_AUTH_SECRET = "dev-only-auth-secret-not-for-production";

/** Copy-paste defaults that must never become a production session key. */
const PLACEHOLDER_AUTH_SECRETS = new Set([
  "replace-me",
  "e2e-secret-change-me",
  DEV_ONLY_AUTH_SECRET,
]);

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

function isPlaceholderAuthSecret(secret: string): boolean {
  return PLACEHOLDER_AUTH_SECRETS.has(secret);
}

/**
 * Production must never fall back to the known dev secret — that would let
 * anyone forge sessions or decrypt stored GitHub tokens.
 */
export function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) {
    if (
      isProductionRuntime() &&
      isPlaceholderAuthSecret(process.env.AUTH_SECRET)
    ) {
      throw new Error(
        "AUTH_SECRET is a known placeholder. Set a unique secret (see docs/vercel.md).",
      );
    }
    return process.env.AUTH_SECRET;
  }
  if (isProductionRuntime()) {
    throw new Error(
      "AUTH_SECRET is required in production (see docs/vercel.md). Refusing to use the dev-only fallback.",
    );
  }
  return DEV_ONLY_AUTH_SECRET;
}

/**
 * Auth.js sets `__Secure-`-prefixed session cookies whenever the request URL
 * is https (src/lib/init.ts: `useSecureCookies ?? url.protocol === "https:"`).
 * `getToken()` must be told the same so it reads the matching cookie name —
 * otherwise a valid session is invisible (seen in dev behind the https ngrok
 * tunnel, where NODE_ENV is "development" but the browser origin is https).
 */
export function sessionCookieIsSecure(): boolean {
  const authUrl = process.env.AUTH_URL;
  if (authUrl) return authUrl.startsWith("https://");
  const forwardedProto = process.env.X_FORWARDED_PROTO;
  if (forwardedProto) return forwardedProto.split(",")[0]!.trim() === "https";
  return false;
}

export { isProductionRuntime };
