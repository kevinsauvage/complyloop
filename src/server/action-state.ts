import { isPublicError } from "@complyloop/analysis-core/contract/public-error";
import { reportError } from "./observability";

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

export function formError(error: string): ActionMessageState {
  return { error, message: null };
}

export function formSuccess(message: string): ActionMessageState {
  return { error: null, message };
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

export async function runActionMessage(
  run: () => Promise<string | void>,
): Promise<ActionMessageState> {
  try {
    const message = await run();
    return {
      error: null,
      message: typeof message === "string" ? message : "Done.",
    };
  } catch (error) {
    return actionErrorState(error);
  }
}
