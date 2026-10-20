"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { normalizeRoutes } from "@complyloop/analysis-core/runtime/routes";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { updateProject } from "@complyloop/db/repo/projects";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { assertRuntimeAuditRateLimit } from "../rate-limit";
import {
  resolveActiveProjectId,
  withProjectTx,
} from "../workspace/workspace-write";
import { refresh } from "./shared";

const ABSOLUTE_ROUTE_MESSAGE =
  "Routes must be paths under the Preview / staging URL (e.g. `/` or `/pricing`), not absolute http(s) URLs.";

/**
 * Parses the free-text routes field (newlines/commas), rejecting absolute
 * URLs. Returns `[]` for blank input — storage keeps "not configured" and the
 * scan-time `["/"]` default lives in `runtimeRoutesFor`.
 */
function parseRoutes(raw: string | undefined): string[] {
  if (raw == null) return [];
  const entries = raw.split(/[\n,]+/);
  for (const entry of entries) {
    if (/^https?:\/\//i.test(entry.trim())) {
      throw new PublicError(ABSOLUTE_ROUTE_MESSAGE);
    }
  }
  return normalizeRoutes(entries);
}

const updateRuntimeAuditInput = z.object({
  runtimeBaseUrl: z.string().max(2048).optional(),
  runtimeRoutes: z.string().max(4000).optional(),
});

export async function updateRuntimeAuditAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = parseForm(updateRuntimeAuditInput, formData);
    const base = parsed.runtimeBaseUrl?.trim() ?? "";
    const routes = parseRoutes(parsed.runtimeRoutes);

    // DNS check outside the write transaction so a slow lookup does not block
    // writers.
    let normalized: string | null = null;
    if (base.length > 0) {
      const resolved = await assertSafeRuntimeUrl(base);
      normalized = new URL(resolved).origin;
    }

    const projectId = await resolveActiveProjectId();
    await withProjectTx(projectId, "project.connect", async (ctx) => {
      if (ctx.userId) {
        await assertRuntimeAuditRateLimit(ctx.userId);
      }
      const next = { ...ctx.project };
      if (normalized == null) {
        delete next.runtimeBaseUrl;
        delete next.runtimeRoutes;
      } else {
        next.runtimeBaseUrl = normalized;
        next.runtimeRoutes = routes;
      }
      await updateProject(ctx.tx, next);
    });
    refresh("/settings", "/dashboard", "/requirements");
    return "Runtime audit settings saved. Run assessment to audit the pages.";
  });
}
