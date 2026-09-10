/**
 * Client-safe action-state primitives. Kept out of `@/server/action-state` so
 * client components never pull the server module (Sentry, node logging) into
 * the browser bundle just to read `initialActionState` or a type.
 */

/**
 * Result of a form server action. `ok` separates a success toast from an inline
 * error; `message` is public copy in both cases.
 */
export type ActionState = {
  ok: boolean;
  message: string | null;
};

export const initialActionState: ActionState = {
  ok: false,
  message: null,
};

const UNEXPECTED_ACTION_MESSAGE = "Something went wrong.";

export function unexpectedActionMessage(errorRef: string): string {
  return `${UNEXPECTED_ACTION_MESSAGE} Reference: ${errorRef}`;
}
