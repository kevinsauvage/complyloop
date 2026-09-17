"use client";

import { AppErrorCard } from "@/components/app-error-card";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <AppErrorCard
      error={error}
      onReset={retry}
      reportTag="app_error_boundary"
      title="This page could not be loaded"
      description="An unexpected error occurred while handling your request."
    />
  );
}
