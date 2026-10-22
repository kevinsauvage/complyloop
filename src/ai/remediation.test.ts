import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { generateAiRemediation, remediationSchema } from "./remediation";

const TEST_MODEL = "acme/zero-retention-model";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (config: unknown) => config },
}));

const generate = vi.mocked(generateText);

beforeEach(() => {
  vi.stubEnv("AI_MODEL", TEST_MODEL);
  generate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const control = {
  id: "c1",
  code: "WCAG 1.1.1",
  secondaryCode: "RGAA 1.1",
  title: "Images",
  description: "Provide text alternatives",
} as Control;

function sourceFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    projectId: "p1",
    controlId: "c1",
    assessmentId: "a1",
    checkId: "img-alt",
    kind: "violation",
    status: "open",
    severity: "serious",
    confidence: "high",
    reason: "Missing alt",
    location: {
      kind: "source",
      filePath: "A.tsx",
      line: 1,
      column: 1,
      snippet: "<img src='/x.png' />",
      span: { start: 0, end: 20 },
    },
    fix: {
      kind: "insert_attribute",
      attribute: "alt",
      value: "X",
      editable: true,
      span: { start: 0, end: 20 },
    },
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("generateAiRemediation", () => {
  it("returns null when AI credentials are missing", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    await expect(
      generateAiRemediation(sourceFinding(), control),
    ).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a suggestion with provenance when the model succeeds", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockResolvedValue({
      output: {
        description: "Add a descriptive alt",
        proposedSnippet: '<img src="/x.png" alt="Product photo" />',
        attributeValue: "Product photo",
        confidence: "high",
      },
    } as never);

    const result = await generateAiRemediation(sourceFinding(), control);
    expect(result).toMatchObject({
      attributeValue: "Product photo",
      suggestion: {
        description: "Add a descriptive alt",
        proposedSnippet: '<img src="/x.png" alt="Product photo" />',
        provenance: "ai",
        confidence: "high",
        model: TEST_MODEL,
      },
    });
    expect(result?.suggestion.generatedAt).toMatch(/^\d{4}-/);
  });

  it("omits blank attributeValue and prompts for runtime findings", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockResolvedValue({
      output: {
        description: "Fix the call site",
        proposedSnippet: '<Input aria-label="Email" />',
        attributeValue: "   ",
        confidence: "medium",
      },
    } as never);

    const finding = sourceFinding({
      analyzerId: "axe",
      fix: null,
      location: {
        kind: "dom",
        url: "https://preview.example.com/",
        selector: "input",
        snippet: "<input>",
      },
    });
    const result = await generateAiRemediation(finding, control);
    expect(result?.attributeValue).toBeUndefined();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Runtime finding"),
      }),
    );
  });

  it("returns null when the model throws", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue(new Error("gateway down"));

    await expect(
      generateAiRemediation(sourceFinding(), control),
    ).resolves.toBeNull();
  });

  it("returns null when the model rejects with a non-Error", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    generate.mockRejectedValue("boom");

    await expect(
      generateAiRemediation(sourceFinding(), control),
    ).resolves.toBeNull();
  });
});

describe("remediationSchema attributeValue bounds", () => {
  const base = {
    description: "d",
    proposedSnippet: "s",
    confidence: "high" as const,
  };

  it("accepts a normal attribute value", () => {
    expect(
      remediationSchema.safeParse({ ...base, attributeValue: "l'image" })
        .success,
    ).toBe(true);
  });

  it("rejects an over-long value", () => {
    expect(
      remediationSchema.safeParse({ ...base, attributeValue: "x".repeat(257) })
        .success,
    ).toBe(false);
  });

  it("rejects angle brackets and control characters", () => {
    expect(
      remediationSchema.safeParse({ ...base, attributeValue: "<script>" })
        .success,
    ).toBe(false);
    expect(
      remediationSchema.safeParse({ ...base, attributeValue: "a\nb" }).success,
    ).toBe(false);
  });

  it("rejects characters that could break out of the source edit", () => {
    for (const value of ['a"b', "a`b", "a{b", "a}b"]) {
      expect(
        remediationSchema.safeParse({ ...base, attributeValue: value }).success,
      ).toBe(false);
    }
  });

  it("rejects an over-long description or snippet", () => {
    expect(
      remediationSchema.safeParse({
        ...base,
        description: "x".repeat(2_001),
      }).success,
    ).toBe(false);
    expect(
      remediationSchema.safeParse({
        ...base,
        proposedSnippet: "x".repeat(4_001),
      }).success,
    ).toBe(false);
  });
});
