#!/usr/bin/env tsx
/** Load `.env.local` then `.env` for local scripts (same order as Next.js). */
import path from "node:path";
import { config as loadEnv } from "dotenv";

/** Existing process env wins — dotenv does not override by default. */
export function loadLocalEnv(): void {
  loadEnv({ path: path.join(process.cwd(), ".env.local") });
  loadEnv({ path: path.join(process.cwd(), ".env") });
}
