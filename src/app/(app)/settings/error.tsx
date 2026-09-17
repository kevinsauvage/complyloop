"use client";

import { ReportedError } from "@/components/reported-error";

export default function SettingsError({
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
      tag="settings_error_boundary"
      title="Settings couldn't load"
      description="Settings could not be loaded. Your configuration is unchanged — try again, or continue working from your dashboard."
      secondaryHref="/dashboard"
      secondaryLabel="Back to dashboard"
    />
  );
}
