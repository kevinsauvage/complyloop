"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AppErrorCard({
  digest,
  title = "Something went wrong",
  description,
  onReset,
  secondaryHref = "/dashboard",
  secondaryLabel = "Back to dashboard",
  className,
}: {
  digest?: string;
  title?: string;
  description: string;
  onReset: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Move keyboard + screen-reader focus to the error heading on mount
  // (ux: focusable error summary, focus states). role="alert" announces,
  // focus gives keyboard users a predictable starting point.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    onReset();
  };

  // Reset the spinner if the boundary keeps us mounted (retry failed).
  useEffect(() => {
    if (!isRetrying) return;
    const t = setTimeout(() => setIsRetrying(false), 4000);
    return () => clearTimeout(t);
  }, [isRetrying]);

  return (
    <Card
      className={cn(
        "border-destructive/30 bg-destructive/[0.04] shadow-none ring-1 ring-destructive/25",
        className,
      )}
      role="alert"
      aria-labelledby="app-error-title"
      aria-describedby="app-error-description"
      aria-busy={isRetrying}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10"
            aria-hidden
          >
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
          </span>
          <h1
            id="app-error-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight text-destructive outline-none"
          >
            {title}
          </h1>
        </div>
        <CardDescription
          id="app-error-description"
          className="max-w-xl text-base text-foreground/80"
        >
          {description}
          {digest ? (
            <>
              {" "}
              Reference:{" "}
              <code
                className="font-mono text-sm text-foreground"
                aria-label={`Error reference ${digest}`}
              >
                {digest}
              </code>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="lg"
          className="min-h-11 min-w-11"
          onClick={handleRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-4" aria-hidden />
          )}
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 min-w-11"
          asChild
        >
          <Link href={secondaryHref}>{secondaryLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
