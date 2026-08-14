import fs from "node:fs";
import path from "node:path";
import { PublicError } from "@/core/public-error";

function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function maxCheckoutBytes(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", 500 * 1024 * 1024);
}

export function maxCheckoutFiles(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_FILES", 50_000);
}

export function maxRuntimePages(): number {
  return positiveEnv("ASSESSMENT_MAX_RUNTIME_PAGES", 25);
}

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
