"use client";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { AutoSubmitSelectForm } from "@/components/forms/auto-submit-select-form";
import { switchProjectAction } from "@/server/actions/connect";

export function ProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId: string;
}) {
  return (
    <AutoSubmitSelectForm
      id="project-switcher"
      name="projectId"
      action={switchProjectAction}
      label="Active project"
      defaultValue={activeProjectId}
      className="max-w-64"
      options={projects.map((project) => ({
        value: project.id,
        label: project.github?.fullName
          ? `${project.name} (${project.github.fullName})`
          : project.name,
      }))}
    />
  );
}
