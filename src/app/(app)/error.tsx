"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export default function AppGroupError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "app_group_error_boundary");
  }, [error]);

  return (
    <AppErrorCard
      digest={error.digest}
      description="Something went wrong loading this workspace section. Your data is safe — try again or return to the dashboard."
      onReset={retry}
    />
  );
}
