import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control, Finding } from "@/core/types";
import { deterministicExplanation, generateAiExplanation } from "./explainer";

const reportWarning = vi.hoisted(() => vi.fn());

vi.mock("@/server/observability", () => ({
  reportWarning: (...args: unknown[]) => reportWarning(...args),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => {
    throw new Error("gateway down");
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  reportWarning.mockClear();
});

const finding = {
  id: "f1",
  reason: "Missing alt",
  location: { kind: "source", filePath: "A.tsx", line: 1, column: 1, snippet: "<img />" },
} as Finding;

const control = {
  id: "c1",
  code: "WCAG 1.1.1",
  secondaryCode: "RGAA 1.1",
  title: "Images",
  description: "Provide text alternatives",
} as Control;

describe("deterministicExplanation", () => {
  it("includes high confidence for the baseline explanation", () => {
    expect(
      deterministicExplanation("Missing alt", {
        impact: "Screen readers skip the image",
        howToFix: "Add alt text",
      }),
    ).toMatchObject({
      provenance: "deterministic",
      confidence: "high",
    });
  });
});

describe("generateAiExplanation", () => {
  it("logs and returns null when the AI call fails", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(reportWarning).toHaveBeenCalledWith(
      "AI explanation unavailable or failed",
      expect.objectContaining({ code: "ai_explanation_failed" }),
    );
  });
});
