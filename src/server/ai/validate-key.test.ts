import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GATEWAY_PROVIDER_OPTIONS } from "@/ai/gateway";

import {
  aiKeyValidationMessage,
  classifyAiKeyFailure,
  validateAiKey,
} from "./validate-key";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  createGateway: vi.fn(() => () => ({ provider: "gateway", modelId: "m" })),
}));

const generate = vi.mocked(generateText);

afterEach(() => {
  generate.mockReset();
});

function named(name: string, statusCode?: number): Error {
  const error = new Error(name);
  error.name = name;
  return statusCode === undefined
    ? error
    : Object.assign(error, { statusCode });
}

describe("validateAiKey", () => {
  it("accepts a key whose probe answers, with zero-retention routing", async () => {
    generate.mockResolvedValue({ text: "OK" } as never);
    await expect(validateAiKey("vck_x", "openai/gpt-5")).resolves.toBe("ok");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ providerOptions: GATEWAY_PROVIDER_OPTIONS }),
    );
  });

  it("classifies the probe failure", async () => {
    generate.mockRejectedValueOnce(named("GatewayAuthenticationError"));
    await expect(validateAiKey("vck_x", "m")).resolves.toBe("auth_failed");

    generate.mockRejectedValueOnce(named("GatewayModelNotFoundError"));
    await expect(validateAiKey("vck_x", "m")).resolves.toBe(
      "model_unavailable",
    );

    generate.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(validateAiKey("vck_x", "m")).resolves.toBe("network");
  });

  it("gives a distinct message per failure code", () => {
    const messages = new Set(
      (
        [
          "ok",
          "auth_failed",
          "model_unavailable",
          "network",
          "unknown",
        ] as const
      ).map((code) => aiKeyValidationMessage(code)),
    );
    expect(messages.size).toBe(5);
  });
});

describe("classifyAiKeyFailure", () => {
  it("classifies authentication and forbidden failures", () => {
    expect(classifyAiKeyFailure(named("GatewayForbiddenError"))).toBe(
      "auth_failed",
    );
    expect(classifyAiKeyFailure(named("APICallError", 401))).toBe(
      "auth_failed",
    );
    expect(classifyAiKeyFailure(named("APICallError", 403))).toBe(
      "auth_failed",
    );
  });

  it("classifies missing models", () => {
    expect(classifyAiKeyFailure(named("NoSuchModelError"))).toBe(
      "model_unavailable",
    );
    expect(classifyAiKeyFailure(named("APICallError", 404))).toBe(
      "model_unavailable",
    );
  });

  it("classifies network failures and leaves the rest unknown", () => {
    expect(classifyAiKeyFailure(new Error("ECONNREFUSED"))).toBe("network");
    expect(classifyAiKeyFailure(named("APICallError", 400))).toBe("unknown");
    expect(classifyAiKeyFailure("offline")).toBe("unknown");
  });
});
