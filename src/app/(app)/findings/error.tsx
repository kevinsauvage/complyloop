"use client";

import { ReportedError } from "@/components/reported-error";

export default function FindingsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ReportedError
      error={error}
      retry={retry}
      tag="findings_error_boundary"
      description="The findings list could not be loaded. Filters and remediation states are unchanged — try again."
    />
  );
}
