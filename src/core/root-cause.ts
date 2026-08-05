import type { Control, Finding, FindingCluster } from "./types";

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

/**
 * Clusters open findings that share a check and a common location signal
 * (same file, shared component name, or same directory with 2+ findings). Spec §17.
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

    const byFile = new Map<string, Finding[]>();
    const byDir = new Map<string, Finding[]>();
    const byComponent = new Map<string, Finding[]>();
    for (const finding of group) {
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

    const controlTitle =
      controls.find((control) => control.checkId === checkId)?.title ?? checkId;

    for (const [file, members] of byFile) {
      if (members.length < 2) continue;
      clusters.push({
        id: `${checkId}:file:${file}`,
        label: `${members.length} ${controlTitle} findings share \`${file}\``,
        checkId,
        sharedLocation: file,
        findingIds: members.map((finding) => finding.id),
        controlIds: [...new Set(members.map((finding) => finding.controlId))],
      });
    }

    for (const [component, members] of byComponent) {
      if (members.length < 2) continue;
      const distinctPaths = new Set(
        members.map((finding) => finding.location.filePath),
      );
      if (distinctPaths.size < 2) continue;
      clusters.push({
        id: `${checkId}:component:${component}`,
        label: `${members.length} ${controlTitle} findings share component \`${component}\``,
        checkId,
        sharedLocation: component,
        findingIds: members.map((finding) => finding.id),
        controlIds: [...new Set(members.map((finding) => finding.controlId))],
      });
    }

    for (const [dir, members] of byDir) {
      if (members.length < 2) continue;
      // Skip directories already covered entirely by a single-file cluster.
      const fileKeys = new Set(
        members.map((finding) => fileNameOf(finding.location.filePath)),
      );
      if (fileKeys.size === 1) continue;
      clusters.push({
        id: `${checkId}:dir:${dir}`,
        label: `${members.length} ${controlTitle} findings share \`${dir}\``,
        checkId,
        sharedLocation: dir,
        findingIds: members.map((finding) => finding.id),
        controlIds: [...new Set(members.map((finding) => finding.controlId))],
      });
    }
  }

  return clusters.sort((a, b) => b.findingIds.length - a.findingIds.length);
}
