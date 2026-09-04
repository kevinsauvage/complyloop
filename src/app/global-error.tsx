"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
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
        <Card
          className="mx-auto max-w-lg border-destructive/30 bg-destructive/[0.04] shadow-none ring-1 ring-destructive/25"
          role="alert"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full bg-destructive"
                aria-hidden
              />
              <h1 className="text-xl font-semibold tracking-tight text-destructive">
                Something went wrong
              </h1>
            </div>
            <CardDescription className="max-w-xl text-base text-foreground/80">
              An unexpected error occurred while loading the application.
              {error.digest ? (
                <>
                  {" "}
                  Reference:{" "}
                  <code className="font-mono text-sm text-foreground">
                    {error.digest}
                  </code>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" onClick={reset}>
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </body>
    </html>
  );
}
