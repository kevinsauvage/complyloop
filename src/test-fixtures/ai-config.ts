import type { AiConfig } from "@/ai/ai-config";

export const TEST_AI_MODEL = "acme/zero-retention-model";

/**
 * Minimal `AiConfig` for unit tests. The model is an opaque token: tests mock
 * `generateText`, so nothing resolves it, and the cast keeps the fixture
 * independent of the SDK's large union types.
 */
export function testAiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    model: "test-model" as AiConfig["model"],
    modelId: TEST_AI_MODEL,
    ...overrides,
  };
}
