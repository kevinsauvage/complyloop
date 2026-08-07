import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { aiExplanationAvailable } from "@/ai/explainer";
import {
  ConfidenceBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { FindingDismissCard } from "@/components/findings/finding-dismiss-card";
import { FindingExplanationsCard } from "@/components/findings/finding-explanations-card";
import { FindingRemediationCard } from "@/components/findings/finding-remediation-card";
import { Card, CodeBlock, PageHeader, formatDateTime } from "@/components/ui";
import { buildDeveloperHandoff } from "@/server/handoff";
import { projectCapabilities } from "@/server/project-capabilities";
import { resolveVisibleFinding } from "@/server/project-visibility";
import { controlById, getWorkspace, remediationForFinding } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function FindingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, access } = await getWorkspace();
  const resolved = resolveVisibleFinding(
    id,
    db.findings,
    db.projects,
    access,
  );
  if (!resolved) notFound();
  const { finding, project } = resolved;
  const caps = projectCapabilities(project, access);

  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, finding.id);
  const evidence = db.evidence
    .filter((record) => record.findingId === finding.id)
    .reverse();
  const aiAvailable = aiExplanationAvailable();
  const handoff = buildDeveloperHandoff(project, control, finding, remediation);
  const showHandoff =
    remediation.suggestion !== null || finding.fix !== null;
  const canCreatePr =
    caps.canRemediate &&
    Boolean(finding.fix) &&
    fs.existsSync(path.join(project.rootPath, ".git"));

  return (
    <>
      <PageHeader
        title={`${control.code} — ${control.title}`}
        description={`${control.secondaryCode} · ${control.description}`}
      >
        <Link href="/findings" className="text-sm text-zinc-500 hover:underline">
          ← All findings
        </Link>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <ConfidenceBadge confidence={finding.confidence} />
        <RemediationStatusBadge status={remediation.status} />
        {finding.status === "dismissed" && finding.dismissal ? (
          <span className="text-sm text-zinc-500">
            Dismissed ({finding.dismissal.reason.replace(/_/g, " ")}):{" "}
            {finding.dismissal.note || "no note"}
          </span>
        ) : null}
        {finding.status === "resolved" && finding.resolvedNote ? (
          <span className="text-sm text-emerald-700">{finding.resolvedNote}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <Card title="Where">
          <p className="mb-2 font-mono text-xs text-zinc-500">
            {finding.location.filePath}:{finding.location.line}:
            {finding.location.column}
          </p>
          <CodeBlock>{finding.location.snippet}</CodeBlock>
        </Card>

        <FindingExplanationsCard
          finding={finding}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        <FindingRemediationCard
          finding={finding}
          remediation={remediation}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        {showHandoff ? (
          <DeveloperHandoffCard
            handoff={handoff}
            findingId={finding.id}
            canCreatePr={canCreatePr}
          />
        ) : null}

        {finding.status === "open" && caps.canRemediate ? (
          <FindingDismissCard findingId={finding.id} />
        ) : null}

        <Card title="Evidence trail">
          {evidence.length === 0 ? (
            <p className="text-sm text-zinc-500">No evidence recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {evidence.map((record) => (
                <li key={record.id} className="text-sm text-zinc-600">
                  {record.summary}
                  <span className="ml-2 text-xs text-zinc-500">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
