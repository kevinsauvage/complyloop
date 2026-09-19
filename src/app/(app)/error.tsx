"use client";

import { AppErrorCard } from "@/components/shell/app-error-card";

export default function AppGroupError({
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
      reportTag="app_group_error_boundary"
      title="This workspace section could not be loaded"
      description="This workspace section could not be loaded. Your data is safe — try again or return to the dashboard."
    />
  );
}
