/**
 * Minimal production observability. Always emits structured logs. When
 * SENTRY_DSN is set, also captures to Sentry (@sentry/node).
 */
import * as Sentry from "@sentry/node";

type Severity = "error" | "warning" | "info";

export interface ReportContext {
  /** Stable machine-readable code for dashboards/alerts. */
  code?: string;
  userId?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  [key: string]: unknown;
}

let sentryInitialized = false;

function resolveTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw != null && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return process.env.NODE_ENV === "production" ? 0.05 : 0;
}

function ensureSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  if (!sentryInitialized) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: resolveTracesSampleRate(),
    });
    sentryInitialized = true;
  }
  return true;
}

function emitLog(
  severity: Severity,
  message: string,
  context?: ReportContext,
): void {
  const line = JSON.stringify({
    severity,
    message,
    ...context,
    at: new Date().toISOString(),
  });
  if (severity === "error") {
    console.error(line);
  } else if (severity === "warning") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function reportError(
  error: unknown,
  context?: ReportContext,
): void {
  const message = error instanceof Error ? error.message : String(error);
  emitLog("error", message, {
    ...context,
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (!ensureSentry()) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) scope.setExtra(key, value);
      }
      if (context.userId) scope.setUser({ id: String(context.userId) });
      if (context.code) scope.setTag("code", String(context.code));
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(message, "error");
    }
  });
}

export function reportWarning(
  message: string,
  context?: ReportContext,
): void {
  emitLog("warning", message, context);
  if (!ensureSentry()) return;
  Sentry.withScope((scope) => {
    if (context?.code) scope.setTag("code", String(context.code));
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) scope.setExtra(key, value);
      }
    }
    Sentry.captureMessage(message, "warning");
  });
}
