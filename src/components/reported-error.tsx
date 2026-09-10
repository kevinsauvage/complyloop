"use client";

import { useEffect } from "react";

import { AppErrorCard } from "@/components/app-error-card";
import { reportClientError } from "@/lib/report-client-error";

export interface ReportedErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
  tag: string;
  description: string;
  title?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
}

/** Shared error-boundary body: report once + accessible error card. */
export function ReportedError({ error, retry, tag, description, title, secondaryHref, secondaryLabel, className }: ReportedErrorProps) {
  useEffect(() => {
    reportClientError(error, tag);
  }, [error, tag]);

  return (
    <AppErrorCard
      digest={error.digest}
      description={description}
      onReset={retry}
      title={title}
      secondaryHref={secondaryHref}
      secondaryLabel={secondaryLabel}
      className={className}
    />
  );
}
