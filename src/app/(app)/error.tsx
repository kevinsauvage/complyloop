"use client";

import { ReportedError } from "@/components/reported-error";

export default function AppGroupError({
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
      tag="app_group_error_boundary"
      description="Something went wrong loading this workspace section. Your data is safe — try again or return to the dashboard."
    />
  );
}
