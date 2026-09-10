"use client";

import { ReportedError } from "@/components/reported-error";
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-background p-6 text-foreground">
        <ReportedError
          error={error}
          retry={retry}
          tag="app_global_error_boundary"
          description="An unexpected error occurred while loading the application."
          className="mx-auto max-w-lg"
        />
      </body>
    </html>
  );
}
