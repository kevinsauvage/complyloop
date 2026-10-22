import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureEvent = vi.hoisted(() => vi.fn());
const init = vi.hoisted(() => vi.fn());
let report: ((metric: unknown) => void) | undefined;

vi.mock("@sentry/nextjs", () => ({
  captureEvent,
  init,
}));

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (cb: (metric: unknown) => void) => {
    report = cb;
  },
}));

import { WebVitals } from "./web-vitals";

function metric(name: string, value: number, rating: string) {
  return { name, value, rating, navigationType: "navigate", id: "1" };
}

beforeEach(() => {
  // The SDK is imported on demand; without a DSN nothing loads.
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example/1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  captureEvent.mockClear();
  report = undefined;
});

describe("WebVitals", () => {
  it("reports non-good metrics to Sentry with a unit", async () => {
    render(<WebVitals />);
    report?.(metric("LCP", 4200, "poor"));
    await vi.waitFor(() => expect(captureEvent).toHaveBeenCalledTimes(1));
    expect(captureEvent.mock.calls[0]?.[0]).toMatchObject({
      message: "web-vital LCP",
      tags: { "web-vital.rating": "poor" },
      measurements: { lcp: { value: 4200, unit: "millisecond" } },
    });
  });

  it("treats CLS as unitless", async () => {
    render(<WebVitals />);
    report?.(metric("CLS", 0.3, "needs-improvement"));
    await vi.waitFor(() => expect(captureEvent).toHaveBeenCalled());
    expect(captureEvent.mock.calls[0]?.[0]).toMatchObject({
      measurements: { cls: { value: 0.3, unit: "none" } },
    });
  });

  it("stays silent for good metrics", async () => {
    render(<WebVitals />);
    report?.(metric("FCP", 900, "good"));
    await Promise.resolve();
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
