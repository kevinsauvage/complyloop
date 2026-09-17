"use client";

import { AppErrorCard } from "@/components/app-error-card";

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
      description="Something went wrong loading this workspace section. Your data is safe — try again or return to the dashboard."
    />
  );
}
