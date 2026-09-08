"use server";

import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { withProjectWrite } from "../workspace-write";
import { refresh, requireOnActive } from "./shared";

const updateRuntimeAuditInput = z.object({
  runtimeBaseUrl: z.string().optional(),
  runtimeRoutes: z.string().optional(),
});

const ABSOLUTE_ROUTE_MESSAGE =
  "Routes must be paths under the Preview / staging URL (e.g. `/` or `/pricing`), not absolute http(s) URLs.";

function parseRoutes(raw: string | undefined): string[] {
  if (raw == null) return [];
  return raw
    .split(/[\n,]+/)
    .map((route) => route.trim())
    .filter((route) => route.length > 0)
    .map((route) => {
      if (/^https?:\/\//i.test(route)) {
        throw new PublicError(ABSOLUTE_ROUTE_MESSAGE);
      }
      return route.startsWith("/") ? route : `/${route}`;
    });
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
