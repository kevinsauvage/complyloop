import "server-only";

import { generateText } from "ai";

import { GATEWAY_PROVIDER_OPTIONS, gatewayModel } from "@/ai/gateway";

export type AiKeyValidationCode =
  "ok" | "auth_failed" | "model_unavailable" | "network" | "unknown";

const VALIDATION_TIMEOUT_MS = 15_000;
/** One-token probe: enough to prove auth + model, cheap enough to run on save. */
const VALIDATION_PROMPT = "Reply with the single word OK.";

const NETWORK_PATTERN =
  /fetch failed|network|ENOTFOUND|ECONN|ETIMEDOUT|timed out|timeout|aborted|socket/i;

/** Duck-typed on the SDK's error names and status, not its error classes. */
export function classifyAiKeyFailure(error: unknown): AiKeyValidationCode {
  if (!(error instanceof Error)) return "unknown";
  const status =
    "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;
  if (
    error.name === "GatewayAuthenticationError" ||
    error.name === "GatewayForbiddenError" ||
    status === 401 ||
    status === 403
  ) {
    return "auth_failed";
  }
  if (
    error.name === "GatewayModelNotFoundError" ||
    error.name === "NoSuchModelError" ||
    status === 404
  ) {
    return "model_unavailable";
  }
  if (error.name === "TypeError" || NETWORK_PATTERN.test(error.message)) {
    return "network";
  }
  return "unknown";
}

/**
 * Proves a gateway key + model work before anything is stored. Never logs the
 * key and never echoes provider error text (it can quote the request).
 */
export async function validateAiKey(
  apiKey: string,
  model: string,
): Promise<AiKeyValidationCode> {
  try {
    await generateText({
      model: gatewayModel(apiKey, model),
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
      prompt: VALIDATION_PROMPT,
      maxOutputTokens: 8,
      abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
    return "ok";
  } catch (error) {
    return classifyAiKeyFailure(error);
  }
}

/** User-facing copy for a failed validation (no provider text leaks through). */
export function aiKeyValidationMessage(code: AiKeyValidationCode): string {
  switch (code) {
    case "ok":
      return "Key validated.";
    case "auth_failed":
      return "The AI Gateway rejected this key. Check that it is active.";
    case "model_unavailable":
      return "That model is not available through your AI Gateway. Check the model id (for example anthropic/claude-sonnet-5-5).";
    case "network":
      return "Could not reach the AI Gateway to validate the key. Try again in a moment.";
    case "unknown":
      return "The AI Gateway could not validate this key. Check the key and model, then try again.";
  }
}
