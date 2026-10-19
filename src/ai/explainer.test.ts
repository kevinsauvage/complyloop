import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { aiAvailable } from "./ai-call";
import { deterministicExplanation, generateAiExplanation } from "./explainer";

const TEST_MODEL = "acme/zero-retention-model";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (config: unknown) => config },
}));

const generate = vi.mocked(generateText);

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
  it("requires both the gateway key and an explicit model", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    expect(aiAvailable()).toBe(false);

    // Key alone is not enough: no model means repository contents must not
    // be sent anywhere.
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "");
    expect(aiAvailable()).toBe(false);

    vi.stubEnv("AI_MODEL", TEST_MODEL);
    expect(aiAvailable()).toBe(true);
  });
});

describe("generateAiExplanation", () => {
  it("returns null without credentials", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("AI_MODEL", TEST_MODEL);
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns null without an explicit model", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a provenance-tagged explanation on success", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", TEST_MODEL);
    generate.mockResolvedValue({
      output: {
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
      model: TEST_MODEL,
    });
  });

  it("mentions runtime guidance for DOM findings", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", TEST_MODEL);
    generate.mockResolvedValue({
      output: {
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
    vi.stubEnv("AI_MODEL", TEST_MODEL);
    generate.mockRejectedValue(new Error("gateway down"));
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
  });

  it("returns null when the AI call rejects with a non-Error", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", TEST_MODEL);
    generate.mockRejectedValue("offline");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
  });
});
