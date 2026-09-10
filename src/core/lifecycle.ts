import type {
  Assessment,
  Finding,
  FindingCluster,
  Remediation,
} from "@complyloop/db/types";
import type {
  AssessmentEngines,
  DomLocation,
  RemediationSuggestion,
  SourceLocation,
} from "@complyloop/analysis-core/contract/finding-types";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import type {
  RemediationStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";
import {
  isDomLocation,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";

function mustGet<T extends string, V>(
  record: Record<T, V>,
  key: string,
  kind: string,
): V {
  const value = record[key as T];
  if (value === undefined) {
    throw new Error(`Unhandled ${kind}: ${key}`);
  }
  return value;
}

/** Latest completed assessment for a project, independent of array order. */
export function latestAssessmentFor(
  assessments: ReadonlyArray<Assessment>,
  projectId: string,
): Assessment | undefined {
  let latest: Assessment | undefined;
  for (const assessment of assessments) {
    if (assessment.projectId !== projectId) continue;
    if (
      !latest ||
      assessment.completedAt > latest.completedAt ||
      (assessment.completedAt === latest.completedAt &&
        assessment.startedAt > latest.startedAt)
    ) {
      latest = assessment;
    }
  }
  return latest;
}

export type RuntimeCoverageMode = "source_only" | "source_and_preview";

/** Single predicate for "preview URL configured" (blank/whitespace = absent). */
export function hasPreviewUrl(project: Pick<Project, "runtimeBaseUrl">): boolean {
  return Boolean(project.runtimeBaseUrl?.trim());
}

export interface RuntimeCoverageSummary {
  mode: RuntimeCoverageMode;
  label: string;
  pagesScanned: number | null;
  runtimeError: string | null;
}

export function runtimeCoverageSummary(
  project: Pick<Project, "runtimeBaseUrl">,
  engines?: AssessmentEngines,
): RuntimeCoverageSummary {
  const hasPreviewUrlValue = hasPreviewUrl(project);
  const runtimeError = engines?.runtimeError ?? null;
  const pagesScanned =
    engines?.runtime && typeof engines.runtimePagesScanned === "number"
      ? engines.runtimePagesScanned
      : null;

  if (!hasPreviewUrlValue) {
    return {
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    };
  }

  const pagePart =
    pagesScanned !== null ? ` (${pagesScanned} page${pagesScanned === 1 ? "" : "s"})` : "";

  return {
    mode: "source_and_preview",
    label: `Source + preview${pagePart}`,
    pagesScanned,
    runtimeError,
  };
}

/** Zero-init every status key, then count items by `status`. */
export function countByStatus<T extends string>(
  items: readonly { status: T }[],
  statuses: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    T,
    number
  >;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

/** Count items by a derived string key, returning a Map for O(1) lookups. */
export function toCountMap<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function formatDateTime(iso: string): string {
  return formatDateTimeValue(new Date(iso));
}

function formatDateTimeValue(date: Date): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Zone-qualified timestamp for compliance artifacts (reports, exports).
 * Appends the local UTC offset (e.g. "+02:00") so a printed instant is
 * unambiguous across readers — unlike {@link formatDateTime}, which is
 * local-time-only and safe for interactive UI only. The offset is computed
 * from `getTimezoneOffset` rather than `Intl` `timeZoneName` so it works on
 * every Node/ICU build.
 */
export function formatDateTimeWithZone(iso: string): string {
  const date = new Date(iso);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${formatDateTimeValue(date)} (UTC${sign}${hours}:${minutes})`;
}

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
        members.filter(isSourceFinding).map((finding) => finding.location.filePath),
      );
      if (distinctPaths.size < 2) continue;
      pushCluster(clusters, checkId, controlTitle, "component", members, component);
    }

    for (const [dir, members] of byDir) {
      const fileKeys = new Set(
        members.filter(isSourceFinding).map((finding) => finding.location.filePath),
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
  needs_preview_url: "Needs a preview URL — runtime-only checks cannot run on source alone.",
  needs_human_review: "Needs human review — this control is not machine-scored.",
  needs_pertinence_review: "Presence checked; pertinence needs a human.",
  needs_heuristic_review: "No suspicious pattern was found; that is not a pass of the criterion — a human still needs to review.",
  runtime_only_pending: "Preview URL is set — re-run assessment after the preview is reachable.",
  non_scorable: "Could not verify automatically — review manually or record an exception.",
};

export function unableToVerifyReasonLabel(reason: UnableToVerifyReason): string {
  return mustGet(UNABLE_TO_VERIFY_REASON_LABEL, reason, "unable-to-verify reason");
}

function canTransition(
  from: RemediationStatus,
  to: RemediationStatus,
): boolean {
  switch (from) {
    case "detected":
      return to === "suggested";
    case "suggested":
      return to === "approved";
    case "approved":
      return to === "implemented";
    case "implemented":
      return to === "verified";
    case "verified":
      return false;
    default: {
      const _exhaustive: never = from;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function advanceRemediation(
  remediation: Remediation,
  to: RemediationStatus,
  note?: string,
): Remediation {
  if (!canTransition(remediation.status, to)) {
    throw new Error(
      `Invalid remediation transition: ${remediation.status} → ${to}`,
    );
  }
  return appendRemediationHistory(remediation, to, note);
}

/** Append a history entry without changing status (e.g. failed verification). */
export function appendRemediationHistory(
  remediation: Remediation,
  status: RemediationStatus,
  note?: string,
): Remediation {
  return {
    ...remediation,
    status,
    history: [
      ...remediation.history,
      { status, at: new Date().toISOString(), note },
    ],
  };
}

/**
 * Sets or replaces a remediation suggestion before approval.
 * `detected` → `suggested` via the normal transition; `suggested` stays
 * `suggested` with a history note (refresh, not a status change).
 */
export function refreshSuggestion(
  remediation: Remediation,
  suggestion: RemediationSuggestion,
  note: string,
): Remediation {
  switch (remediation.status) {
    case "detected":
      return advanceRemediation(
        { ...remediation, suggestion },
        "suggested",
        note,
      );
    case "suggested":
      return appendRemediationHistory(
        { ...remediation, suggestion },
        "suggested",
        note,
      );
    case "approved":
    case "implemented":
    case "verified":
      throw new Error(
        "Suggestions can only be set or refreshed before approval.",
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function hasSafeDeterministicFix(finding: Finding): boolean {
  return Boolean(
    finding.fix &&
      !(finding.fix.kind === "insert_attribute" && finding.fix.editable),
  );
}

/** Single copy for the verified-finding description. */
export function verifiedDescription(finding: Finding): string {
  return finding.resolvedNote ?? "Fix confirmed by automated re-check.";
}

/** Bulk approve is for runtime guidance only — source findings use patch → PR. */
export function canBulkApproveRemediation(
  finding: Finding,
  remediationStatus: RemediationStatus,
): boolean {
  return (
    finding.status === "open" &&
    remediationStatus === "suggested" &&
    isDomLocation(finding.location)
  );
}

export interface FindingActInput {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  prUrl: string | null;
  aiAvailable: boolean;
  patchReady: boolean;
  githubConnected: boolean;
}

type FindingActBase = {
  title: string;
  description: string;
  showDismiss: boolean;
  showHandoff: boolean;
};

export type FindingActView =
  | (FindingActBase & {
      beat: "source_generate";
      generateLabel: "Generate patch" | "Verify and prepare patch";
      canGenerate: boolean;
    })
  | (FindingActBase & {
      beat: "source_review";
      showCreatePr: boolean;
      showReplacePatch: boolean;
    })
  | (FindingActBase & { beat: "source_in_review"; prUrl: string })
  | (FindingActBase & { beat: "runtime_generate"; canGenerate: boolean })
  | (FindingActBase & { beat: "runtime_approve" })
  | (FindingActBase & { beat: "runtime_implement" })
  | (FindingActBase & { beat: "runtime_verify" })
  | (FindingActBase & { beat: "verified" })
  | (FindingActBase & { beat: "dismissed" })
  | (FindingActBase & { beat: "view_only" });

function canGenerateSourcePatch(
  finding: Finding,
  aiAvailable: boolean,
  githubConnected: boolean,
): boolean {
  return githubConnected && (hasSafeDeterministicFix(finding) || aiAvailable);
}

function chrome(input: FindingActInput): {
  showDismiss: boolean;
  showHandoff: boolean;
} {
  return {
    showDismiss:
      input.finding.status === "open" &&
      input.canRemediate &&
      input.remediation.status !== "verified",
    showHandoff:
      input.prUrl === null &&
      input.finding.status === "open" &&
      (input.remediation.suggestion !== null || input.finding.fix !== null),
  };
}

function runtimeAct(input: FindingActInput): FindingActView {
  switch (input.remediation.status) {
    case "detected":
      return {
        ...chrome(input),
        beat: "runtime_generate",
        title: "Fix at the call site",
        description:
          "Propose a fix where this element is rendered — not a generic change to a shared component.",
        canGenerate: input.aiAvailable,
      };
    case "suggested":
      return {
        ...chrome(input),
        beat: "runtime_approve",
        title: "Review guidance",
        description: "Approve this suggestion, then implement it in your app.",
      };
    case "approved":
      return {
        ...chrome(input),
        beat: "runtime_implement",
        title: "Implemented outside ComplyLoop",
        description: "After you ship the call-site fix, mark it implemented.",
      };
    case "implemented":
      return {
        ...chrome(input),
        beat: "runtime_verify",
        title: "Confirm the page is fixed",
        description: "Re-run the runtime audit to confirm the page is fixed.",
      };
    case "verified":
      return {
        ...chrome(input),
        beat: "verified",
        title: "Verified",
        description: verifiedDescription(input.finding),
      };
    default: {
      const _exhaustive: never = input.remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

function sourceGenerate(input: FindingActInput): FindingActView {
  const canGenerate = canGenerateSourcePatch(
    input.finding,
    input.aiAvailable,
    input.githubConnected,
  );
  const generateLabel = hasSafeDeterministicFix(input.finding)
    ? "Verify and prepare patch"
    : "Generate patch";
  let description =
    "One focused edit, then ComplyLoop must pass before you open a draft pull request.";
  if (!input.githubConnected) {
    description = "Connect a GitHub repository before generating a patch.";
  } else if (!canGenerate) {
    description = "AI patch generation isn't enabled for this workspace yet.";
  }
  return {
    ...chrome(input),
    beat: "source_generate",
    title: "Fix this finding",
    description,
    generateLabel,
    canGenerate,
  };
}

export function findingAct(input: FindingActInput): FindingActView {
  if (input.finding.status === "dismissed") {
    const dismissal = input.finding.dismissal;
    const rawReason =
      dismissal?.reason.replace(/_/g, " ") ?? "documented exception";
    const reason = rawReason.charAt(0).toUpperCase() + rawReason.slice(1);
    const note = dismissal?.note ? `: ${dismissal.note}` : "";
    return {
      ...chrome(input),
      beat: "dismissed",
      title: "Dismissed — exception on record",
      description: `${reason}${note}`,
    };
  }

  if (
    input.finding.status === "resolved" ||
    input.remediation.status === "verified"
  ) {
    return {
      ...chrome(input),
      beat: "verified",
      title: "Verified",
      description: verifiedDescription(input.finding),
    };
  }

  if (!input.canRemediate) {
    return {
      ...chrome(input),
      beat: "view_only",
      title: "Fix this finding",
      description:
        "You have view-only access on this project. Ask a member or admin to generate patches or verify remediations.",
    };
  }

  if (isSourceLocation(input.finding.location)) {
    if (input.prUrl) {
      return {
        ...chrome(input),
        beat: "source_in_review",
        title: "In review on GitHub",
        description: "Merge the draft PR, then re-assessment will verify.",
        prUrl: input.prUrl,
      };
    }
    if (input.patchReady) {
      return {
        ...chrome(input),
        beat: "source_review",
        title: "Review patch",
        description: input.githubConnected
          ? "ComplyLoop passed. Create a draft pull request to apply this patch on GitHub."
          : "ComplyLoop passed. Connect a GitHub repository to open a draft pull request.",
        showCreatePr: input.githubConnected,
        showReplacePatch: canGenerateSourcePatch(
          input.finding,
          input.aiAvailable,
          input.githubConnected,
        ),
      };
    }
    return sourceGenerate(input);
  }

  return runtimeAct(input);
}
