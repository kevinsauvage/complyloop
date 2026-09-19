import "server-only";

import { isPublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  type ActionState,
  unexpectedActionMessage,
} from "@/core/actions/action-state";

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

/** Canonical server-action idiom: throw `PublicError`, catch here. */
export async function runAction(
  run: () => Promise<string | void>,
): Promise<ActionState> {
  try {
    const message = await run();
    return {
      ok: true,
      message: typeof message === "string" ? message : "Done.",
    };
  } catch (error) {
    return { ok: false, message: publicErrorMessage(error) };
  }
}
