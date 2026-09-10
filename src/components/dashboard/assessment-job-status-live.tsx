"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AssessmentJobStatus } from "@/components/dashboard/assessment-job-status";
import { parseAssessmentJobsResponse } from "@/core/assessment-job-guard";
import type { AssessmentJob } from "@/core/assessment-jobs";

const POLL_MS = 3_000;

function hasActiveJob(jobs: AssessmentJob[]): boolean {
  return jobs.some((job) => job.status === "queued" || job.status === "running");
}

export function AssessmentJobStatusLive({
  projectId,
  initialJobs,
  canRetry,
}: {
  projectId: string;
  initialJobs: AssessmentJob[];
  canRetry: boolean;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [pollError, setPollError] = useState<string | null>(null);
  const polling = hasActiveJob(jobs);

  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let inFlight = false;
    let wasActive = true;

    async function poll(): Promise<void> {
      // Skip while a previous request is outstanding or the tab is hidden so a
      // slow response can't stack requests in the background.
      if (cancelled || inFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/projects/${projectId}/assessment-jobs`);
        if (cancelled) return;
        if (!response.ok) {
          setPollError("Could not refresh assessment job status.");
          return;
        }
        const payload = parseAssessmentJobsResponse(await response.json());
        if (cancelled) return;
        const nextJobs = payload;
        const isActive = hasActiveJob(nextJobs);
        if (wasActive && !isActive) {
          router.refresh();
        }
        wasActive = isActive;
        setPollError(null);
        setJobs(nextJobs);
      } catch {
        if (!cancelled) {
          setPollError("Could not refresh assessment job status.");
        }
      } finally {
        inFlight = false;
      }
    }

    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    // Refresh immediately when the tab becomes visible again instead of waiting
    // out the interval.
    const onVisibilityChange = (): void => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [polling, projectId, router]);

  return (
    <AssessmentJobStatus
      jobs={jobs}
      canRetry={canRetry}
      pollError={pollError}
    />
  );
}
