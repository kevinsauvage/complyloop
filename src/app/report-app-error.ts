import * as Sentry from "@sentry/nextjs";

export function reportAppError(
  error: Error & { digest?: string },
  code: string,
): void {
  console.error(
    JSON.stringify({
      severity: "error",
      code,
      digest: error.digest,
      at: new Date().toISOString(),
    }),
  );
  Sentry.captureException(error);
}
