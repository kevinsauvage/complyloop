"use client";

import { useEffect } from "react";
import { reportAppError } from "@/app/report-app-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "app_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="An unexpected error occurred while handling your request."
      onReset={reset}
    />
  );
}
