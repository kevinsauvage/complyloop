const DEV_ONLY_AUTH_SECRET = "dev-only-auth-secret-not-for-production";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

/**
 * Production must never fall back to the known dev secret — that would let
 * anyone forge sessions or decrypt stored GitHub tokens.
 */
export function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (isProductionRuntime()) {
    throw new Error(
      "AUTH_SECRET is required in production (see docs/deploy.md). Refusing to use the dev-only fallback.",
    );
  }
  return DEV_ONLY_AUTH_SECRET;
}

export { isProductionRuntime };
