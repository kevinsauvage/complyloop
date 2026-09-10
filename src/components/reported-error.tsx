"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";
import { AppErrorCard } from "@/components/app-error-card";

export interface ReportedErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
  tag: string;
  description: string;
  title?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

/** Shared error-boundary body: report once + accessible error card. */
export function ReportedError({ error, retry, tag, description, title, secondaryHref, secondaryLabel }: ReportedErrorProps) {
  useEffect(() => {
    reportClientError(error, tag);
  }, [error, tag]);

  return (
    <AppErrorCard
      digest={error.digest}
      description={description}
      onReset={retry}
      {...(title ? { title } : {})}
      {...(secondaryHref ? { secondaryHref } : {})}
      {...(secondaryLabel ? { secondaryLabel } : {})}
    />
  );
}
