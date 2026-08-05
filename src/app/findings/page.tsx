import Link from "next/link";
import {
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { severityRank } from "@/core/labels";
import { prioritizeClusters } from "@/core/prioritization";
import type { Finding, FindingStatus } from "@/core/types";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
} from "@/server/workspace";

export const dynamic = "force-dynamic";

const SECTIONS: Array<{ status: FindingStatus; title: string }> = [
  { status: "open", title: "Open" },
  { status: "resolved", title: "Resolved" },
  { status: "dismissed", title: "Dismissed" },
];

export default async function FindingsPage() {
  const { db, project } = await getWorkspace();
  const findings = db.findings.filter(
    (finding) => finding.projectId === project.id,
  );

  const byStatus = (status: FindingStatus): Finding[] =>
    findings
      .filter((finding) => finding.status === status)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const clusters = prioritizeClusters(findings, db.controls);

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every failure with its reason, location, remediation state, and evidence."
      />
      {findings.length === 0 ? (
        <EmptyState title="No findings yet">
          <p>Run an assessment from the dashboard to detect compliance gaps.</p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {clusters.length > 0 ? (
            <Card title={`Shared root causes (${clusters.length})`}>
              <ul className="flex flex-col gap-3">
                {clusters.map((cluster) => (
                  <li key={cluster.id}>
                    <p className="text-sm font-medium text-zinc-900">
                      {cluster.label}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {cluster.findingIds.map((findingId) => {
                        const finding = findings.find(
                          (candidate) => candidate.id === findingId,
                        );
                        if (!finding) return null;
                        return (
                          <li key={findingId}>
                            <Link
                              href={`/findings/${findingId}`}
                              className="font-mono text-xs text-zinc-600 hover:underline"
                            >
                              {finding.location.filePath}:{finding.location.line}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {SECTIONS.map(({ status, title }) => {
            const sectionFindings = byStatus(status);
            if (sectionFindings.length === 0) return null;
            return (
              <Card key={status} title={`${title} (${sectionFindings.length})`}>
                <ul className="divide-y divide-zinc-100">
                  {sectionFindings.map((finding) => {
                    const control = controlById(db, finding.controlId);
                    const remediation = remediationForFinding(db, finding.id);
                    return (
                      <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                        <Link
                          href={`/findings/${finding.id}`}
                          className="group flex flex-col gap-1"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={finding.severity} />
                            <RemediationStatusBadge status={remediation.status} />
                            <span className="text-sm font-medium group-hover:underline">
                              {control.code} — {control.title}
                            </span>
                          </span>
                          <span className="text-sm text-zinc-600">{finding.reason}</span>
                          <span className="font-mono text-xs text-zinc-400">
                            {finding.location.filePath}:{finding.location.line}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
