function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function maxCheckoutBytes(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", 500 * 1024 * 1024);
}

export function maxCheckoutFiles(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_FILES", 50_000);
}

export function maxRuntimePages(): number {
  return positiveEnv("ASSESSMENT_MAX_RUNTIME_PAGES", 25);
}
