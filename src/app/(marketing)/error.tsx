"use client";

import { AppErrorCard } from "@/components/shell/app-error-card";

/**
 * Marketing-group error boundary. Scoped to `(marketing)` so a render error
 * on `/`, `/login`, or the legal pages renders inside the marketing layout
 * (header/footer chrome) instead of falling through to the app-styled root
 * boundary.
 */
export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16 sm:px-6">
      <AppErrorCard
        error={error}
        onReset={retry}
        reportTag="marketing_error_boundary"
        title="This page could not be loaded"
        description="An unexpected error occurred while handling your request."
      />
    </div>
  );
}
