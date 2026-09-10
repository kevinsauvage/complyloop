"use server";

import { z } from "zod";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "@/core/boundary";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { parseRoutes } from "../runtime-routes";
import { withProjectWrite } from "../workspace-write";
import { refresh, requireOnActive } from "./shared";

const updateRuntimeAuditInput = z.object({
  runtimeBaseUrl: z.string().optional(),
  runtimeRoutes: z.string().optional(),
});

export async function updateRuntimeAuditAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
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
