"use client";

import { ReportedError } from "@/components/reported-error";

export default function RequirementsError({
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
      tag="requirements_error_boundary"
      title="Requirements couldn't load"
      description="The requirements could not be loaded. Recent assessments and findings are unchanged — try again, or continue working from your findings."
      secondaryHref="/findings"
      secondaryLabel="View findings"
    />
  );
}
