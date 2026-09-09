"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "dashboard_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="The dashboard could not be loaded. Recent assessments and findings are unchanged — try again."
      onReset={retry}
    />
  );
}
