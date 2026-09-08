import { isPublicError } from "@complyloop/analysis-core/contract/public-error";
import { reportDebug, reportError } from "./observability";

export type ActionMessageState = {
  error: string | null;
  message: string | null;
};

export const emptyActionMessageState: ActionMessageState = {
  error: null,
  message: null,
};

const UNEXPECTED_ACTION_MESSAGE = "Something went wrong.";

export function unexpectedActionMessage(errorRef: string): string {
  return `${UNEXPECTED_ACTION_MESSAGE} Reference: ${errorRef}`;
}

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

/** Maps thrown errors to form state: public copy, or a generic message + ref. */
export function actionErrorState(error: unknown): ActionMessageState {
  return { error: publicErrorMessage(error), message: null };
}

/** Canonical server-action idiom: throw `PublicError`, catch here. */
export async function runActionMessage(
  run: () => Promise<string | void>,
  actionName?: string,
): Promise<ActionMessageState> {
  reportDebug(`action:start ${actionName ?? ""}`.trim());
  try {
    const message = await run();
    reportDebug(`action:end ${actionName ?? ""}`.trim());
    return {
      error: null,
      message: typeof message === "string" ? message : "Done.",
    };
  } catch (error) {
    reportDebug(`action:error ${actionName ?? ""}`.trim());
    return actionErrorState(error);
  }
}
