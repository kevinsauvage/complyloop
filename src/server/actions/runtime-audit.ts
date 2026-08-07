"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
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
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { project } = workspace;
      const baseRaw = formData.get("runtimeBaseUrl");
      const base = typeof baseRaw === "string" ? baseRaw.trim() : "";

      if (base.length === 0) {
        delete project.runtimeBaseUrl;
        delete project.runtimeRoutes;
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(base);
      } catch {
        throw new Error("Enter a valid http(s) preview URL.");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Runtime audit URL must be http or https.");
      }

      project.runtimeBaseUrl = `${parsed.protocol}//${parsed.host}`;
      project.runtimeRoutes = parseRoutes(formData.get("runtimeRoutes"));
    });
    refresh();
    return "Runtime audit settings saved. Run assessment to audit the pages.";
  });
}
