import * as Sentry from "@sentry/nextjs";
import { setAiWarn } from "@/ai/ai-call";
import { reportWarning } from "./server/observability";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    setAiWarn((message, context) => {
      reportWarning(message, context);
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
