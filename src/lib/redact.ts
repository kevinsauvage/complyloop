/**
 * Redacts credential-shaped substrings before text leaves the process (logs,
 * Sentry, error messages). Client-safe: the browser Sentry init uses it too.
 */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Embedded URL credentials: https://user:pass@host, postgres://user:pass@host
  [/:\/\/[^@\s/]+@/g, "://***@"],
  // Leaked Authorization header values.
  [/(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)\S+/gi, "$1***"],
  // Bare scheme-prefixed tokens (Bearer/Basic/token <secret>).
  [/\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***"],
  // Anthropic keys (`sk-ant-…`) before the generic `sk-` rule, which would
  // otherwise match the prefix and leave the key body behind.
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "***"],
  // OpenAI keys (`sk-…`, including project-scoped `sk-proj-…`).
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, "***"],
  // Google API keys.
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "***"],
  // Vercel AI Gateway keys.
  [/\bvck_[A-Za-z0-9_-]{8,}/g, "***"],
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
