"use client";

import { useEffect } from "react";
import { reportAppError } from "@/server/observability";
import { AppErrorCard } from "@/components/app-error-card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "dashboard_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="The dashboard could not be loaded. Recent assessments and findings are unchanged — try again."
      onReset={reset}
    />
  );
}
