"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function FindingsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "findings_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="The findings list could not be loaded. Filters and remediation states are unchanged — try again."
      onReset={retry}
    />
  );
}
