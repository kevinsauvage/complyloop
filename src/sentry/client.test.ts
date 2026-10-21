import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ init }));

describe("clientSentry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    init.mockClear();
  });

  it("loads nothing when the browser DSN is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { clientSentry } = await import("./client");
    await expect(clientSentry()).resolves.toBeNull();
    expect(init).not.toHaveBeenCalled();
  });

  it("imports the SDK once and initializes it on first use", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example/1");
    const { clientSentry } = await import("./client");
    const [first, second] = await Promise.all([clientSentry(), clientSentry()]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(init).toHaveBeenCalledTimes(1);
  });
});
