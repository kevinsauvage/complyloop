"use client";

import { ReportedError } from "@/components/reported-error";

export default function AppError({
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
      tag="app_error_boundary"
      description="An unexpected error occurred while handling your request."
    />
  );
}
