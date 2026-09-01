import fs from "node:fs";
import path from "node:path";
import {
  maxCheckoutBytes,
  maxCheckoutFiles,
} from "@/core/assessment-limits";
import { PublicError } from "@/core/public-error";

export {
  maxCheckoutBytes,
  maxCheckoutFiles,
  maxRuntimePages,
} from "@/core/assessment-limits";

/** Rejects oversized clones before AST parsing or Playwright can consume capacity. */
export function assertCheckoutWithinQuota(rootPath: string): void {
  const byteLimit = maxCheckoutBytes();
  const fileLimit = maxCheckoutFiles();
  let bytes = 0;
  let files = 0;
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      bytes += fs.statSync(absolute).size;
      if (files > fileLimit || bytes > byteLimit) {
        throw new PublicError(
          `Repository exceeds the assessment quota (${fileLimit} files or ${Math.floor(byteLimit / 1024 / 1024)} MB).`,
          "assessment_quota_exceeded",
        );
      }
    }
  }
}
