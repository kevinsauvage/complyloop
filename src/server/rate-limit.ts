/**
 * In-process sliding-window rate limiter for expensive server actions.
 * Resets on process restart — suitable for a single-instance pilot.
 */

import { PublicError } from "@/core/public-error";

export class RateLimitError extends PublicError {
  constructor(message = "Too many requests. Try again shortly.") {
    super(message, "rate_limit");
    this.name = "RateLimitError";
  }
}

type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

/** Test helper — clears all windows. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Throws RateLimitError when `key` has exceeded `limit` events in `windowMs`.
 */
export function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  const now = Date.now();
  const entry = windows.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((at) => now - at < windowMs);
  if (entry.timestamps.length >= limit) {
    windows.set(key, entry);
    throw new RateLimitError();
  }
  entry.timestamps.push(now);
  windows.set(key, entry);
}

/** Connect / clone: 10 per user per minute. */
export function assertConnectRateLimit(userId: string): void {
  assertRateLimit(`connect:${userId}`, 10, 60_000);
}

/** Assessment runs: 6 per user per minute. */
export function assertAssessRateLimit(userId: string): void {
  assertRateLimit(`assess:${userId}`, 6, 60_000);
}

/** AI explain / remediate: 20 per user per minute. */
export function assertAiRateLimit(userId: string): void {
  assertRateLimit(`ai:${userId}`, 20, 60_000);
}
