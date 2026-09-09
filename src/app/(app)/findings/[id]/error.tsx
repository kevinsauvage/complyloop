"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function FindingDetailError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "finding_detail_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="This finding could not be loaded. Remediation and evidence are unchanged — try again or pick another item from the queue."
      onReset={retry}
    />
  );
}
