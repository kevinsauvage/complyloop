import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isWorkerAuthConfigured(): boolean {
  return Boolean(process.env.WORKER_SECRET?.trim());
}

/** Constant-time Bearer authentication for the internal worker trigger. */
export function isWorkerRequestAuthorized(header: string | null): boolean {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
