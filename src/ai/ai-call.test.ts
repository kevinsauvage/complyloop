import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  AI_UNAVAILABLE_MESSAGE,
  aiCall,
  type AiErrorReport,
  resolveAiModel,
} from "./ai-call";

const TEST_MODEL = "acme/zero-retention-model";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  // `Output.object` is just a marker object the SDK understands; the wrapper
  // passes its arguments straight through so assertions can inspect them.
  Output: { object: (config: unknown) => config },
}));

const generate = vi.mocked(generateText);
const schema = z.object({ value: z.string() });

beforeEach(() => {
  vi.stubEnv("AI_MODEL", TEST_MODEL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  generate.mockReset();
});

function errorHook() {
  const calls: Array<{ error: unknown; report: AiErrorReport }> = [];
  return {
    calls,
    onError: (error: unknown, report: AiErrorReport) => {
      calls.push({ error, report });
    },
  };
}

describe("aiCall", () => {
  it("returns the parsed object when AI is available", async () => {
    generate.mockResolvedValue({ output: { value: "ok" } } as never);

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toEqual({ value: "ok" });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: TEST_MODEL }),
    );
  });

  it("returns null without calling the gateway when AI is unavailable", async () => {
    await expect(
      aiCall({ schema, available: false, prompt: "hi", code: "ai_test" }),
    ).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails closed without a model even when the caller claims availability", async () => {
    vi.stubEnv("AI_MODEL", "");

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("throws a PublicError when unavailable and throwIfUnavailable is set", async () => {
    await expect(
      aiCall({
        schema,
        available: false,
        throwIfUnavailable: true,
        prompt: "hi",
        code: "ai_test",
      }),
    ).rejects.toThrow(new PublicError(AI_UNAVAILABLE_MESSAGE));
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the provided failureMessage when unavailable", async () => {
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
  });

  it("reports through onError and returns null when the gateway call fails", async () => {
    generate.mockRejectedValue(new Error("gateway down"));
    const hook = errorHook();

    await expect(
      aiCall({
        schema,
        available: true,
        prompt: "hi",
        code: "ai_test",
        detail: { findingId: "f1" },
        onError: hook.onError,
      }),
    ).resolves.toBeNull();
    expect(hook.calls).toHaveLength(1);
    expect(hook.calls[0]?.error).toEqual(expect.any(Error));
    expect(hook.calls[0]?.report).toMatchObject({
      code: "ai_test",
      detail: "gateway down",
      findingId: "f1",
    });
  });

  it("stays silent without onError when the gateway call fails", async () => {
    generate.mockRejectedValue(new Error("gateway down"));

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toBeNull();
  });

  it("stringifies non-Error failures in the report detail", async () => {
    generate.mockRejectedValue("offline");
    const hook = errorHook();

    await expect(
      aiCall({
        schema,
        available: true,
        prompt: "hi",
        code: "ai_test",
        onError: hook.onError,
      }),
    ).resolves.toBeNull();
    expect(hook.calls).toHaveLength(1);
    expect(hook.calls[0]?.error).toBe("offline");
    expect(hook.calls[0]?.report).toMatchObject({ detail: "offline" });
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

describe("resolveAiModel", () => {
  it("has no default model when AI_MODEL is unset", () => {
    vi.stubEnv("AI_MODEL", "");
    expect(resolveAiModel()).toBeUndefined();
  });

  it("trims and returns the configured model", () => {
    vi.stubEnv("AI_MODEL", "  acme/pro-model  ");
    expect(resolveAiModel()).toBe("acme/pro-model");
  });
});
