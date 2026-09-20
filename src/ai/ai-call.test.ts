import { generateObject, generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  AI_MODEL,
  aiCall,
  type AiErrorReport,
  resolveAiModel,
} from "./ai-call";

const NoObjectGeneratedError = vi.hoisted(
  () =>
    class extends Error {
      constructor(message = "No object generated") {
        super(message);
        this.name = "AI_NoObjectGeneratedError";
      }
    },
);

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  NoObjectGeneratedError,
}));

const generate = vi.mocked(generateObject);
const generateFallback = vi.mocked(generateText);
const schema = z.object({ value: z.string() });

function errorHook() {
  const calls: Array<{ error: unknown; report: AiErrorReport }> = [];
  return {
    calls,
    onError: (error: unknown, report: AiErrorReport) => {
      calls.push({ error, report });
    },
  };
}

afterEach(() => {
  generate.mockReset();
  generateFallback.mockReset();
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
    // Generic gateway errors never trigger the text fallback.
    expect(generateFallback).not.toHaveBeenCalled();
  });

  it("retries via text + parse when the model lacks structured-output support", async () => {
    generate.mockRejectedValue(new NoObjectGeneratedError());
    generateFallback.mockResolvedValue({
      text: '```json\n{"value": "ok"}\n```',
    } as never);

    await expect(
      aiCall({ schema, available: true, prompt: "hi", code: "ai_test" }),
    ).resolves.toEqual({ value: "ok" });
    expect(generateFallback).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateFallback).mock.calls[0]?.[0]).toMatchObject({
      prompt: expect.stringContaining(
        "The object must have exactly these keys: value.",
      ),
    });
  });

  it("reports and returns null when the text fallback is not valid JSON", async () => {
    generate.mockRejectedValue(new NoObjectGeneratedError());
    generateFallback.mockResolvedValue({ text: "not json at all" } as never);
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
    expect(hook.calls[0]?.report).toMatchObject({ code: "ai_test" });
  });

  it("reports and returns null when the text fallback fails the schema", async () => {
    generate.mockRejectedValue(new NoObjectGeneratedError());
    generateFallback.mockResolvedValue({ text: '{"other": 1}' } as never);
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
  });
});

describe("resolveAiModel", () => {
  it("defaults to the pinned free-tier model", () => {
    vi.stubEnv("AI_MODEL", "");
    expect(resolveAiModel()).toBe(AI_MODEL);
    vi.unstubAllEnvs();
  });

  it("is overridable via the AI_MODEL env var", () => {
    vi.stubEnv("AI_MODEL", "acme/pro-model");
    expect(resolveAiModel()).toBe("acme/pro-model");
    vi.unstubAllEnvs();
  });

  it("passes the resolved model to the gateway", async () => {
    vi.stubEnv("AI_MODEL", "acme/pro-model");
    try {
      generate.mockResolvedValue({ object: { value: "ok" } } as never);
      await aiCall({ schema, available: true, prompt: "hi", code: "ai_test" });
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "acme/pro-model" }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
