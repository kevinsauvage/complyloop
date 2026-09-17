"use client";

import { AppErrorCard } from "@/components/app-error-card";

export default function FindingsError({
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
      reportTag="findings_error_boundary"
      description="The findings list could not be loaded. Filters and remediation states are unchanged — try again."
    />
  );
}
