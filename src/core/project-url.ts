import type { Project } from "@complyloop/analysis-core/contract/project-types";

/** The project's repository page, derived from its GitHub identity. */
export function projectRepoUrl(
  project: Pick<Project, "github">,
): string | undefined {
  const fullName = project.github?.fullName;
  return fullName ? `https://github.com/${fullName}` : undefined;
}
