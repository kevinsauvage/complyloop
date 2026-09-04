"use client";

import type { AssessmentJob } from "@/server/assessment-jobs";
import { AssessmentJobStatus } from "@/components/dashboard/assessment-job-status";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    let wasActive = true;

    async function poll(): Promise<void> {
      try {
        const response = await fetch(`/api/projects/${projectId}/assessment-jobs`);
        if (cancelled) return;
        if (!response.ok) {
          setPollError("Could not refresh assessment job status.");
          return;
        }
        const payload = (await response.json()) as { jobs: AssessmentJob[] };
        if (cancelled) return;
        const nextJobs = payload.jobs;
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
      }
    }

    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
