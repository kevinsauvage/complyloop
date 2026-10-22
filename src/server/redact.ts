import "server-only";

/**
 * Server-side alias of the shared redactor (the browser Sentry init uses the
 * same implementation, so the pattern list lives in `@/lib/redact`).
 */
export { redactSecrets } from "@/lib/redact";
