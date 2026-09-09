"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "app_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="An unexpected error occurred while handling your request."
      onReset={retry}
    />
  );
}
