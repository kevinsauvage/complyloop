"use client";

import { AppErrorCard } from "@/components/app-error-card";

export default function RequirementsError({
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
      reportTag="requirements_error_boundary"
      title="Requirements couldn't load"
      description="The requirements could not be loaded. Recent assessments and findings are unchanged — try again, or continue working from your findings."
      secondaryHref="/findings"
      secondaryLabel="View findings"
    />
  );
}
