import {
  controlDisplayCodes,
  groupControlsByTheme,
} from "@complyloop/analysis-core/catalog/control-theme";
import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import { RequirementCard } from "@/components/requirements/requirement-card";

export function AssessedRequirementList({
  controls,
  requirements,
  openFindingCounts,
  frameworkId,
  canRemediate,
  project,
}: {
  controls: Control[];
  requirements: Requirement[];
  openFindingCounts: Map<string, number>;
  frameworkId: string;
  canRemediate: boolean;
  project: Pick<Project, "runtimeBaseUrl">;
}) {
  const groups = groupControlsByTheme(controls, frameworkId);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.id}
          className="flex flex-col gap-3"
          aria-labelledby={`theme-${group.id}`}
        >
          <h3
            id={`theme-${group.id}`}
            className="text-sm font-medium text-muted-foreground"
          >
            {group.label}
          </h3>
          {group.controls.map((control) => {
            const requirement = requirements.find(
              (candidate) => candidate.controlId === control.id,
            );
            if (!requirement) return null;
            const display = controlDisplayCodes(control, frameworkId);
            return (
              <RequirementCard
                key={control.id}
                control={{ ...control, ...display }}
                requirement={requirement}
                openCount={openFindingCounts.get(control.id) ?? 0}
                canRemediate={canRemediate}
                project={project}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
