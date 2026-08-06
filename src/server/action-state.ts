import { reportError } from "./observability";

export type ActionMessageState = {
  error: string | null;
  message: string | null;
};

export const emptyActionMessageState: ActionMessageState = {
  error: null,
  message: null,
};

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
