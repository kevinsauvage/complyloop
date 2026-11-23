import type { LanguageModel } from "ai";

/**
 * Resolved AI configuration for one call, built by the server layer (env
 * reads, decryption, platform fallback). `src/ai` never reads credentials from
 * `process.env` and never imports `@/server/*`.
 */
export interface AiConfig {
  /** Explicit gateway instance from `gatewayModel`. */
  model: LanguageModel;
  /** Model id recorded as provenance and shown in the UI. */
  modelId: string;
}
