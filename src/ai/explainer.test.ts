import { generateObject } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { AI_MODEL, aiAvailable } from "./ai-call";
import { deterministicExplanation, generateAiExplanation } from "./explainer";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const generate = vi.mocked(generateObject);

afterEach(() => {
  vi.unstubAllEnvs();
  generate.mockReset();
});

const finding = {
  id: "f1",
  reason: "Missing alt",
  location: {
    kind: "source",
    filePath: "A.tsx",
    line: 1,
    column: 1,
    snippet: "<img />",
  },
} as Finding;

const runtimeFinding = {
  ...finding,
  analyzerId: "axe",
  location: {
    kind: "dom",
    url: "https://preview.example.com/",
    selector: "img",
    snippet: "<img>",
  },
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
      whyItFailed: "Missing alt",
    });
  });
});

describe("aiAvailable", () => {
  it("is true only when AI_GATEWAY_API_KEY is set", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(aiAvailable()).toBe(false);
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(aiAvailable()).toBe(true);
  });
});

describe("generateAiExplanation", () => {
  it("returns null without credentials", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a provenance-tagged explanation on success", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockResolvedValue({
      object: {
        whyItFailed: "No alt",
        impact: "SR users miss it",
        howToFix: "Add alt",
        confidence: "medium",
      },
    } as never);

    await expect(
      generateAiExplanation(finding, control),
    ).resolves.toMatchObject({
      whyItFailed: "No alt",
      impact: "SR users miss it",
      howToFix: "Add alt",
      confidence: "medium",
      provenance: "ai",
      model: AI_MODEL,
    });
  });

  it("mentions runtime guidance for DOM findings", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockResolvedValue({
      object: {
        whyItFailed: "x",
        impact: "y",
        howToFix: "z",
        confidence: "low",
      },
    } as never);

    await generateAiExplanation(runtimeFinding, control);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("rendered-page audit"),
      }),
    );
  });

  it("returns null when the AI call fails", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue(new Error("gateway down"));
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
  });

  it("returns null when the AI call rejects with a non-Error", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue("offline");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
  });
});
