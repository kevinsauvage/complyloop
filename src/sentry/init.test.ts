import { afterEach, describe, expect, it, vi } from "vitest";

import { sentryInitOptions, sentryTracesSampleRate } from "./init";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sentryTracesSampleRate", () => {
  it("uses 0.05 in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sentryTracesSampleRate()).toBe(0.05);
  });

  it("uses 0 outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(sentryTracesSampleRate()).toBe(0);
  });
});

describe("sentryInitOptions", () => {
  it("carries the dsn, environment, and resolved trace sample rate", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sentryInitOptions("https://example.ingest.sentry.io/1")).toEqual({
      dsn: "https://example.ingest.sentry.io/1",
      environment: "production",
      tracesSampleRate: 0.05,
      ignoreErrors: [/The destination stream closed early/],
      beforeSend: expect.any(Function),
    });
  });

  it("drops web-vital messages so telemetry never opens an Issue", () => {
    const { beforeSend } = sentryInitOptions(
      "https://example.ingest.sentry.io/1",
    );
    const send = (event: { message?: string }) =>
      beforeSend?.(event as never, {} as never);

    expect(send({ message: "web-vital LCP" })).toBeNull();
    expect(send({ message: "GET /dashboard failed" })).not.toBeNull();
  });
});
