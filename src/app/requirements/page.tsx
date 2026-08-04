import {
  DeterminationBadge,
  RequirementStatusBadge,
} from "@/components/badges";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const { db, project } = getWorkspace();
  const framework = db.frameworks[0];
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`${framework.name} — applied to "${project.name}"`}
      />
      {requirements.length === 0 ? (
        <EmptyState title="No requirements assessed yet">
          <p>Run an assessment from the dashboard to evaluate each requirement.</p>
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <th scope="col" className="py-2 pr-4">Requirement</th>
                <th scope="col" className="py-2 pr-4">References</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Determination</th>
                <th scope="col" className="py-2 pr-4">Open findings</th>
                <th scope="col" className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {db.controls.map((control) => {
                const requirement = requirements.find(
                  (candidate) => candidate.controlId === control.id,
                );
                if (!requirement) return null;
                const openCount = db.findings.filter(
                  (finding) =>
                    finding.projectId === project.id &&
                    finding.controlId === control.id &&
                    finding.status === "open",
                ).length;
                return (
                  <tr key={control.id} className="border-b border-zinc-100 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{control.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{control.description}</p>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-500">
                      {control.code}
                      <br />
                      {control.secondaryCode}
                    </td>
                    <td className="py-3 pr-4">
                      <RequirementStatusBadge status={requirement.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <DeterminationBadge method={requirement.determination} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{openCount}</td>
                    <td className="py-3 text-xs text-zinc-500">
                      {formatDateTime(requirement.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
