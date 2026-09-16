import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PAGE_HERO_GLOW =
  "pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_80%_70%_at_50%_-40%,color-mix(in_oklch,var(--signal)_12%,transparent),transparent)]";

export function PageHeader({
  title,
  description,
  eyebrow,
  children,
  className,
  variant = "panel",
}: {
  title: string;
  description?: ReactNode;
  /** Optional meta row rendered above the title (e.g. repo label, badges). */
  eyebrow?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** `plain` renders no panel chrome (for embedding inside another panel). */
  variant?: "panel" | "plain";
}) {
  return (
    <header
      className={cn(
        variant === "panel" &&
          "surface-panel relative mb-6 overflow-hidden rounded-2xl",
        variant === "plain" && "relative",
        className,
      )}
    >
      {variant === "panel" ? (
        <div aria-hidden className={PAGE_HERO_GLOW} />
      ) : null}
      <div className="relative z-[1] flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>
          ) : null}
          <h1
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-3xl"
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 w-full">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function PageSection({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "flex flex-col gap-4 border-t border-border/50 pt-8 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-6", className)}>{children}</div>;
}

export function EmptyState({
  title,
  children,
  action,
  footer,
  className,
  variant = "default",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Full-width content below the centered header (e.g. the connect picker). */
  footer?: ReactNode;
  className?: string;
  /**
   * `first-run` — nothing exists yet, action starts the loop.
   * `no-results` — filters hide everything, action resets.
   * `all-clear` — celebratory success state (nothing left to do).
   */
  variant?: "default" | "first-run" | "no-results" | "all-clear";
}) {
  const allClear = variant === "all-clear";
  return (
    <Card
      className={cn(
        "border-dashed border-border/60 bg-card/40 shadow-none",
        allClear && "border-solid border-status-passed/40 bg-status-passed/5",
        className,
      )}
    >
      <CardHeader className="items-center justify-items-center gap-2 text-center">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full border border-dashed",
            allClear
              ? "border-status-passed/50 bg-status-passed/10"
              : "border-signal/40 bg-signal/10",
          )}
          aria-hidden
        >
          {allClear ? (
            <Check className="size-5 text-status-passed" />
          ) : (
            <span
              className={cn(
                "size-2 rounded-full",
                variant === "no-results"
                  ? "bg-muted-foreground/50"
                  : "bg-signal/60",
              )}
            />
          )}
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
      {footer ? <CardContent>{footer}</CardContent> : null}
    </Card>
  );
}

export function NoProjectNotice({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        title="No project connected"
        action={
          <PageActionLink href="/dashboard">Go to dashboard</PageActionLink>
        }
      >
        {hint ? <p>{hint}</p> : null}
      </EmptyState>
    </>
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
      className={cn("surface-panel rounded-xl px-3 py-2.5 text-sm", className)}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
