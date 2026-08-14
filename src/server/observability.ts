/**
 * Minimal production observability. Always emits structured logs. When
 * Sentry is initialized (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` via
 * `@sentry/nextjs`), also captures to Sentry.
 */
import * as Sentry from "@sentry/nextjs";

type Severity = "error" | "warning" | "info";

export interface ReportContext {
  /** Stable machine-readable code for dashboards/alerts. */
  code?: string;
  userId?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  [key: string]: unknown;
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

  Sentry.withScope((scope) => {
    applyReportContext(scope, context);
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
  Sentry.withScope((scope) => {
    applyReportContext(scope, context);
    Sentry.captureMessage(message, "warning");
  });
}
