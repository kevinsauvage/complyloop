import type { Route } from "next";

/**
 * Project-scoped tabs — the segment under `/projects/[projectId]`. The active
 * project lives in the URL, so a project page is always reachable by link;
 * never build a bare `/dashboard` (that route no longer exists).
 */
export const PROJECT_TABS = [
  "dashboard",
  "requirements",
  "findings",
  "evidence",
  "settings",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export type ProjectPath = `/projects/${string}/${ProjectTab}`;
export type ProjectFindingPath = `/projects/${string}/findings/${string}`;
export type ProjectEvidenceReportPath =
  | `/projects/${string}/evidence/report`
  | `/projects/${string}/evidence/report/html`;
export type ProjectEvidenceExportPath = `/projects/${string}/evidence/export`;

type ProjectBase =
  | ProjectPath
  | ProjectFindingPath
  | ProjectEvidenceReportPath
  | ProjectEvidenceExportPath;

/**
 * Project-scoped link target, with or without a query string or hash anchor.
 * Declared as template literal types so `typedRoutes` validates them at the
 * `Link`/`router` boundary instead of forcing an `as Route` cast at every call
 * site.
 */
export type ProjectHref =
  ProjectBase | `${ProjectBase}?${string}` | `${ProjectBase}#${string}`;

/** Any in-app link target: static routes plus the project-scoped ones. */
export type AppHref = Route | ProjectHref | `${Route | ProjectHref}?${string}`;

export function projectPath(projectId: string, tab: ProjectTab): ProjectPath {
  return `/projects/${projectId}/${tab}`;
}

export function projectFindingPath(
  projectId: string,
  findingId: string,
): ProjectFindingPath {
  return `/projects/${projectId}/findings/${findingId}`;
}

export function projectEvidenceReportPath(
  projectId: string,
  format: "markdown" | "html",
): ProjectEvidenceReportPath {
  return format === "html"
    ? `/projects/${projectId}/evidence/report/html`
    : `/projects/${projectId}/evidence/report`;
}

export function projectEvidenceExportPath(
  projectId: string,
): ProjectEvidenceExportPath {
  return `/projects/${projectId}/evidence/export`;
}
