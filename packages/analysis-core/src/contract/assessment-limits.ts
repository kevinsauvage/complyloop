function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Cap on pages visited during a runtime assessment pass. */
export function maxRuntimePages(): number {
  return positiveEnv("ASSESSMENT_MAX_RUNTIME_PAGES", 25);
}

/** Wall-clock budget for an interactive site re-audit (verify-fix action). */
export const SITE_VERIFY_TIMEOUT_MS = 120_000;
