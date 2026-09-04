import type {
  Finding,
  FindingCluster,
  SourceLocation,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "./project-types";
import { isSourceLocation } from "./location";

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

  const clusters: FindingCluster[] = [];

  for (const [checkId, group] of byCheck) {
    if (group.length < 2) continue;

    const controlTitle =
      controls.find((control) => control.checkId === checkId)?.title ??
      checkId;

    const sourceGroup = group.filter(isSourceFinding);
    const domGroup = group.filter(
      (finding) => finding.location.kind === "dom",
    );

    const byFile = new Map<string, Finding[]>();
    const byDir = new Map<string, Finding[]>();
    const byComponent = new Map<string, Finding[]>();
    for (const finding of sourceGroup) {
      const file = fileNameOf(finding.location.filePath);
      const dir = directoryOf(finding.location.filePath);
      byFile.set(file, [...(byFile.get(file) ?? []), finding]);
      byDir.set(dir, [...(byDir.get(dir) ?? []), finding]);
      const component = componentKey(finding.location.filePath);
      if (component) {
        byComponent.set(component, [
          ...(byComponent.get(component) ?? []),
          finding,
        ]);
      }
    }

    const byUrl = new Map<string, Finding[]>();
    for (const finding of domGroup) {
      if (finding.location.kind !== "dom") continue;
      byUrl.set(finding.location.url, [
        ...(byUrl.get(finding.location.url) ?? []),
        finding,
      ]);
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
        members.filter(isSourceFinding).map((finding) =>
          fileNameOf(finding.location.filePath),
        ),
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
