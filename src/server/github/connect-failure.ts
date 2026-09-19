import "server-only";

import { isPublicError } from "@complyloop/analysis-core/contract/public-error";

/**
 * Classified connect/repair failure causes. The repair banner
 * (`ConnectProjectPanel`) maps each cause to an install-URL / reconnect /
 * rename affordance instead of one generic error.
 *
 * Matching is substring-based on the stable throw-site prefixes below — the
 * unit tests pin every known throw-site message, so rewording a source
 * message fails loudly here instead of silently dropping to `unknown`.
 */
export type ConnectFailureCause =
  | "no-installation"
  | "repo-not-on-install"
  | "repo-not-found"
  | "token-revoked"
  | "token-missing"
  | "unknown";

const CAUSE_PATTERNS: ReadonlyArray<{
  cause: Exclude<ConnectFailureCause, "unknown">;
  fragments: readonly string[];
}> = [
  {
    cause: "no-installation",
    fragments: [
      "No GitHub App installations found",
      "not available on your account",
    ],
  },
  {
    cause: "repo-not-on-install",
    fragments: [
      "not accessible via the selected GitHub App installation",
      "not available via your GitHub App installations",
      "is already connected",
    ],
  },
  {
    cause: "repo-not-found",
    fragments: ["Could not load repository"],
  },
  {
    cause: "token-revoked",
    fragments: ["GitHub revoked"],
  },
  {
    cause: "token-missing",
    fragments: ["access token missing", "Could not read your GitHub token"],
  },
];

export function classifyConnectFailure(error: unknown): ConnectFailureCause {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;
  if (!message) return "unknown";
  // Only our own classified errors participate — never reinterpret a raw
  // provider/transport message as a repair cause.
  if (!isPublicError(error)) return "unknown";
  for (const { cause, fragments } of CAUSE_PATTERNS) {
    if (fragments.some((fragment) => message.includes(fragment))) {
      return cause;
    }
  }
  return "unknown";
}
