"use client";

import { useEffect } from "react";
import { reportAppError } from "@/server/observability";
import { AppErrorCard } from "@/components/app-error-card";

export default function AppGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "app_group_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="Something went wrong loading this workspace section. Your data is safe — try again or return to the dashboard."
      onReset={reset}
    />
  );
}
