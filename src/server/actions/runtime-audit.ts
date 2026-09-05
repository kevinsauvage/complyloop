"use server";

import { z } from "zod";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { withProjectRowWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

const updateRuntimeAuditInput = z.object({
  runtimeBaseUrl: z.string().optional(),
  runtimeRoutes: z.string().optional(),
});

function parseRoutes(raw: string | undefined): string[] {
  if (raw == null) return ["/"];
  const routes = raw
    .split(/[\n,]+/)
    .map((route) => route.trim())
    .filter((route) => route.length > 0)
    .map((route) =>
      route.startsWith("/") || route.startsWith("http") ? route : `/${route}`,
    );
  return routes.length > 0 ? routes : ["/"];
}

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

    await withProjectRowWrite(async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { project } = workspace;

      if (normalized == null) {
        delete project.runtimeBaseUrl;
        delete project.runtimeRoutes;
        return;
      }

      project.runtimeBaseUrl = normalized;
      project.runtimeRoutes = routes;
    });
    refresh();
    return "Runtime audit settings saved. Run assessment to audit the pages.";
  });
}
