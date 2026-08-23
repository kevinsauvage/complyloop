import { afterEach, describe, expect, it } from "vitest";
import { isWorkerAuthConfigured, isWorkerRequestAuthorized } from "./worker-auth";

const originalSecret = process.env.WORKER_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.WORKER_SECRET;
  } else {
    process.env.WORKER_SECRET = originalSecret;
  }
});

describe("worker-auth", () => {
  it("reports when WORKER_SECRET is unset or blank", () => {
    delete process.env.WORKER_SECRET;
    expect(isWorkerAuthConfigured()).toBe(false);

    process.env.WORKER_SECRET = "   ";
    expect(isWorkerAuthConfigured()).toBe(false);
  });

  it("reports when WORKER_SECRET is configured", () => {
    process.env.WORKER_SECRET = "s3cret";
    expect(isWorkerAuthConfigured()).toBe(true);
  });

  it("rejects missing or non-Bearer headers", () => {
    process.env.WORKER_SECRET = "s3cret";
    expect(isWorkerRequestAuthorized(null)).toBe(false);
    expect(isWorkerRequestAuthorized("Basic s3cret")).toBe(false);
    expect(isWorkerRequestAuthorized("Bearer ")).toBe(false);
  });

  it("rejects mismatched secrets with constant-time compare", () => {
    process.env.WORKER_SECRET = "s3cret";
    expect(isWorkerRequestAuthorized("Bearer wrong")).toBe(false);
    expect(isWorkerRequestAuthorized("Bearer s3cret-extra")).toBe(false);
  });

  it("accepts a matching Bearer token", () => {
    process.env.WORKER_SECRET = " s3cret ";
    expect(isWorkerRequestAuthorized("Bearer s3cret")).toBe(true);
  });
});
