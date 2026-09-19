"use client";

import { AppErrorCard } from "@/components/shell/app-error-card";

export default function DashboardError({
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
      reportTag="dashboard_error_boundary"
      title="Dashboard couldn't load"
      description="The dashboard could not be loaded. Recent assessments and findings are unchanged — try again, or continue working from your findings."
      secondaryHref="/findings"
      secondaryLabel="View findings"
    />
  );
}
