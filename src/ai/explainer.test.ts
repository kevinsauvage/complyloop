import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Finding } from "@complyloop/db/types";
import { generateObject } from "ai";
import {
  aiExplanationAvailable,
  deterministicExplanation,
  generateAiExplanation,
} from "./explainer";
import { setAiWarn } from "./warn";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const generate = vi.mocked(generateObject);
const warn = vi.fn();

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockClear();
  generate.mockReset();
  setAiWarn(() => { });
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
  engine: "ast",
} as Finding;

const runtimeFinding = {
  ...finding,
  engine: "runtime",
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

describe("aiExplanationAvailable", () => {
  it("is true only when AI_GATEWAY_API_KEY is set", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(aiExplanationAvailable()).toBe(false);
    vi.stubEnv("AI_GATEWAY_API_KEY", "k");
    expect(aiExplanationAvailable()).toBe(true);
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

    await expect(generateAiExplanation(finding, control)).resolves.toMatchObject({
      whyItFailed: "No alt",
      impact: "SR users miss it",
      howToFix: "Add alt",
      confidence: "medium",
      provenance: "ai",
      model: "minimax/minimax-m3",
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

  it("logs and returns null when the AI call fails", async () => {
    setAiWarn(warn);
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue(new Error("gateway down"));
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "AI explanation unavailable or failed",
      expect.objectContaining({ code: "ai_explanation_failed" }),
    );
  });

  it("stringifies non-Error failures", async () => {
    setAiWarn(warn);
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue("offline");
    await expect(generateAiExplanation(finding, control)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "AI explanation unavailable or failed",
      expect.objectContaining({ detail: "offline" }),
    );
  });
});
