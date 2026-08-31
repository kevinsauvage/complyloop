import type { Control, Project } from "./project-types";

export type UnableToVerifyReason =
  | "needs_preview_url"
  | "needs_human_review"
  | "runtime_only_pending"
  | "non_scorable";

export function unableToVerifyReason(
  control: Pick<Control, "checkId">,
  project: Pick<Project, "runtimeBaseUrl">,
  options: { isRuntimeOnlyCheck: boolean },
): UnableToVerifyReason {
  if (control.checkId === null) {
    return "needs_human_review";
  }

  const hasPreview = Boolean(project.runtimeBaseUrl?.trim());

  if (options.isRuntimeOnlyCheck && !hasPreview) {
    return "needs_preview_url";
  }

  if (options.isRuntimeOnlyCheck && hasPreview) {
    return "runtime_only_pending";
  }

  return "non_scorable";
}

export function unableToVerifyReasonLabel(reason: UnableToVerifyReason): string {
  switch (reason) {
    case "needs_preview_url":
      return "Needs a preview URL — runtime-only checks cannot run on source alone.";
    case "needs_human_review":
      return "Needs human review — this control is not machine-scored.";
    case "runtime_only_pending":
      return "Preview URL is set — re-run assessment after the preview is reachable.";
    case "non_scorable":
      return "Could not verify automatically — review manually or record an exception.";
    default: {
      const _exhaustive: never = reason;
      throw new Error(`Unhandled unable-to-verify reason: ${_exhaustive}`);
    }
  }
}
