"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export type RuntimeAuditFormState = ActionMessageState;

function parseRoutes(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return ["/"];
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
  _previous: RuntimeAuditFormState,
  formData: FormData,
): Promise<RuntimeAuditFormState> {
  return runActionMessage(async () => {
    const baseRaw = formData.get("runtimeBaseUrl");
    const base = typeof baseRaw === "string" ? baseRaw.trim() : "";
    const routes = parseRoutes(formData.get("runtimeRoutes"));

    // DNS check outside the write lock so a slow lookup does not block writers.
    let normalized: string | null = null;
    if (base.length > 0) {
      const resolved = await assertSafeRuntimeUrl(base);
      normalized = new URL(resolved).origin;
    }

    await withWorkspaceWrite(async (workspace) => {
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
