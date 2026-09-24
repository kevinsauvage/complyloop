/**
 * Post-login redirect guard, shared by the sign-in action and `proxy.ts` so the
 * two validators cannot drift. Internal path only: rejects `//` (protocol-relative)
 * and `/\` (browsers normalize backslash-as-slash, so `/\evil.com` becomes an
 * attacker-host bounce). Dependency-free so the edge proxy can import it.
 */
export function safeCallbackUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/dashboard";
  }
  return value;
}
