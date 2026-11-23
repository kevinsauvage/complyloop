"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  deleteOrgAiSettings,
  findOrgAiSettings,
  insertOrgAiSettingsEvent,
  type OrgAiSettingsRow,
  upsertOrgAiSettings,
} from "@complyloop/db/repo/org-ai-settings";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { decryptOrgAiKey, loadOrgAiSettings } from "../ai/ai-config";
import { withOrgAiWrite } from "../ai/org-ai-write";
import { isSecretBoxConfigured, lastFour, sealSecret } from "../ai/secret-box";
import { aiKeyValidationMessage, validateAiKey } from "../ai/validate-key";
import { assertAiOrgRateLimit, assertAiRateLimit } from "../rate-limit";
import { assertOrgPermission } from "../workspace/project-visibility";
import { getWorkspace } from "../workspace/workspace";
import { refresh, requireSignedIn } from "./shared";

const MAX_API_KEY_CHARS = 512;

const saveOrgAiConfigInput = z.object({
  orgId: requiredField("Select an organization."),
  apiKey: z
    .string()
    .max(MAX_API_KEY_CHARS, { error: "That API key is too long." })
    .optional()
    .transform((value) => value?.trim() || undefined),
  model: requiredField("Enter a model id.", 200),
});

const removeOrgAiConfigInput = z.object({
  orgId: requiredField("Select an organization."),
});

/**
 * Pre-flight authorization before provider I/O. The write path re-checks under
 * the org lock, so a revoked membership cannot slip through between the call
 * and the write.
 */
async function authorizeOrgAi(orgId: string): Promise<void> {
  const { userId } = await requireSignedIn("Sign in to manage AI settings.");
  const { access } = await getWorkspace();
  assertOrgPermission(access.memberships, userId, orgId, "org.manage_ai");
  await assertAiRateLimit(userId);
  await assertAiOrgRateLimit(orgId);
}

/** Stored key for a model-only change; refuses when the envelope is unreadable. */
function storedKey(row: OrgAiSettingsRow | undefined): string {
  if (!row) throw new PublicError("Enter your AI Gateway API key.");
  try {
    return decryptOrgAiKey(row);
  } catch {
    throw new PublicError(
      "Your organization's stored AI key can't be read. Enter it again.",
      "ai_key_unreadable",
    );
  }
}

/**
 * Saves a gateway key + model after a live test call. Omitting `apiKey` keeps
 * the stored key and changes only the model.
 */
export async function saveOrgAiConfigAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void _previous;
  return runAction(async () => {
    const input = parseForm(saveOrgAiConfigInput, formData);
    await authorizeOrgAi(input.orgId);
    if (!isSecretBoxConfigured()) {
      throw new PublicError(
        "This deployment can't store organization AI keys. Ask the operator to configure AI_KEYS_ENCRYPTION_KEY.",
        "ai_encryption_missing",
      );
    }

    const before = await loadOrgAiSettings(input.orgId);
    const apiKey = input.apiKey ?? storedKey(before);
    const validation = await validateAiKey(apiKey, input.model);
    if (validation !== "ok") {
      throw new PublicError(
        aiKeyValidationMessage(validation),
        `ai_key_${validation}`,
      );
    }

    const sealed = sealSecret(apiKey, input.orgId);
    await withOrgAiWrite(input.orgId, async ({ tx, actor }) => {
      // A key rotated by another admin meanwhile must not be overwritten by
      // the stored key this request validated.
      const latest = await findOrgAiSettings(tx, input.orgId);
      if (
        input.apiKey === undefined &&
        latest?.ciphertext !== before?.ciphertext
      ) {
        throw new PublicError(
          "The AI key changed while you were editing. Reopen the page and try again.",
          "ai_key_changed",
        );
      }
      const now = new Date().toISOString();
      await upsertOrgAiSettings(tx, {
        orgId: input.orgId,
        model: input.model,
        ...sealed,
        keyLast4: lastFour(apiKey),
        updatedBy: actor,
        updatedAt: now,
      });
      await insertOrgAiSettingsEvent(tx, {
        id: crypto.randomUUID(),
        orgId: input.orgId,
        at: now,
        actor,
        action: "configured",
        model: input.model,
      });
    });
    refresh("/org");
    return "AI settings saved.";
  });
}

export async function removeOrgAiConfigAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void _previous;
  return runAction(async () => {
    const input = parseForm(removeOrgAiConfigInput, formData);
    await authorizeOrgAi(input.orgId);
    await withOrgAiWrite(input.orgId, async ({ tx, actor }) => {
      const row = await findOrgAiSettings(tx, input.orgId);
      if (!row) throw new PublicError("No AI configuration to remove.");
      await deleteOrgAiSettings(tx, input.orgId);
      await insertOrgAiSettingsEvent(tx, {
        id: crypto.randomUUID(),
        orgId: input.orgId,
        at: new Date().toISOString(),
        actor,
        action: "removed",
        model: row.model,
      });
    });
    refresh("/org");
    return "Organization AI configuration removed.";
  });
}
