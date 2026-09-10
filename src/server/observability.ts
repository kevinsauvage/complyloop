import * as Sentry from "@sentry/nextjs";
import { stdout } from "node:process";
import { inspect } from "node:util";
import { redactSecrets } from "./redact";

/**
 * Leveled observability. Emits pretty, human-readable log lines to the console
 * and, when Sentry is configured (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` via
 * `@sentry/nextjs`), captures errors/warnings to Sentry.
 *
 * Levels: `debug` → `info` → `warning` → `error`. `debug` is emitted only in
 * development; `warning`+ are always emitted, `info` follows the same gate as
 * `debug` so no auth data leaks in prod logs (both sizes compare the current
 * `NODE_ENV` per call so tests can flip the gate). Call sites keep using the
 * stable `reportError` / `reportWarning` names; add `reportInfo` /
 * `reportDebug` for dev-mode visibility.
 */
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

/** Compact, colorized console style per severity. */
const STYLES: Record<Severity, { badge: string; key: string }> = {
  debug: { badge: "\x1b[90mDBG\x1b[0m", key: "\x1b[90m" },
  info: { badge: "\x1b[36mINF\x1b[0m", key: "\x1b[36m" },
  warning: { badge: "\x1b[33mWRN\x1b[0m", key: "\x1b[33m" },
  error: { badge: "\x1b[31mERR\x1b[0m", key: "\x1b[31m" },
};

function prettyValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return inspect(value, { colors: false, depth: 3, breakLength: 120 });
  } catch {
    return String(value);
  }
}

function formatTsMillis(millis: number): string {
  // 2026-09-08T22:10:00.000Z — seconds + millisecond precision.
  return new Date(millis).toISOString();
}

function emitLog(
  severity: Severity,
  message: string,
  context?: ReportContext,
): void {
  // info/debug severity logs only in development to avoid prod noise.
  if (SEVERITY_ORDER[severity] < SEVERITY_ORDER.warning && process.env.NODE_ENV === "production")
    return;

  const { badge, key } = STYLES[severity];
  const entries = Object.entries(context ?? {}).filter(
    ([, value]) => value !== undefined,
  );
  const meta = entries
    .map(
      ([k, v]) =>
        `${key}${k}\x1b[0m=${prettyValue(v)}`,
    )
    .join(" ") || "";

  // Prefix with a millisecond timestamp so lines sort deterministically.
  const line = `${formatTsMillis(Date.now())} ${badge} ${message}${meta ? ` ${meta}` : ""}`;

  const out = severity === "error" || severity === "warning" ? process.stderr : stdout;
  out.write(`${line}\n`);
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

/** Copy an error with credential-shaped text scrubbed from message and stack. */
function redactError(error: Error): Error {
  const sanitized = new Error(redactSecrets(error.message));
  sanitized.name = error.name;
  if (error.stack) sanitized.stack = redactSecrets(error.stack);
  return sanitized;
}

export function reportError(
  error: unknown,
  context?: ReportContext,
): void {
  const message = redactSecrets(
    error instanceof Error ? error.message : String(error),
  );
  emitLog("error", message, {
    ...context,
    name: error instanceof Error ? error.name : undefined,
    stack:
      error instanceof Error && error.stack
        ? redactSecrets(error.stack)
        : undefined,
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