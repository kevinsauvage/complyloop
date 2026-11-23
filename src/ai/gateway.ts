import { createGateway, type generateText, type LanguageModel } from "ai";

type AiProviderOptions = NonNullable<
  Parameters<typeof generateText>[0]["providerOptions"]
>;

/**
 * Sent on every call: zero-data-retention routing and no prompt training.
 * OpenAI's strict structured outputs reject our optional schema fields, so
 * strict mode is off; every result is parsed with zod before use.
 */
export const GATEWAY_PROVIDER_OPTIONS: AiProviderOptions = {
  gateway: { zeroDataRetention: true, disallowPromptTraining: true },
  openai: { strictJsonSchema: false },
};

/**
 * Explicit gateway instance. A bare `provider/model` string would make the SDK
 * resolve credentials itself (on Vercel, the deployment's OIDC token), so a
 * customer's call could silently bill the operator.
 */
export function gatewayModel(apiKey: string, modelId: string): LanguageModel {
  return createGateway({ apiKey })(modelId);
}
