"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Client-safe error-boundary reporter.
 *
 * Per the Next.js Server/Client Components guide, Client Components must not
 * import server-only modules (`node:*`, DB clients, secrets). The previous
 * `@/server/observability` import pulled `node:process`, `node:util`, and
 * server logging into the client bundle. This wrapper reports to Sentry's
 * browser SDK only and mirrors `reportAppError(error, code)` semantics with
 * the Next.js error `digest` attached for correlation.
 */
export function reportClientError(
  error: Error & { digest?: string },
  code: string,
): void {
  if (process.env.NODE_ENV === "development") {
    console.error(`[${code}]`, error);
  }
  Sentry.withScope((scope) => {
    scope.setTag("code", code);
    if (error.digest) scope.setExtra("digest", error.digest);
    Sentry.captureException(error);
  });
}
