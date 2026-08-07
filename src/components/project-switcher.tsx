"use client";

import type { Project } from "@/core/types";
import { switchProjectAction } from "@/server/actions/connect";

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
    <form
      key={activeProjectId}
      action={switchProjectAction}
      className="flex flex-wrap items-center gap-2"
    >
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        Active project
        <select
          name="projectId"
          defaultValue={activeProjectId}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({sourceLabel(project)})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Switch
      </button>
    </form>
  );
}
