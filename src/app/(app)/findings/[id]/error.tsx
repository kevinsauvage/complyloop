"use client";

import { ReportedError } from "@/components/reported-error";

export default function FindingDetailError({
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
      tag="finding_detail_error_boundary"
      description="This finding could not be loaded. Remediation and evidence are unchanged — try again or pick another item from the queue."
    />
  );
}
