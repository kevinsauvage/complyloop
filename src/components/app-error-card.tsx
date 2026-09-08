"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export function AppErrorCard({
  digest,
  description,
  onReset,
  className,
}: {
  digest?: string;
  description: string;
  onReset: () => void;
  className?: string;
}) {
  return (
    <Card
      className={
        className ??
        "border-destructive/30 bg-destructive/[0.04] shadow-none ring-1 ring-destructive/25"
      }
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
          {description}
          {digest ? (
            <>
              {" "}
              Reference:{" "}
              <code className="font-mono text-sm text-foreground">{digest}</code>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button type="button" onClick={onReset}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
