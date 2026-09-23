import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureEvent = vi.fn();
let report: ((metric: unknown) => void) | undefined;

vi.mock("@sentry/nextjs", () => ({
  captureEvent: (...args: unknown[]) => captureEvent(...args),
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

afterEach(() => {
  captureEvent.mockClear();
  report = undefined;
});

describe("WebVitals", () => {
  it("reports non-good metrics to Sentry with a unit", () => {
    render(<WebVitals />);
    report?.(metric("LCP", 4200, "poor"));
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent.mock.calls[0]?.[0]).toMatchObject({
      message: "web-vital LCP",
      tags: { "web-vital.rating": "poor" },
      measurements: { lcp: { value: 4200, unit: "millisecond" } },
    });
  });

  it("treats CLS as unitless", () => {
    render(<WebVitals />);
    report?.(metric("CLS", 0.3, "needs-improvement"));
    expect(captureEvent.mock.calls[0]?.[0]).toMatchObject({
      measurements: { cls: { value: 0.3, unit: "none" } },
    });
  });

  it("stays silent for good metrics", () => {
    render(<WebVitals />);
    report?.(metric("FCP", 900, "good"));
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
