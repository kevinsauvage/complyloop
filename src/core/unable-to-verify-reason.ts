import { lookupExhaustive } from "./assert-exhaustive";
import type { Control, Project } from "@complyloop/domain/project-types";

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

const UNABLE_TO_VERIFY_REASON_LABEL: Record<UnableToVerifyReason, string> = {
  needs_preview_url: "Needs a preview URL — runtime-only checks cannot run on source alone.",
  needs_human_review: "Needs human review — this control is not machine-scored.",
  needs_pertinence_review: "Presence checked; pertinence needs a human.",
  needs_heuristic_review: "No suspicious pattern was found; that is not a pass of the criterion — a human still needs to review.",
  runtime_only_pending: "Preview URL is set — re-run assessment after the preview is reachable.",
  non_scorable: "Could not verify automatically — review manually or record an exception.",
};

export function unableToVerifyReasonLabel(reason: UnableToVerifyReason): string {
  return lookupExhaustive(UNABLE_TO_VERIFY_REASON_LABEL, reason, "unable-to-verify reason");
}
