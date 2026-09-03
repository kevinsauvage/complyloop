const DEFAULT_TAIL = 12;
const DEFAULT_MAX_UNIQUE = 2;

/**
 * Returns true when recent Tab focus keys cycle among very few elements —
 * a signal of an unintentional keyboard trap (modals are excluded upstream).
 */
export function isSuspectedKeyboardTrap(
  sequence: readonly string[],
  tailLength = DEFAULT_TAIL,
  maxUniqueFocusables = DEFAULT_MAX_UNIQUE,
): boolean {
  const tail = sequence.slice(-tailLength);
  if (tail.includes("modal")) return false;
  const unique = new Set(tail.filter((key) => key !== "body" && key !== "modal"));
  return unique.size <= maxUniqueFocusables;
}
