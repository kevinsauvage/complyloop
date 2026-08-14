"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        severity: "error",
        code: "app_global_error_boundary",
        digest: error.digest,
        at: new Date().toISOString(),
      }),
    );
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-background p-6 text-foreground">
        <Alert variant="destructive" className="px-6 py-8">
          <h1 className="text-xl font-semibold text-destructive">
            Something went wrong
          </h1>
          <AlertDescription>
            <p className="mt-2 max-w-xl">
              An unexpected error occurred while loading the application.
              {error.digest ? ` Reference: ${error.digest}` : ""}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Back to dashboard</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </body>
    </html>
  );
}
