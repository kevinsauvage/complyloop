"use server";

import { z } from "zod";

import { maxRuntimePages } from "@complyloop/analysis-core/contract/assessment-limits";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { normalizeRoutes } from "@complyloop/analysis-core/runtime/routes";
import { assertSafeRuntimeUrl } from "@complyloop/analysis-core/runtime/url-safety";
import { updateProject } from "@complyloop/db/repo/projects";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { assertRuntimeAuditRateLimit } from "../rate-limit";
import { requireProjectAccess } from "../workspace/workspace";
import { withProjectTx } from "../workspace/workspace-write";
import { refresh } from "./shared";

const ABSOLUTE_ROUTE_MESSAGE =
  "Routes must be paths under the Preview / staging URL (e.g. `/` or `/pricing`), not absolute http(s) URLs.";

const ROUTE_TOO_LONG_MESSAGE =
  "That page path is too long to audit. Use a path under 2,000 characters.";

/**
 * The picker posts one `runtimeRoutes` value per checked page; a single value
 * arrives as a string. Storage keeps "not configured" for an empty list — the
 * scan-time `["/"]` default lives in `runtimeRoutesFor`.
 */
const runtimeRoutesField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value == null ? [] : Array.isArray(value) ? value : [value],
  );

const updateRuntimeAuditInput = z.object({
  projectId: requiredField("Unknown project."),
  runtimeBaseUrl: z.string().max(2048).optional(),
  runtimeRoutes: runtimeRoutesField,
});

/**
 * Normalizes the selected pages and rejects what the scan cannot use. The
 * count is capped here as well as in the picker: the scan would silently drop
 * pages past its own limit, and a form can always be posted by hand. Duplicate
 * paths collapse — the scan budgets one page per entry, so a repeated path
 * would spend that budget twice on the same URL.
 */
function parseRoutes(entries: readonly string[]): string[] {
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      throw new PublicError(ABSOLUTE_ROUTE_MESSAGE);
    }
    if (trimmed.length > 2000) throw new PublicError(ROUTE_TOO_LONG_MESSAGE);
  }

  const routes = [...new Set(normalizeRoutes(entries))];
  const cap = maxRuntimePages();
  if (routes.length > cap) {
    throw new PublicError(
      `Select at most ${cap} page${cap === 1 ? "" : "s"} to audit per run.`,
    );
  }
  return routes;
}

export async function updateRuntimeAuditAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId, runtimeBaseUrl, runtimeRoutes } = parseForm(
      updateRuntimeAuditInput,
      formData,
    );
    const base = runtimeBaseUrl?.trim() ?? "";
    const routes = parseRoutes(runtimeRoutes);

    // Authorize before any network work: the DNS probe is an outbound request
    // an unauthorized caller must not be able to trigger.
    await requireProjectAccess(projectId, "project.connect");

    // DNS check outside the write transaction so a slow lookup does not block
    // writers.
    let normalized: string | null = null;
    if (base.length > 0) {
      const resolved = await assertSafeRuntimeUrl(base);
      normalized = new URL(resolved).origin;
    }

    await withProjectTx(projectId, "project.connect", async (ctx) => {
      if (ctx.userId) {
        await assertRuntimeAuditRateLimit(ctx.userId, ctx.tx);
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
    refresh(
      "/projects/[projectId]/settings",
      "/projects/[projectId]/dashboard",
      "/projects/[projectId]/requirements",
    );
    return "Runtime audit settings saved. Run assessment to audit the pages.";
  });
}
