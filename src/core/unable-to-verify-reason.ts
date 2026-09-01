import type { Control, Project } from "./project-types";

export type UnableToVerifyReason =
  | "needs_preview_url"
  | "needs_human_review"
  | "needs_pertinence_review"
  | "needs_heuristic_review"
  | "runtime_only_pending"
  | "non_scorable";

export function unableToVerifyReason(
  control: Pick<Control, "checkId">,
  project: Pick<Project, "runtimeBaseUrl">,
  options: {
    isRuntimeOnlyCheck: boolean;
    isHeuristicCheck?: boolean;
    isPertinenceTwin?: boolean;
  },
): UnableToVerifyReason {
  if (options.isPertinenceTwin) {
    return "needs_pertinence_review";
  }

  if (options.isHeuristicCheck) {
    return "needs_heuristic_review";
  }

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
    case "needs_pertinence_review":
      return "Presence checked; pertinence needs a human.";
    case "needs_heuristic_review":
      return "No suspicious pattern was found; that is not a pass of the criterion — a human still needs to review.";
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
