import "server-only";

import * as Sentry from "@sentry/nextjs";

import { redactSecrets } from "./redact";

/**
 * Thin leveled logging over `console` plus Sentry capture. `error`/`warning`
 * always emit; `reportEvent` is console-only for high-volume happy paths.
 * Call sites keep using the stable `reportError` / `reportWarning` names.
 */
export interface ReportContext {
  /** Stable machine-readable code for dashboards/alerts. */
  code?: string;
  userId?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  /** Next.js error digest (error boundary). */
  digest?: string;
  [key: string]: unknown;
}

function applyReportContext(
  scope: {
    setExtra: (key: string, extra: unknown) => void;
    setUser: (user: { id: string } | null) => void;
    setTag: (key: string, value: string) => void;
  },
  context: ReportContext | undefined,
): void {
  if (!context) return;
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) scope.setExtra(key, value);
  }
  if (context.userId) scope.setUser({ id: String(context.userId) });
  if (context.code) scope.setTag("code", String(context.code));
}

/** Copy of an error with credential-shaped text scrubbed from message/stack. */
function redactError(error: Error): Error {
  const sanitized = new Error(redactSecrets(error.message));
  sanitized.name = error.name;
  if (error.stack) sanitized.stack = redactSecrets(error.stack);
  return sanitized;
}

/**
 * Redacts credential-shaped strings in context values. Context is free-form
 * (preview URLs, engine errors, file paths) and reaches both console and
 * Sentry, so it must not be trusted to be secret-free.
 */
function redactContext(
  context: ReportContext | undefined,
): ReportContext | undefined {
  if (!context) return undefined;
  const safe: ReportContext = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = typeof value === "string" ? redactSecrets(value) : value;
  }
  return safe;
}

export function reportError(error: unknown, context?: ReportContext): void {
  const safeContext = redactContext(context);
  const message = redactSecrets(
    error instanceof Error ? error.message : String(error),
  );
  console.error(`[error] ${message}`, {
    ...safeContext,
    ...(error instanceof Error
      ? { name: error.name, stack: redactSecrets(error.stack ?? "") }
      : {}),
  });

  Sentry.withScope((scope) => {
    applyReportContext(scope, safeContext);
    if (error instanceof Error) {
      Sentry.captureException(redactError(error));
    } else {
      Sentry.captureMessage(message, "error");
    }
  });
}

export function reportWarning(message: string, context?: ReportContext): void {
  const safeMessage = redactSecrets(message);
  const safeContext = redactContext(context);
  console.warn(`[warning] ${safeMessage}`, safeContext ?? "");
  Sentry.withScope((scope) => {
    applyReportContext(scope, safeContext);
    Sentry.captureMessage(safeMessage, "warning");
  });
}

/**
 * Lifecycle event, visible in production logs (Vercel captures stdout).
 * Console-only — never sent to Sentry — for high-volume happy paths the
 * on-call needs in prod logs: enqueue/claim/complete, connect, worker
 * batches. Secrets are redacted; never pass tokens or headers here.
 */
export function reportEvent(message: string, context?: ReportContext): void {
  console.info(
    `[event] ${redactSecrets(message)}`,
    redactContext(context) ?? "",
  );
}
