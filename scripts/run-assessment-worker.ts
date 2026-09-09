#!/usr/bin/env tsx
/** Runs one durable assessment worker process outside the web request path. */
import { processNextAssessmentJob } from "../src/server/assessment-worker";
import { loadLocalEnv } from "./env";

loadLocalEnv();

const pollMs = Math.max(1_000, Number(process.env.WORKER_POLL_MS ?? 5_000));
let stopping = false;

function requestStop(): void {
  stopping = true;
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  while (!stopping) {
    const result = await processNextAssessmentJob();
    if (result.kind === "idle") await sleep(pollMs);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
