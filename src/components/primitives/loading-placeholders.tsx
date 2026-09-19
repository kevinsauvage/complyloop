"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

const VISIBILITY_DELAY_MS = 0;
const STEP_INTERVAL_MS = 1600;

/**
 * Status-first route placeholder (Linear/GitHub-era pattern): no skeleton
 * blocks, just a small centered indicator + cycling status line. Renders
 * nothing for the first 200ms so near-instant loads never flash a
 * placeholder, and announces exactly once for screen readers. Every
 * `loading.tsx` in `src/app` composes this — same chrome everywhere, so
 * nested boundaries (root → group → segment) read as a status progression
 * instead of a loader swap.
 */
export function RouteLoadingStatus({
  label,
  steps,
}: {
  /** Static accessible name, e.g. "Loading dashboard". */
  label: string;
  /** Visual status progression, e.g. ["Loading…", "Preparing view…"]. */
  steps: readonly string[];
}) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), VISIBILITY_DELAY_MS);
    if (steps.length <= 1) return () => clearTimeout(showTimer);
    const stepTimer = setInterval(() => {
      setStep((current) => (current + 1) % steps.length);
    }, STEP_INTERVAL_MS);
    return () => {
      clearTimeout(showTimer);
      clearInterval(stepTimer);
    };
  }, [steps]);

  if (!visible) return null;

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-16 [animation:loading-fade-swap_0.3s_ease-out]"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-signal/25 bg-signal/10">
        <ShieldCheck className="relative size-5 text-signal" aria-hidden />
      </span>
      <div aria-hidden className="flex flex-col items-center gap-3">
        <p
          key={step}
          className="text-sm font-medium text-muted-foreground [animation:loading-fade-swap_0.4s_ease-out]"
        >
          {steps[step]}
        </p>
        <div className="loading-bar h-1 w-40 overflow-hidden rounded-full" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
