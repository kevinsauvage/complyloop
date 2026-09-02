import type { ReactNode } from "react";
import Link from "next/link";
import { formatDateTime } from "@/core/format-datetime";
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
    <div className="panel-frost sticky top-0 z-30 -mx-4 mb-6 border-b border-border/70 px-4 py-4 sm:-mx-8 sm:px-8 md:top-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            <span
              className="hidden h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-signal to-signal/40 sm:block"
              aria-hidden
            />
            <h1
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-2xl"
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
          className="flex size-11 items-center justify-center rounded-full border border-dashed border-signal/40 bg-signal/10 shadow-[0_0_0_4px] shadow-signal/[0.04]"
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
    <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/60 px-4 py-3 font-mono text-xs leading-relaxed text-foreground shadow-[inset_0_1px_2px] shadow-foreground/[0.04]">
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
        "card-sheen rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export { formatDateTime };