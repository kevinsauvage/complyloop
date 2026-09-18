#!/usr/bin/env tsx
/**
 * Prints the drainable assessment-job depth (queued + running) for the
 * assessment-worker queue gate. Last stdout line is always the bare number
 * so the workflow can `tail -n 1` past driver debug logs.
 * Usage: npx tsx --conditions=react-server scripts/queue-depth.ts
 */
import { queuedAssessmentJobCount } from "../src/server/assessment/assessment-jobs";
import { loadLocalEnv } from "./env";

loadLocalEnv();

async function main(): Promise<void> {
  console.log(await queuedAssessmentJobCount());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
