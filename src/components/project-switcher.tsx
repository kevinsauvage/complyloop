"use client";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { switchProjectAction } from "@/server/actions/connect";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export function ProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: Project[];
  activeProjectId: string;
}) {
  if (projects.length <= 1) return null;

  return (
    <form key={activeProjectId} action={switchProjectAction} className="min-w-0">
      <Label htmlFor="project-switcher" className="sr-only">
        Active project
      </Label>
      <select
        id="project-switcher"
        name="projectId"
        defaultValue={activeProjectId}
        className={cn(nativeSelectClass, "max-w-64 truncate")}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {project.github?.fullName ? ` (${project.github.fullName})` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
