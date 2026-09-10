"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
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

  // Move keyboard + screen-reader focus to the error heading on mount
  // (ux: focusable error summary, focus states). role="alert" announces,
  // focus gives keyboard users a predictable starting point.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card
      className={cn(
        "mx-auto my-8 w-full max-w-lg border-destructive/30 bg-destructive/[0.04] shadow-none ring-1 ring-destructive/25",
        className,
      )}
      role="alert"
      aria-labelledby="app-error-title"
      aria-describedby="app-error-description"
    >
      <CardHeader className="items-center gap-2 text-center">
        <div className="flex flex-col items-center gap-2 text-center">
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
          className="max-w-xl text-center text-base text-balance text-muted-foreground"
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
      <CardContent className="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          size="lg"
          className="min-h-11 min-w-11"
          onClick={onReset}
        >
          <RotateCcw className="size-4" aria-hidden />
          Try again
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
