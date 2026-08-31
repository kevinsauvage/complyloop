import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span
            className="mt-0.5 hidden h-6 w-1 shrink-0 rounded-full bg-signal sm:block"
            aria-hidden
          />
          <h1
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {title}
          </h1>
        </div>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground sm:pl-3.5">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "border-dashed bg-card/50 shadow-none ring-1 ring-border/40",
        className,
      )}
    >
      <CardHeader className="items-center justify-items-center gap-2 text-center">
        <span
          className="flex size-10 items-center justify-center rounded-full border border-dashed border-signal/40 bg-signal/10"
          aria-hidden
        >
          <span className="size-2 rounded-full bg-signal/60" />
        </span>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {children ? (
          <CardDescription className="max-w-lg text-center text-balance">
            {children}
          </CardDescription>
        ) : null}
      </CardHeader>
      {action ? (
        <CardContent className="flex justify-center">{action}</CardContent>
      ) : null}
    </Card>
  );
}

export function PageActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/60 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

export function MetaTile({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
