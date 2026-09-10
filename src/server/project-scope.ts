import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import { presetById } from "@complyloop/analysis-core/adapters/registry";
import { type Finding } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type {
  Control,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { findingsForProject, requirementsForProject } from "./project-visibility";

/**
 * Control IDs this project assesses. Uses live preset membership so new rules
 * apply without rewriting stored project fields. `undefined` means the whole
 * catalog.
 */
export function scopedControlIds(
  project: Project,
): ReadonlySet<string> | undefined {
  const presetId = project.defaultPresetId;
  if (!presetId) return undefined;
  const preset = presetById(presetId);
  if (!preset) return undefined;
  return new Set(preset.controlIds);
}

/**
 * Controls assessed for a project. `undefined` scope means the full catalog.
 * Pass `catalog` in tests that inject a subset; production uses the shipped set.
 */
export function catalogControls(catalog?: readonly Control[]): Control[] {
  return catalog === undefined ? shippedCatalog().controls : [...catalog];
}

export function controlsInScope(
  project: Project,
  catalog?: readonly Control[],
): Control[] {
  const controls = catalogControls(catalog);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return [...controls];
  return controls.filter((control) => controlIds.has(control.id));
}

/** Fails loud when the catalog or preset scope would produce a no-op assessment. */
export function assertAssessableCatalog(
  project: Project,
  catalog?: readonly Control[],
): Control[] {
  const scoped = controlsInScope(project, catalog);
  if (scoped.length > 0) return scoped;
  throw new PublicError(
    catalogControls(catalog).length === 0
      ? "Compliance catalog is unavailable."
      : "No controls are in scope for this project. Check the assessment preset in Settings.",
  );
}

/** Requirements for a project that fall inside its assessment target. */
export function requirementsInScope(
  requirements: ReadonlyArray<Requirement>,
  project: Project,
): Requirement[] {
  const forProject = requirementsForProject(requirements, project.id);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return forProject;
  return forProject.filter((requirement) =>
    controlIds.has(requirement.controlId),
  );
}

/** Findings for a project that fall inside its assessment target. */
export function findingsInScope(
  findings: ReadonlyArray<Finding>,
  project: Project,
): Finding[] {
  const forProject = findingsForProject(findings, project.id);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return forProject;
  return forProject.filter((finding) => controlIds.has(finding.controlId));
}
