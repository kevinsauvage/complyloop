/**
 * Leveled observability. Emits structured JSON lines to the console and, when
 * Sentry is configured (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` via
 * `@sentry/nextjs`), captures errors/warnings to Sentry.
 *
 * Levels: `debug` → `info` → `warning` → `error`. `debug` is emitted only in
 * development (KISS gating: check once at module load); `warning`+ are always
 * emitted, `info` follows the same gate as `debug` so no auth data leaks in
 * prod logs. Call sites keep using the stable `reportError` / `reportWarning`
 * names; add `reportInfo` / `reportDebug` for dev-mode visibility.
 */
import * as Sentry from "@sentry/nextjs";

type Severity = "debug" | "info" | "warning" | "error";

const SEVERITY_ORDER: Record<Severity, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

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

function emitLog(
  severity: Severity,
  message: string,
  context?: ReportContext,
): void {
  // info/debug severity logs only in development to avoid prod noise.
  if (SEVERITY_ORDER[severity] < SEVERITY_ORDER.warning && process.env.NODE_ENV === "production")
    return;

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
    console.log(line);
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

/** Informational (dev-visible in development, silenced in production logs). */
export function reportInfo(message: string, context?: ReportContext): void {
  emitLog("info", message, context);
}

/** Verbose dev-only logging. Silenced entirely in production. */
export function reportDebug(message: string, context?: ReportContext): void {
  emitLog("debug", message, context);
}