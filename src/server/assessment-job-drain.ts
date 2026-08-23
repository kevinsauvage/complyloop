import { processNextAssessmentJob } from "./assessment-worker";

/** In local dev, process jobs in-process so `npm run dev` alone is enough. */
export function shouldDrainAssessmentJobsInline(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Claims and runs ready jobs until the queue is idle or `maxJobs` is reached. */
export async function drainAssessmentJobQueue(maxJobs = 20): Promise<void> {
  for (let index = 0; index < maxJobs; index += 1) {
    const result = await processNextAssessmentJob();
    if (result.kind === "idle") return;
  }
}
