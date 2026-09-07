import type { Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { Finding } from "@complyloop/db/types";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import {
  findingsWithPayloadOverrides,
  mergeRefreshIntoPayload,
  refreshRequirementStatuses,
  type RefreshRequirementStatusesOptions,
} from "./assessment-status";

function requirementsWithPayloadOverrides(
  requirements: ReadonlyArray<Requirement>,
  overrides: ReadonlyArray<Requirement> | undefined,
): Requirement[] {
  if (!overrides || overrides.length === 0) return [...requirements];
  const byId = new Map(overrides.map((requirement) => [requirement.id, requirement]));
  return requirements.map(
    (requirement) => byId.get(requirement.id) ?? requirement,
  );
}

/**
 * After findings/remediations/requirements are staged on `payload`, re-derive
 * requirement statuses for `controlIds` (seeing payload overrides) and merge
 * the result onto the payload.
 */
export function applyEntityWrite(
  payload: ProjectWritePayload,
  input: {
    project: Project;
    findings: ReadonlyArray<Finding>;
    requirements: ReadonlyArray<Requirement>;
    controlIds: readonly string[];
    options?: RefreshRequirementStatusesOptions;
  },
): void {
  if (input.controlIds.length === 0) return;
  mergeRefreshIntoPayload(
    payload,
    refreshRequirementStatuses({
      project: input.project,
      findings: findingsWithPayloadOverrides(input.findings, payload.findings),
      requirements: requirementsWithPayloadOverrides(
        input.requirements,
        payload.requirements,
      ),
      controlIds: input.controlIds,
      options: input.options,
    }),
  );
}
