import Link from "next/link";
import { notFound } from "next/navigation";
import { aiExplanationAvailable } from "@/ai/explainer";
import {
  ConfidenceBadge,
  EngineBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { FindingDismissCard } from "@/components/findings/finding-dismiss-card";
import { FindingExplanationsCard } from "@/components/findings/finding-explanations-card";
import { FindingRemediationCard } from "@/components/findings/finding-remediation-card";
import { formatLocationRef } from "@/core/location";
import { CodeBlock, PageHeader, formatDateTime } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  const caps = projectCapabilities(project, access, project.orgId);

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
    Boolean(project.github?.fullName);

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="-ml-2.5" asChild>
          <Link href="/findings">← All findings</Link>
        </Button>
      </div>
      <PageHeader
        title={`${control.code} — ${control.title}`}
        description={`${control.secondaryCode} · ${control.description}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <ConfidenceBadge confidence={finding.confidence} />
        <RemediationStatusBadge status={remediation.status} />
        <EngineBadge engine={finding.engine ?? "ast"} />
        {finding.status === "dismissed" && finding.dismissal ? (
          <span className="text-sm text-muted-foreground">
            Dismissed ({finding.dismissal.reason.replace(/_/g, " ")}):{" "}
            {finding.dismissal.note || "no note"}
          </span>
        ) : null}
        {finding.status === "resolved" && finding.resolvedNote ? (
          <span className="text-sm text-emerald-400">{finding.resolvedNote}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Where</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="font-mono text-xs text-muted-foreground">
              {formatLocationRef(finding.location)}
            </p>
            {finding.location.kind === "dom" ? (
              <p className="text-sm text-muted-foreground">
                Runtime finding on the rendered page. Fix the form/call site that
                renders this control — not a shared Input primitive unless every
                consumer is wrong.
              </p>
            ) : null}
            <CodeBlock>{finding.location.snippet}</CodeBlock>
          </CardContent>
        </Card>

        <Separator />

        <FindingExplanationsCard
          finding={finding}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        <Separator />

        <FindingRemediationCard
          finding={finding}
          remediation={remediation}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        {showHandoff ? (
          <>
            <Separator />
            <DeveloperHandoffCard
              handoff={handoff}
              findingId={finding.id}
              canCreatePr={canCreatePr}
            />
          </>
        ) : null}

        {finding.status === "open" && caps.canRemediate ? (
          <>
            <Separator />
            <FindingDismissCard findingId={finding.id} />
          </>
        ) : null}

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Evidence trail</CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evidence recorded yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {evidence.map((record) => (
                  <li key={record.id} className="text-sm text-muted-foreground">
                    {record.summary}
                    <span className="ml-2 text-xs opacity-70">
                      {formatDateTime(record.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
