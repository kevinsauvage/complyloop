"use client";

import { useEffect } from "react";
import { reportAppError } from "@/server/observability";
import { AppErrorCard } from "@/components/app-error-card";

export default function FindingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "findings_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="The findings list could not be loaded. Filters and remediation states are unchanged — try again."
      onReset={reset}
    />
  );
}
