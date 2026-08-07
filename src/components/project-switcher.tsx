"use client";

import type { Project } from "@/core/types";
import { switchProjectAction } from "@/server/actions/connect";
import { Label } from "@/components/ui/label";

function sourceLabel(project: Project): string {
  switch (project.source) {
    case "sample":
      return "sample";
    case "local":
      return "local";
    case "git":
      return "git";
    case "github":
      return "github";
    default: {
      const _exhaustive: never = project.source;
      throw new Error(`Unhandled project source: ${_exhaustive}`);
    }
  }
}

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
        className="h-8 max-w-64 truncate rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ({sourceLabel(project)})
          </option>
        ))}
      </select>
    </form>
  );
}
