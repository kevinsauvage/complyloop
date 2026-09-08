"use client";

import { useEffect } from "react";
import { reportAppError } from "@/app/report-app-error";
import { AppErrorCard } from "@/components/app-error-card";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError(error, "app_global_error_boundary");
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-background p-6 text-foreground">
        <AppErrorCard
          className="mx-auto max-w-lg border-destructive/30 bg-destructive/[0.04] shadow-none ring-1 ring-destructive/25"
          digest={error.digest}
          description="An unexpected error occurred while loading the application."
          onReset={reset}
        />
      </body>
    </html>
  );
}
