import "server-only";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  findOrgAiSettings,
  listOrgAiSettingsEvents,
  type OrgAiSettingsEventRow,
  type OrgAiSettingsRow,
} from "@complyloop/db/repo/org-ai-settings";

import { AI_UNAVAILABLE_MESSAGE } from "@/ai/ai-call";
import type { AiConfig } from "@/ai/ai-config";
import { gatewayModel } from "@/ai/gateway";

import { aiGatewayApiKey, aiModel } from "../env";
import { reportError } from "../observability";
import {
  isSecretBoxConfigured,
  openSecret,
  SecretBoxError,
} from "./secret-box";
import type { AiStatus } from "./types";

const AI_KEY_UNREADABLE_MESSAGE =
  "Your organization's AI key can't be read. An admin must re-enter it under Organization → AI.";

/** Operator fallback; leaving either variable unset turns it off. */
function platformCredentials(): { apiKey: string; model: string } | null {
  const apiKey = aiGatewayApiKey();
  const model = aiModel();
  return apiKey && model ? { apiKey, model } : null;
}

/** Decrypts a stored row's key; throws `SecretBoxError` on a bad envelope. */
export function decryptOrgAiKey(row: OrgAiSettingsRow): string {
  return openSecret(row, row.orgId);
}

function orgAiConfig(row: OrgAiSettingsRow): AiConfig {
  try {
    return {
      model: gatewayModel(decryptOrgAiKey(row), row.model),
      modelId: row.model,
    };
  } catch (error) {
    reportError(error, { code: "ai_key_unreadable", orgId: row.orgId });
    if (error instanceof SecretBoxError) {
      throw new PublicError(AI_KEY_UNREADABLE_MESSAGE, "ai_key_unreadable");
    }
    throw error;
  }
}

/**
 * The org's own gateway key wins; otherwise the operator's; otherwise AI is
 * off. An unreadable org key never falls back to the operator's key: spend and
 * data must not move to the operator's account behind an admin's back.
 */
export async function prepareAiCallForOrg(
  orgId: string,
  unavailableMessage: string = AI_UNAVAILABLE_MESSAGE,
): Promise<AiConfig> {
  const row = await findOrgAiSettings(await getDrizzle(), orgId);
  if (row) return orgAiConfig(row);
  const platform = platformCredentials();
  if (platform) {
    return {
      model: gatewayModel(platform.apiKey, platform.model),
      modelId: platform.model,
    };
  }
  throw new PublicError(unavailableMessage, "ai_unavailable");
}

export async function loadOrgAiSettings(
  orgId: string,
): Promise<OrgAiSettingsRow | undefined> {
  return findOrgAiSettings(await getDrizzle(), orgId);
}

/** Read-only view for UI gating. Does not decrypt, so the page always renders. */
export async function aiStatusForOrg(orgId: string): Promise<AiStatus> {
  const row = await findOrgAiSettings(await getDrizzle(), orgId);
  const encryptionConfigured = isSecretBoxConfigured();
  if (row) {
    return {
      available: encryptionConfigured,
      reason: encryptionConfigured ? null : "encryption_unavailable",
      source: "org",
      model: row.model,
      keyLast4: row.keyLast4,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      encryptionConfigured,
    };
  }
  const platform = platformCredentials();
  return {
    available: platform !== null,
    reason: platform ? null : "not_configured",
    source: platform ? "platform" : null,
    model: platform?.model ?? null,
    keyLast4: null,
    updatedAt: null,
    updatedBy: null,
    encryptionConfigured,
  };
}

export interface OrgAiSettingsView {
  status: AiStatus;
  recentChanges: OrgAiSettingsEventRow[];
}

/**
 * Org page read. Read-only roles see whether AI is on and the model, not the
 * key's last characters, who configured it, or the change history.
 */
export async function loadOrgAiSettingsView(
  orgId: string,
  canManage: boolean,
): Promise<OrgAiSettingsView> {
  if (!canManage) {
    const status = await aiStatusForOrg(orgId);
    return {
      status: { ...status, keyLast4: null, updatedBy: null },
      recentChanges: [],
    };
  }
  const [status, recentChanges] = await Promise.all([
    aiStatusForOrg(orgId),
    listOrgAiSettingsEvents(await getDrizzle(), orgId, 10),
  ]);
  return { status, recentChanges };
}

export interface OrgAiExport {
  configuration: {
    model: string;
    keyLast4: string;
    updatedAt: string;
    updatedBy: string;
  } | null;
  recentChanges: OrgAiSettingsEventRow[];
}

/** Org-export projection: routing metadata, never the key envelope. */
export async function loadOrgAiExport(orgId: string): Promise<OrgAiExport> {
  const db = await getDrizzle();
  const [row, recentChanges] = await Promise.all([
    findOrgAiSettings(db, orgId),
    listOrgAiSettingsEvents(db, orgId, 50),
  ]);
  return {
    configuration: row
      ? {
          model: row.model,
          keyLast4: row.keyLast4,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        }
      : null,
    recentChanges,
  };
}
