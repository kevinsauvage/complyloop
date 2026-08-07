import Link from "next/link";
import { SeverityBadge } from "@/components/badges";
import { Card, formatDateTime } from "@/components/ui";
import type {
  Control,
  EvidenceRecord,
  FileChange,
  Finding,
  FindingCluster,
} from "@/core/types";

export function DashboardActivitySections({
  regressions,
  recentChanges,
  clusters,
  openFindings,
  recentEvidence,
  controlById,
}: {
  regressions: EvidenceRecord[];
  recentChanges: FileChange[];
  clusters: FindingCluster[];
  openFindings: Finding[];
  recentEvidence: EvidenceRecord[];
  controlById: (controlId: string) => Control;
}) {
  return (
    <>
      {regressions.length > 0 ? (
        <Card title="Recent compliance regressions" className="border-red-200">
          <ul className="flex flex-col gap-2">
            {regressions.map((record) => (
              <li key={record.id} className="text-sm text-red-800">
                {record.summary}
                <span className="ml-2 text-xs text-zinc-500">
                  {formatDateTime(record.at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {recentChanges.length > 0 ? (
        <Card title="Changes since previous assessment">
          <ul className="flex flex-col gap-2">
            {recentChanges.slice(0, 8).map((change) => (
              <li
                key={change.filePath}
                className="font-mono text-sm text-zinc-700"
              >
                {change.filePath}
                {change.author ? (
                  <span className="ml-2 font-sans text-xs text-zinc-500">
                    {change.author}
                    {change.commitSubject
                      ? ` — ${change.commitSubject}`
                      : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {clusters.length > 0 ? (
        <Card title="Likely shared root causes">
          <ul className="flex flex-col gap-2">
            {clusters.map((cluster) => (
              <li key={cluster.id} className="text-sm text-zinc-700">
                <Link href="/findings" className="hover:underline">
                  {cluster.label}
                </Link>
                <span className="ml-2 text-xs text-zinc-500">
                  {cluster.findingIds.length} findings
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Needs attention">
        {openFindings.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No open findings. Everything detected has been fixed, verified, or
            reviewed.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {openFindings.slice(0, 6).map((finding) => {
              const control = controlById(finding.controlId);
              return (
                <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/findings/${finding.id}`}
                    className="group flex flex-wrap items-center gap-3"
                  >
                    <SeverityBadge severity={finding.severity} />
                    <span className="text-sm font-medium group-hover:underline">
                      {control.code} — {control.title}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">
                      {finding.location.filePath}:{finding.location.line}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Recent activity">
        <ul className="flex flex-col gap-2">
          {recentEvidence.map((record) => (
            <li key={record.id} className="text-sm text-zinc-600">
              {record.summary}
              <span className="ml-2 text-xs text-zinc-500">
                {formatDateTime(record.at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
