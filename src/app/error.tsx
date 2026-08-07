"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({
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
        code: "app_error_boundary",
        message: error.message,
        digest: error.digest,
        at: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <Alert variant="destructive" className="px-6 py-8">
      <h1 className="text-xl font-semibold text-destructive">
        Something went wrong
      </h1>
      <AlertDescription>
        <p className="mt-2 max-w-xl">
          {error.message ||
            "An unexpected error occurred while handling your request."}
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
  );
}
