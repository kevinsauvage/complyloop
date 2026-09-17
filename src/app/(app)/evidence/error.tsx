"use client";

import { AppErrorCard } from "@/components/app-error-card";

export default function EvidenceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <AppErrorCard
      error={error}
      onReset={retry}
      reportTag="evidence_error_boundary"
      title="Evidence couldn't load"
      description="The evidence trail could not be loaded. Stored evidence is unchanged — try again, or continue working from your findings."
      secondaryHref="/findings"
      secondaryLabel="View findings"
    />
  );
}
