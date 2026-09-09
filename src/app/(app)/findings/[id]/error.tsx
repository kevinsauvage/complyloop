"use client";

import { useEffect } from "react";
import { reportAppError } from "@/server/observability";
import { AppErrorCard } from "@/components/app-error-card";

export default function FindingDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "finding_detail_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="This finding could not be loaded. Remediation and evidence are unchanged — try again or pick another item from the queue."
      onReset={reset}
    />
  );
}
