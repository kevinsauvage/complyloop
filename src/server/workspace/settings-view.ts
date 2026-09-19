/**
 * Settings view loader — data-shaping for the `(app)/settings` route.
 *
 * Brings settings under the one-loader-per-page rule every other `(app)`
 * page follows: the page calls exactly this and renders. No JSX here.
 */
import "server-only";

import {
  presetById,
  presetSummaries,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/catalog/registry";
import { isRuntimeOnlyCheck } from "@complyloop/analysis-core/check-authority";
import { CHECK_REGISTRY } from "@complyloop/analysis-core/check-registry";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { latestAssessmentFor } from "@/core/assessment/assessment-helpers";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";

export type SettingsView =
  | { project: null }
  | {
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
    };

/** Everything the settings page renders, derived in one place. */
export async function loadSettingsView(): Promise<SettingsView> {
  const { project, caps } = await loadActiveProjectPage();
  if (!project) return { project: null };

  const runtime = await getProjectRuntime(project.id, {
    findingStatuses: [],
  });
  const latestAssessment = latestAssessmentFor(runtime.assessments, project.id);
  const runtimeError = latestAssessment?.engines?.runtimeError ?? null;
  const runtimeStatus = latestAssessment?.engines?.runtime
    ? `Last assessment audited ${latestAssessment.engines.runtimePagesScanned ?? 0} page(s).`
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
