import Link from "next/link";
import {
  RequirementStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { severityRank } from "@/core/labels";
import type { RequirementStatus } from "@/core/types";
import { resetProjectAction, runAssessmentAction } from "@/server/actions";
import { controlById, getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

const STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

export default async function DashboardPage() {
  const { db, project } = getWorkspace();
  const latestAssessment = db.assessments
    .filter((assessment) => assessment.projectId === project.id)
    .at(-1);
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const openFindings = db.findings
    .filter((finding) => finding.projectId === project.id && finding.status === "open")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const regressions = db.evidence
    .filter(
      (record) =>
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .slice(-3)
    .reverse();
  const recentEvidence = db.evidence.slice(-6).reverse();

  const counts = new Map<RequirementStatus, number>();
  for (const requirement of requirements) {
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Project "${project.name}" — ${
          latestAssessment
            ? `last assessed ${formatDateTime(latestAssessment.completedAt)}, ${latestAssessment.filesScanned} files scanned`
            : "not assessed yet"
        }`}
      >
        <form action={resetProjectAction}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reset sample project
          </button>
        </form>
        <form action={runAssessmentAction}>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Run assessment
          </button>
        </form>
      </PageHeader>

      {!latestAssessment ? (
        <EmptyState title="Run your first assessment">
          <p>
            The sample project &quot;{project.name}&quot; is connected. Run an
            assessment to evaluate it against the RGAA/WCAG requirements.
          </p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATUS_ORDER.map((status) => (
              <Card key={status}>
                <p className="text-3xl font-semibold">{counts.get(status) ?? 0}</p>
                <div className="mt-2">
                  <RequirementStatusBadge status={status} />
                </div>
              </Card>
            ))}
          </div>

          {regressions.length > 0 ? (
            <Card title="Compliance regressions" className="border-red-200">
              <ul className="flex flex-col gap-2">
                {regressions.map((record) => (
                  <li key={record.id} className="text-sm text-red-800">
                    {record.summary}
                    <span className="ml-2 text-xs text-zinc-400">
                      {formatDateTime(record.at)}
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
                  const control = controlById(db, finding.controlId);
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
                  <span className="ml-2 text-xs text-zinc-400">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
