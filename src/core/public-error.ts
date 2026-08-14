/**
 * Errors whose `message` is safe to show in the product UI.
 * Unexpected failures must not use this class — map them to a generic
 * message plus an error reference instead.
 */
export class PublicError extends Error {
  readonly code: string;

  constructor(message: string, code = "user") {
    super(message);
    this.name = "PublicError";
    this.code = code;
  }
}

export function isPublicError(error: unknown): error is PublicError {
  return error instanceof PublicError;
}

/** Safe copy for UI/logs: public message when typed, otherwise `fallback`. */
export function publicMessage(error: unknown, fallback: string): string {
  return isPublicError(error) ? error.message : fallback;
}
