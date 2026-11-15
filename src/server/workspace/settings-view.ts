/** Settings view loader — data-shaping for the settings tab (no JSX here). */
import "server-only";

import {
  presetById,
  presetSummaries,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/catalog/registry";
import { isRuntimeOnlyCheck } from "@complyloop/analysis-core/check-authority";
import { CHECK_REGISTRY } from "@complyloop/analysis-core/check-registry";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { getDrizzle } from "@complyloop/db/postgres";
import { listLatestAssessmentForProject } from "@complyloop/db/repo/assessments";

import { latestAssessmentFor } from "@/core/assessment/assessment-helpers";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { loadProjectPage } from "@/server/workspace/project-page";

export interface SettingsView {
  project: Project;
  caps: ProjectCapabilities;
  latestAssessment: ReturnType<typeof latestAssessmentFor>;
  runtimeError: string | null;
  runtimeStatus: string;
  githubFullName: string | undefined;
  repoUrl: string | undefined;
  defaultPresetId: string;
  defaultPreset: ReturnType<typeof presetById>;
  presets: ReturnType<typeof presetSummaries>;
  runtimeOnlyCheckCount: number;
}

/** Everything the settings page renders, derived in one place. */
export async function loadSettingsView(
  projectId: string,
): Promise<SettingsView> {
  const { project, caps } = await loadProjectPage(projectId);

  // Only the latest assessment record is rendered here. The full runtime load
  // would read every requirement row plus the workspace evidence window for
  // data this page never shows.
  const latestAssessments = await listLatestAssessmentForProject(
    await getDrizzle(),
    project.id,
  );
  const latestAssessment = latestAssessmentFor(latestAssessments, project.id);
  const runtimeError = latestAssessment?.engines?.runtimeError ?? null;
  const runtimeStatus = latestAssessment?.engines?.runtime
    ? `Last assessment audited ${latestAssessment.engines.runtimePagesScanned ?? 0} page(s)${
        latestAssessment.engines.runtimeTied === false
          ? ", but not a deployment of the scanned commit: findings are reported, yet runtime results cannot pass requirements or replace source findings."
          : "."
      }`
    : runtimeError
      ? "Last runtime attempt failed — details below."
      : "No runtime audit has run yet for this project.";

  const githubFullName = project.github?.fullName;
  const repoUrl =
    project.sourceRef ??
    (githubFullName ? `https://github.com/${githubFullName}` : undefined);
  const defaultPresetId = projectDefaultPresetId(project);
  const defaultPreset = presetById(defaultPresetId);
  const presets = presetSummaries();
  const runtimeOnlyCheckCount = CHECK_REGISTRY.filter((entry) =>
    isRuntimeOnlyCheck(entry.id),
  ).length;

  return {
    project,
    caps,
    latestAssessment,
    runtimeError,
    runtimeStatus,
    githubFullName,
    repoUrl,
    defaultPresetId,
    defaultPreset,
    presets,
    runtimeOnlyCheckCount,
  };
}
