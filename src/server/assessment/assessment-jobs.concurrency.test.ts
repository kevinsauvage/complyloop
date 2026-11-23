import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { ASSESSMENT_QUEUE, createJobQueue } from "@complyloop/db/job-queue";
import { closeDrizzle, getDrizzle } from "@complyloop/db/postgres";
import {
  deleteAssessmentJobsForProject,
  getAssessmentJobStatus,
} from "@complyloop/db/repo/assessment-jobs";

import {
  claimNextAssessmentJob,
  completeAssessmentJob,
  refreshAssessmentJobLease,
  releaseInFlightAssessmentJobs,
} from "./assessment-job-lease";
import {
  activeAssessmentJobForProject,
  cancelAssessmentJob,
  enqueueAssessmentJob,
  recentAssessmentJobsForProject,
} from "./assessment-jobs";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

const suffix = `${Date.now()}-queue`;
const projectA = `proj-a-${suffix}`;
const projectB = `proj-b-${suffix}`;

async function clearJobs(): Promise<void> {
  const drizzle = await getDrizzle();
  await drizzle.execute(sql`
    DELETE FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE}
      AND data->>'projectId' IN (${projectA}, ${projectB})
  `);
}

async function claimOurs() {
  const job = await claimNextAssessmentJob();
  return job && [projectA, projectB].includes(job.projectId) ? job : null;
}

describe.skipIf(!enabled)("assessment queue on pg-boss", () => {
  afterEach(clearJobs);
  afterAll(async () => {
    await clearJobs();
    await closeDrizzle();
  });

  it("runs at most one job per project under concurrent claims", async () => {
    for (const projectId of [projectA, projectA, projectB]) {
      await enqueueAssessmentJob({
        projectId,
        trigger: "verify_remediation",
        payload: { findingId: "f-1" },
      });
    }

    const claimed = (
      await Promise.all([claimOurs(), claimOurs(), claimOurs()])
    ).filter((job) => job !== null);

    expect(claimed.map((job) => job.projectId).sort()).toEqual([
      projectA,
      projectB,
    ]);
    const active = await activeAssessmentJobForProject(projectA);
    expect(active?.status).toBe("running");
    for (const job of claimed) await completeAssessmentJob(job);
  });

  it("returns the original job for a repeated idempotency key", async () => {
    const input = {
      projectId: projectA,
      trigger: "webhook" as const,
      idempotencyKey: `delivery-${suffix}`,
      payload: { ref: "sha-1", eventName: "push" as const },
    };
    const first = await enqueueAssessmentJob(input);
    const second = await enqueueAssessmentJob(input);
    expect(second.id).toBe(first.id);
  });

  it("folds a newer push into the queued webhook job", async () => {
    const first = await enqueueAssessmentJob({
      projectId: projectA,
      trigger: "webhook",
      payload: { ref: "sha-1", eventName: "push" },
    });
    const second = await enqueueAssessmentJob({
      projectId: projectA,
      trigger: "webhook",
      payload: { ref: "sha-2", eventName: "push" },
    });
    expect(second.id).toBe(first.id);
    expect(second.payload).toMatchObject({
      ref: "sha-2",
      supersededRefs: ["sha-1"],
    });
  });

  it("fails a malformed payload instead of scanning it", async () => {
    await createJobQueue(await getDrizzle()).send(
      ASSESSMENT_QUEUE,
      {
        projectId: projectB,
        trigger: "manual",
        payload: ["not", "an", "object"],
      },
      { group: { id: projectB } },
    );
    expect(await claimOurs()).toBeNull();
    const [job] = await recentAssessmentJobsForProject(projectB, 1);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/Malformed job payload/);
  });

  it("hands a crashed worker's job back for a retry", async () => {
    await enqueueAssessmentJob({ projectId: projectA, trigger: "manual" });
    const job = await claimOurs();
    expect(job?.status).toBe("running");

    expect(await releaseInFlightAssessmentJobs("worker crashed")).toBe(1);
    const retried = await activeAssessmentJobForProject(projectA);
    expect(retried).toMatchObject({
      status: "queued",
      error: "worker crashed",
    });
  });

  it("stops the heartbeat once the job is cancelled", async () => {
    await enqueueAssessmentJob({ projectId: projectA, trigger: "manual" });
    const job = await claimOurs();
    if (!job?.leaseExpiresAt || !job.startedAt) throw new Error("no lease");
    const lease = {
      id: job.id,
      attempts: job.attempts,
      leaseExpiresAt: job.leaseExpiresAt,
      startedAt: job.startedAt,
    };
    expect(await refreshAssessmentJobLease(lease)).toBe(job.leaseExpiresAt);

    const cancelled = await cancelAssessmentJob({
      projectId: projectA,
      jobId: job.id,
    });
    expect(cancelled?.status).toBe("cancelled");
    expect(await refreshAssessmentJobLease(lease)).toBeNull();
    expect(
      await cancelAssessmentJob({ projectId: projectB, jobId: job.id }),
    ).toBeNull();
  });

  it("fences out a worker whose job another worker re-claimed", async () => {
    await enqueueAssessmentJob({ projectId: projectA, trigger: "manual" });
    const first = await claimOurs();
    if (!first?.leaseExpiresAt || !first.startedAt) throw new Error("no lease");
    await releaseInFlightAssessmentJobs("heartbeat lapsed");
    const drizzle = await getDrizzle();
    await drizzle.execute(sql`
      UPDATE pgboss.job SET start_after = now() WHERE id = ${first.id}::uuid
    `);
    const second = await claimOurs();
    expect(second).toMatchObject({ id: first.id, attempts: 2 });

    const staleLease = {
      id: first.id,
      attempts: first.attempts,
      leaseExpiresAt: first.leaseExpiresAt,
      startedAt: first.startedAt,
    };
    expect(await refreshAssessmentJobLease(staleLease)).toBeNull();
    expect(
      await getAssessmentJobStatus(drizzle, first.id, first.attempts),
    ).toBeUndefined();
    expect(await getAssessmentJobStatus(drizzle, first.id, 2)).toBe("running");
  });

  it("drops a deleted project's jobs", async () => {
    await enqueueAssessmentJob({ projectId: projectB, trigger: "manual" });
    await deleteAssessmentJobsForProject(await getDrizzle(), projectB);
    expect(await recentAssessmentJobsForProject(projectB, 5)).toEqual([]);
  });
});
