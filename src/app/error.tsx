"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10">
      <h1 className="text-xl font-semibold text-red-900">Something went wrong</h1>
      <p className="mt-2 max-w-xl text-sm text-red-800" role="alert">
        {error.message ||
          "An unexpected error occurred while handling your request."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
