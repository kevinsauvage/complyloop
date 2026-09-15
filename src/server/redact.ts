import "server-only";
/**
 * Redacts credential-shaped substrings before text is logged or reported.
 * Shared by error observability and git-clone error formatting.
 */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Embedded URL credentials: https://user:pass@host, postgres://user:pass@host
  [/:\/\/[^@\s/]+@/g, "://***@"],
  // Leaked Authorization header values.
  [/(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)\S+/gi, "$1***"],
  // Bare scheme-prefixed tokens (Bearer/Basic/token <secret>).
  [/\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***"],
  // key=value / key: value secrets.
  [
    /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*)(["']?)[^\s"',}]+/gi,
    "$1$2***",
  ],
];

export function redactSecrets(text: string): string {
  return REDACTIONS.reduce(
    (redacted, [pattern, replacement]) =>
      redacted.replace(pattern, replacement),
    text,
  );
}
