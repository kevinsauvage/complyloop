/** Why AI is not usable for an organization, for UI gating. */
export type AiStatusReason = "not_configured" | "encryption_unavailable";

/**
 * Serializable view of an organization's AI situation. Never includes key
 * material, only the last four characters for display.
 */
export interface AiStatus {
  available: boolean;
  reason: AiStatusReason | null;
  /** Whose gateway key pays: the organization's or the operator's. */
  source: "org" | "platform" | null;
  model: string | null;
  keyLast4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** False when the deployment has no AI_KEYS_ENCRYPTION_KEY. */
  encryptionConfigured: boolean;
}

/** Shown next to disabled AI buttons so a member knows who can fix it. */
export function aiUnavailableCopy(reason: AiStatusReason | null): string {
  switch (reason) {
    case "encryption_unavailable":
      return "This deployment can't read organization AI keys. Contact the operator to configure AI encryption.";
    case "not_configured":
      return "AI isn't enabled for this organization. An admin can configure it under Organization → AI.";
    case null:
      return "AI isn't enabled for this organization.";
  }
}
