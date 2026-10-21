"use client";

import { AppErrorCard } from "@/components/shell/app-error-card";

export default function FindingDetailError({
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
      reportTag="finding_detail_error_boundary"
      title="This finding could not be loaded"
      description="This finding could not be loaded. Remediation and evidence are unchanged — try again or pick another item from the queue."
    />
  );
}
