import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type {
  DomLocation,
  SourceLocation,
} from "@complyloop/analysis-core/contract/finding-types";
import {
  isDomLocation,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";

import { hasPreviewUrl } from "./assessment-helpers";
import { mustGet } from "./display/must-get";

/**
 * Finding prioritization policy: severity order, root-cause clustering,
 * priority scoring, and unable-to-verify reasons. Application policy over
 * domain data — the assessment worker depends on the remediation module,
 * never on this file or the finding-act UX model.
 */

/** Groups findings that share a common technical cause. */
export interface FindingCluster {
  id: string;
  label: string;
  checkId: string;
  /** Shared path prefix or file pattern, e.g. "components/" or "ProductCard.tsx". */
  sharedLocation: string;
  findingIds: string[];
  controlIds: string[];
  /** How many open findings this cluster covers. */
  occurrenceCount?: number;
  /** Priority score (higher = fix first). */
  priorityScore?: number;
}

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  return mustGet(SEVERITY_RANK, severity, "severity");
}

/** Canonical severity order (single source; list filter re-exports it). */
export const SEVERITY_ORDER = [
  "critical",
  "serious",
  "moderate",
  "minor",
] as const satisfies readonly Severity[];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const CONFIDENCE_BONUS: Record<Finding["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

type DomFinding = Finding & { location: DomLocation };

function isDomFinding(finding: Finding): finding is DomFinding {
  return isDomLocation(finding.location);
}

function directoryOf(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "(project root)";
  return `${parts.slice(0, -1).join("/")}/`;
}

function fileNameOf(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}

/** PascalCase component basename without extension, when the path looks like one. */
function componentKey(filePath: string): string | undefined {
  const base = fileNameOf(filePath).replace(/\.(tsx|jsx|ts|js)$/i, "");
  if (/^[A-Z][A-Za-z0-9]+$/.test(base)) return base;
  return undefined;
}

function isSourceFinding(
  finding: Finding,
): finding is Finding & { location: SourceLocation } {
  return isSourceLocation(finding.location);
}

function clusterLabel(
  kind: "file" | "dir" | "component" | "url",
  count: number,
  controlTitle: string,
  location: string,
): string {
  if (kind === "component") {
    return `${count} ${controlTitle} findings share component \`${location}\``;
  }
  if (kind === "url") {
    return `${count} ${controlTitle} findings on \`${location}\``;
  }
  return `${count} ${controlTitle} findings share \`${location}\``;
}

function pushCluster(
  clusters: FindingCluster[],
  checkId: string,
  controlTitle: string,
  kind: "file" | "dir" | "component" | "url",
  members: Finding[],
  sharedLocation: string,
): void {
  if (members.length < 2) return;
  clusters.push({
    id: `${checkId}:${kind}:${sharedLocation}`,
    label: clusterLabel(kind, members.length, controlTitle, sharedLocation),
    checkId,
    sharedLocation,
    findingIds: members.map((finding) => finding.id),
    controlIds: [...new Set(members.map((finding) => finding.controlId))],
  });
}

/**
 * Clusters open findings that share a check and a common location signal
 * (same file, shared component name, or same directory with 2+ findings). Spec §17.
 * DOM findings cluster by URL.
 */
export function clusterFindings(
  findings: ReadonlyArray<Finding>,
  controls: ReadonlyArray<Control>,
): FindingCluster[] {
  const open = findings.filter((finding) => finding.status === "open");
  const byCheck = new Map<string, Finding[]>();
  for (const finding of open) {
    const list = byCheck.get(finding.checkId) ?? [];
    list.push(finding);
    byCheck.set(finding.checkId, list);
  }
  // Index controls once instead of a linear scan per check group.
  const controlByCheckId = new Map<string, Control>();
  for (const control of controls) {
    if (control.checkId) controlByCheckId.set(control.checkId, control);
  }

  const clusters: FindingCluster[] = [];

  for (const [checkId, group] of byCheck) {
    if (group.length < 2) continue;

    const controlTitle = controlByCheckId.get(checkId)?.title ?? checkId;

    const sourceGroup = group.filter(isSourceFinding);
    const domGroup = group.filter(isDomFinding);

    const byFile = new Map<string, Finding[]>();
    const byDir = new Map<string, Finding[]>();
    const byComponent = new Map<string, Finding[]>();
    for (const finding of sourceGroup) {
      const file = finding.location.filePath;
      const dir = directoryOf(finding.location.filePath);
      const fileList = byFile.get(file);
      if (fileList) fileList.push(finding);
      else byFile.set(file, [finding]);
      const dirList = byDir.get(dir);
      if (dirList) dirList.push(finding);
      else byDir.set(dir, [finding]);
      const component = componentKey(finding.location.filePath);
      if (component) {
        const componentList = byComponent.get(component);
        if (componentList) componentList.push(finding);
        else byComponent.set(component, [finding]);
      }
    }

    const byUrl = new Map<string, Finding[]>();
    for (const finding of domGroup) {
      const urlList = byUrl.get(finding.location.url);
      if (urlList) urlList.push(finding);
      else byUrl.set(finding.location.url, [finding]);
    }

    for (const [file, members] of byFile) {
      pushCluster(clusters, checkId, controlTitle, "file", members, file);
    }

    for (const [component, members] of byComponent) {
      const distinctPaths = new Set(
        members
          .filter(isSourceFinding)
          .map((finding) => finding.location.filePath),
      );
      if (distinctPaths.size < 2) continue;
      pushCluster(
        clusters,
        checkId,
        controlTitle,
        "component",
        members,
        component,
      );
    }

    for (const [dir, members] of byDir) {
      const fileKeys = new Set(
        members
          .filter(isSourceFinding)
          .map((finding) => finding.location.filePath),
      );
      if (fileKeys.size === 1) continue;
      pushCluster(clusters, checkId, controlTitle, "dir", members, dir);
    }

    for (const [url, members] of byUrl) {
      pushCluster(clusters, checkId, controlTitle, "url", members, url);
    }
  }

  return clusters.sort((a, b) => b.findingIds.length - a.findingIds.length);
}

function controlWeight(
  finding: Finding,
  controlById: ReadonlyMap<string, Control>,
): number {
  const weight = controlById.get(finding.controlId)?.complianceWeight ?? 1;
  return weight > 0 ? weight : 1;
}

/**
 * Higher score = fix sooner. Combines severity, confidence, cluster size,
 * and optional control complianceWeight (spec §16–17).
 */
function findingPriorityScore(
  finding: Finding,
  clusterSize: number,
  controlById: ReadonlyMap<string, Control> = new Map(),
): number {
  const severityScore = (4 - severityRank(finding.severity)) * 10;
  const confidenceScore = CONFIDENCE_BONUS[finding.confidence];
  const clusterBonus = Math.max(0, clusterSize - 1) * 4;
  const base = severityScore + confidenceScore + clusterBonus;
  return base * controlWeight(finding, controlById);
}

export function prioritizeFindings(
  findings: ReadonlyArray<Finding>,
  controls: ReadonlyArray<Control>,
  clusters: ReadonlyArray<FindingCluster> = clusterFindings(findings, controls),
): Finding[] {
  const sizeByFinding = new Map<string, number>();
  for (const cluster of clusters) {
    for (const id of cluster.findingIds) {
      const previous = sizeByFinding.get(id) ?? 1;
      sizeByFinding.set(id, Math.max(previous, cluster.findingIds.length));
    }
  }
  const controlById = new Map(controls.map((control) => [control.id, control]));

  return [...findings]
    .filter((finding) => finding.status === "open")
    .sort((a, b) => {
      const scoreA = findingPriorityScore(
        a,
        sizeByFinding.get(a.id) ?? 1,
        controlById,
      );
      const scoreB = findingPriorityScore(
        b,
        sizeByFinding.get(b.id) ?? 1,
        controlById,
      );
      if (scoreB !== scoreA) return scoreB - scoreA;
      return severityRank(a.severity) - severityRank(b.severity);
    });
}

/** Enriches clusters with occurrence counts and priority scores. */
export function prioritizeClusters(
  findings: ReadonlyArray<Finding>,
  controls: ReadonlyArray<Control>,
  clusters: ReadonlyArray<FindingCluster> = clusterFindings(findings, controls),
): FindingCluster[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const controlById = new Map(controls.map((control) => [control.id, control]));

  return clusters
    .map((cluster) => {
      const members = cluster.findingIds
        .map((id) => byId.get(id))
        .filter((finding): finding is Finding => finding !== undefined);
      const priorityScore = members.reduce(
        (sum, finding) =>
          sum +
          findingPriorityScore(finding, cluster.findingIds.length, controlById),
        0,
      );
      return {
        ...cluster,
        occurrenceCount: cluster.findingIds.length,
        priorityScore,
        label:
          cluster.findingIds.length >= 3
            ? `${cluster.findingIds.length} failures share one cause at \`${cluster.sharedLocation}\``
            : cluster.label,
      };
    })
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
}

export type UnableToVerifyReason =
  | "needs_preview_url"
  | "needs_human_review"
  | "needs_pertinence_review"
  | "needs_heuristic_review"
  | "runtime_only_pending"
  | "non_scorable";

export function unableToVerifyReason(
  control: Pick<Control, "checkId">,
  project: Pick<Project, "runtimeBaseUrl">,
  options: {
    isRuntimeOnlyCheck: boolean;
    isHeuristicCheck?: boolean;
    isPertinenceTwin?: boolean;
  },
): UnableToVerifyReason {
  if (options.isPertinenceTwin) {
    return "needs_pertinence_review";
  }

  if (options.isHeuristicCheck) {
    return "needs_heuristic_review";
  }

  if (control.checkId === null) {
    return "needs_human_review";
  }

  const hasPreview = hasPreviewUrl(project);

  if (options.isRuntimeOnlyCheck && !hasPreview) {
    return "needs_preview_url";
  }

  if (options.isRuntimeOnlyCheck && hasPreview) {
    return "runtime_only_pending";
  }

  return "non_scorable";
}

const UNABLE_TO_VERIFY_REASON_LABEL: Record<UnableToVerifyReason, string> = {
  needs_preview_url:
    "Needs a preview URL — runtime-only checks cannot run on source alone.",
  needs_human_review:
    "Needs human review — this control is not machine-scored.",
  needs_pertinence_review: "Presence checked; pertinence needs a human.",
  needs_heuristic_review:
    "No suspicious pattern was found; that is not a pass of the criterion — a human still needs to review.",
  runtime_only_pending:
    "Preview URL is set — re-run assessment after the preview is reachable.",
  non_scorable:
    "Could not verify automatically — review manually or record an exception.",
};

export function unableToVerifyReasonLabel(
  reason: UnableToVerifyReason,
): string {
  return mustGet(
    UNABLE_TO_VERIFY_REASON_LABEL,
    reason,
    "unable-to-verify reason",
  );
}
