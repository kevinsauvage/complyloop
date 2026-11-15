import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { entityIdSchema, parseInput } from "@/core/actions/validate";
import { publicErrorMessage } from "@/server/action-state";
import { discoverRuntimeRoutes } from "@/server/assessment/runtime-routes-discovery";
import { getSession } from "@/server/auth-session";
import {
  assertRuntimeAuditRateLimit,
  RateLimitError,
} from "@/server/rate-limit";
import { requireProjectAccess } from "@/server/workspace/workspace";

const runtimeRoutesParamsSchema = z.object({
  projectId: entityIdSchema,
});

const runtimeRoutesBodySchema = z.object({
  baseUrl: z.string().trim().min(1).max(2048),
});

/**
 * Preview-URL picker: reads the site's sitemap and returns the page paths it
 * declares. POST (not a cacheable GET) because the key is a whole URL the user
 * is still typing, and the response is per-attempt rather than a resource.
 *
 * Authorized on `project.connect` — the same permission that saves the preview
 * URL — and rate limited, since this makes the server fetch a host the caller
 * named.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  let projectId: string;
  try {
    projectId = parseInput(runtimeRoutesParamsSchema, await params).projectId;
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await requireProjectAccess(projectId, "project.connect");
  } catch {
    // Never distinguish "missing" from "not allowed" to an unauthorized caller.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let baseUrl: string;
  try {
    baseUrl = parseInput(
      runtimeRoutesBodySchema,
      await request.json().catch(() => null),
      "Enter a preview URL.",
    ).baseUrl;
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error) }, { status: 400 });
  }

  const userId = (await getSession())?.user?.id;
  if (userId) {
    try {
      await assertRuntimeAuditRateLimit(userId);
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      return Response.json(
        { error: publicErrorMessage(error) },
        { status: 429 },
      );
    }
  }

  try {
    return Response.json(await discoverRuntimeRoutes(baseUrl));
  } catch (error) {
    if (error instanceof PublicError) {
      // An unusable URL (private host, blocked port, unresolvable) is the
      // caller's input, not a server fault.
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
