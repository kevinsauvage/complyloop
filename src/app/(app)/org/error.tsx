"use client";

import { AppErrorCard } from "@/components/shell/app-error-card";

export default function OrgError({
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
      reportTag="org_error_boundary"
      title="Organization couldn't load"
      description="The organization could not be loaded. Memberships and projects are unchanged — try again, or continue working from your dashboard."
      secondaryHref="/dashboard"
      secondaryLabel="Back to dashboard"
    />
  );
}
