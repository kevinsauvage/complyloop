import "server-only";

import { isPublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  type ActionState,
  unexpectedActionMessage,
} from "@/core/actions/action-state";
import type { AppHref } from "@/core/routes";

import { reportError } from "./observability";

function createErrorRef(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

/** Public copy, or a generic message plus a short reference after logging. */
export function publicErrorMessage(error: unknown): string {
  if (isPublicError(error)) return error.message;
  const errorRef = createErrorRef();
  reportError(error, { code: "server_action_error", errorRef });
  return unexpectedActionMessage(errorRef);
}

/**
 * Canonical server-action idiom: throw `PublicError`, catch here. The callback
 * returns a message, nothing, or `{ message, redirectTo }` when success also
 * moves the client (see `ActionState.redirectTo`).
 */
export async function runAction(
  run: () => Promise<string | void | { message: string; redirectTo?: AppHref }>,
): Promise<ActionState> {
  try {
    const result = await run();
    if (result && typeof result === "object") {
      return {
        ok: true,
        message: result.message,
        redirectTo: result.redirectTo,
      };
    }
    return {
      ok: true,
      message: typeof result === "string" ? result : "Done.",
    };
  } catch (error) {
    return { ok: false, message: publicErrorMessage(error) };
  }
}
