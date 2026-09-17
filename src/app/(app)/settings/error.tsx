"use client";

import { AppErrorCard } from "@/components/app-error-card";

export default function SettingsError({
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
      reportTag="settings_error_boundary"
      title="Settings couldn't load"
      description="Settings could not be loaded. Your configuration is unchanged — try again, or continue working from your dashboard."
      secondaryHref="/dashboard"
      secondaryLabel="Back to dashboard"
    />
  );
}
