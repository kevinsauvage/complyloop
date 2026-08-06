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
  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
    message: null,
  };
}
