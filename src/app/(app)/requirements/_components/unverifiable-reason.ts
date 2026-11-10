import { isPertinenceTwinControl } from "@complyloop/analysis-core/catalog/rgaa/pertinence-twins";
import {
  isHeuristicCheck,
  isRuntimeOnlyCheck,
} from "@complyloop/analysis-core/check-authority";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import {
  type UnableToVerifyReason,
  unableToVerifyReason,
} from "@/core/findings/finding-priority";

/** Why automation could not decide this control (card alert + "Copy for AI"). */
export function controlUnverifiableReason(
  control: Pick<Control, "id" | "checkId">,
  project: Pick<Project, "runtimeBaseUrl">,
): UnableToVerifyReason {
  return unableToVerifyReason(control, project, {
    isRuntimeOnlyCheck: control.checkId
      ? isRuntimeOnlyCheck(control.checkId)
      : false,
    isHeuristicCheck: control.checkId
      ? isHeuristicCheck(control.checkId)
      : false,
    isPertinenceTwin: isPertinenceTwinControl(control.id),
  });
}
