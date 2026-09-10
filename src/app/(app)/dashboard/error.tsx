"use client";

import { ReportedError } from "@/components/reported-error";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ReportedError
      error={error}
      retry={retry}
      tag="dashboard_error_boundary"
      title="Dashboard couldn't load"
      description="The dashboard could not be loaded. Recent assessments and findings are unchanged — try again, or continue working from your findings."
      secondaryHref="/findings"
      secondaryLabel="View findings"
    />
  );
}
