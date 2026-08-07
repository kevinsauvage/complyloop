/**
 * Warning sink for AI modules — kept free of server/observability imports.
 * Callers (server actions) inject the sink via setAiWarn when needed.
 */

export type AiWarnFn = (
  message: string,
  context?: Record<string, unknown>,
) => void;

let warnFn: AiWarnFn = () => {
  /* default: no-op until the server wires observability */
};

export function setAiWarn(fn: AiWarnFn): void {
  warnFn = fn;
}

export function aiWarn(
  message: string,
  context?: Record<string, unknown>,
): void {
  warnFn(message, context);
}
