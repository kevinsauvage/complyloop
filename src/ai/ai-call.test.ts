import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateObject } from "ai";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { reportError } from "@/server/observability";
import { aiCall } from "./ai-call";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/server/observability", () => ({
  reportError: vi.fn(),
}));

const generate = vi.mocked(generateObject);
const report = vi.mocked(reportError);
const schema = z.object({ value: z.string() });

afterEach(() => {
  generate.mockReset();
  report.mockReset();
});

describe("aiCall", () => {
  it("returns the parsed object when AI is available", async () => {
    generate.mockResolvedValue({ object: { value: "ok" } } as never);

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toEqual({ value: "ok" });
  });

  it("returns null without calling the gateway when AI is unavailable", async () => {
    await expect(
      aiCall({ schema, available: false, prompt: "hi", code: "ai_test" }),
    ).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("throws a PublicError when unavailable and throwIfUnavailable is set", async () => {
    await expect(
      aiCall({
        schema,
        available: false,
        throwIfUnavailable: true,
        failureMessage: "AI disabled",
        prompt: "hi",
        code: "ai_test",
      }),
    ).rejects.toThrow(new PublicError("AI disabled"));
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports and returns null when the gateway call fails", async () => {
    generate.mockRejectedValue(new Error("gateway down"));

    await expect(
      aiCall({
        schema,
        available: true,
        prompt: "hi",
        code: "ai_test",
        detail: { findingId: "f1" },
      }),
    ).resolves.toBeNull();
    expect(report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        code: "ai_test",
        detail: "gateway down",
        findingId: "f1",
      }),
    );
  });

  it("stringifies non-Error failures in the report detail", async () => {
    generate.mockRejectedValue("offline");

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toBeNull();
    expect(report).toHaveBeenCalledWith(
      "offline",
      expect.objectContaining({ detail: "offline" }),
    );
  });

  it("throws a PublicError when the gateway fails and throwIfUnavailable is set", async () => {
    generate.mockRejectedValue(new Error("rate limited"));

    await expect(
      aiCall({
        schema,
        available: true,
        throwIfUnavailable: true,
        failureMessage: "AI patch generation failed",
        prompt: "hi",
        code: "ai_test",
      }),
    ).rejects.toThrow(new PublicError("AI patch generation failed"));
  });
});
