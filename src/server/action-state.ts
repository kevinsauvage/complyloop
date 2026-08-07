import { reportError } from "./observability";
import { ConnectError } from "./connect-url";

export type ActionMessageState = {
  error: string | null;
  message: string | null;
};

/** Shared shape alias used by connect/org forms. */
export type FormErrorState = ActionMessageState;

export const emptyActionMessageState: ActionMessageState = {
  error: null,
  message: null,
};

export function formError(error: string): ActionMessageState {
  return { error, message: null };
}

export function formSuccess(message: string): ActionMessageState {
  return { error: null, message };
}

/** Maps a thrown Error into a form-state error (for useActionState handlers). */
export function actionErrorState(error: unknown): ActionMessageState {
  reportError(error, { code: "server_action_error" });
  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
    message: null,
  };
}

/** Runs a mutation and returns success/error form state for `useActionState`. */
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

/** Maps ConnectError to form state; rethrows unexpected errors. */
export function connectFormError(error: unknown): ActionMessageState {
  if (error instanceof ConnectError) {
    return { error: error.message, message: null };
  }
  throw error;
}
