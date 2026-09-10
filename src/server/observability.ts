import "server-only";
import * as Sentry from "@sentry/nextjs";
import { redactSecrets } from "./redact";

/**
 * Thin leveled logging over `console` plus Sentry capture. `error`/`warning`
 * always emit; `info`/`debug` are development-only. Call sites keep using the
 * stable `reportError` / `reportWarning` / `reportInfo` / `reportDebug` names.
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

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
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
 * App/global error boundary reporter. Delegates to {@link reportError} with
 * the Next.js error digest attached for correlation.
 */
export function reportAppError(
  error: Error & { digest?: string },
  code: string,
): void {
  reportError(error, { code, digest: error.digest });
}

export function reportError(error: unknown, context?: ReportContext): void {
  const message = redactSecrets(
    error instanceof Error ? error.message : String(error),
  );
  console.error(`[error] ${message}`, {
    ...context,
    ...(error instanceof Error
      ? { name: error.name, stack: redactSecrets(error.stack ?? "") }
      : {}),
  });

  Sentry.withScope((scope) => {
    applyReportContext(scope, context);
    if (error instanceof Error) {
      Sentry.captureException(redactError(error));
    } else {
      Sentry.captureMessage(message, "error");
    }
  });
}

export function reportWarning(message: string, context?: ReportContext): void {
  const safeMessage = redactSecrets(message);
  console.warn(`[warning] ${safeMessage}`, context ?? "");
  Sentry.withScope((scope) => {
    applyReportContext(scope, context);
    Sentry.captureMessage(safeMessage, "warning");
  });
}

/** Informational (dev-visible in development, silenced in production logs). */
export function reportInfo(message: string, context?: ReportContext): void {
  if (isProduction()) return;
  console.info(`[info] ${message}`, context ?? "");
}

/** Verbose dev-only logging. Silenced entirely in production. */
export function reportDebug(message: string, context?: ReportContext): void {
  if (isProduction()) return;
  console.debug(`[debug] ${message}`, context ?? "");
}
