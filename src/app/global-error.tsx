"use client";

import "./globals.css";

import { AppErrorCard } from "@/components/app-error-card";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="dark h-full antialiased"
    >
      <body className="min-h-full bg-background p-6 text-foreground">
        <AppErrorCard
          error={error}
          onReset={retry}
          reportTag="app_global_error_boundary"
          title="The application could not be loaded"
          description="An unexpected error occurred while loading the application."
          className="mx-auto max-w-lg"
        />
      </body>
    </html>
  );
}
