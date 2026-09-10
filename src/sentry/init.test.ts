import { afterEach, describe, expect, it, vi } from "vitest";
import { sentryInitOptions, sentryTracesSampleRate } from "./init";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sentryTracesSampleRate", () => {
  it("uses 0.05 in production when unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "");
    expect(sentryTracesSampleRate()).toBe(0.05);
  });

  it("uses 0 outside production when unset", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "");
    expect(sentryTracesSampleRate()).toBe(0);
  });

  it("honors a valid SENTRY_TRACES_SAMPLE_RATE override", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.2");
    expect(sentryTracesSampleRate()).toBe(0.2);
  });

  it("ignores out-of-range overrides", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "1.5");
    expect(sentryTracesSampleRate()).toBe(0);
  });
});

describe("sentryInitOptions", () => {
  it("carries the dsn, environment, and resolved trace sample rate", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.5");
    expect(sentryInitOptions("https://example.ingest.sentry.io/1")).toEqual({
      dsn: "https://example.ingest.sentry.io/1",
      environment: "production",
      tracesSampleRate: 0.5,
    });
  });
});
