"use server";

import { z } from "zod";
import {
  runAction,
  type ActionState,
} from "../action-state";
import { parseForm } from "@/core/filters";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { normalizeRoutes } from "@complyloop/analysis-core/runtime/routes";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { withProjectWrite } from "../workspace-write";
import { refresh, requireOnActive } from "./shared";

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
  runtimeBaseUrl: z.string().optional(),
  runtimeRoutes: z.string().optional(),
});

export async function updateRuntimeAuditAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = parseForm(updateRuntimeAuditInput, formData);
    const base = parsed.runtimeBaseUrl?.trim() ?? "";
    const routes = parseRoutes(parsed.runtimeRoutes);

    // DNS check outside the write lock so a slow lookup does not block writers.
    let normalized: string | null = null;
    if (base.length > 0) {
      const resolved = await assertSafeRuntimeUrl(base);
      normalized = new URL(resolved).origin;
    }

    await withProjectWrite({ touch: "project" }, async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { project } = workspace;

      if (normalized == null) {
        delete project.runtimeBaseUrl;
        delete project.runtimeRoutes;
        return { project };
      }

      project.runtimeBaseUrl = normalized;
      project.runtimeRoutes = routes;
      return { project };
    });
    refresh();
    return "Runtime audit settings saved. Run assessment to audit the pages.";
  });
}
