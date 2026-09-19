const AUTH_ERROR_COPY: Record<string, string> = {
  AccessDenied:
    "You denied GitHub access. Retry and approve access to continue.",
  OAuthAccountNotLinked:
    "This GitHub account is already linked to another sign-in method. Use the original method or contact your administrator.",
  Verification:
    "The sign-in attempt expired or was already used. Please try again.",
  Configuration: "Sign-in is misconfigured — contact your administrator.",
};

const FALLBACK_AUTH_ERROR_COPY =
  "Sign-in with GitHub failed. Please try again — if it keeps failing, contact your administrator.";

/**
 * Public copy for an `?error=` code. Uses `Object.hasOwn` (not `??` on a
 * direct index): crafted codes like `?error=constructor` resolve through the
 * prototype chain to a function, which React cannot render (500). Unknown
 * codes fall back to the generic copy; empty input renders nothing.
 */
export function authErrorCopy(error: string | null): string | null {
  if (!error) return null;
  return Object.hasOwn(AUTH_ERROR_COPY, error)
    ? AUTH_ERROR_COPY[error]
    : FALLBACK_AUTH_ERROR_COPY;
}
