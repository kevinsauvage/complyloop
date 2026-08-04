import {
  DeterminationBadge,
  RequirementStatusBadge,
} from "@/components/badges";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import {
  clearRequirementExceptionAction,
  markRequirementExceptionAction,
} from "@/server/actions";
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
        <div className="flex flex-col gap-4">
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
              <Card key={control.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{control.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {control.description}
                    </p>
                    <p className="mt-2 font-mono text-xs text-zinc-500">
                      {control.code} · {control.secondaryCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RequirementStatusBadge status={requirement.status} />
                    <DeterminationBadge method={requirement.determination} />
                    <span className="text-xs text-zinc-500">
                      {openCount} open · {formatDateTime(requirement.updatedAt)}
                    </span>
                  </div>
                </div>

                {requirement.exception ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p>
                      Exception ({requirement.exception.reason.replace(/_/g, " ")}
                      ): {requirement.exception.note}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Set {formatDateTime(requirement.exception.at)} — sticky until
                      cleared (assessments will not overwrite).
                    </p>
                    <form
                      action={clearRequirementExceptionAction.bind(
                        null,
                        requirement.id,
                      )}
                      className="mt-2"
                    >
                      <button
                        type="submit"
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      >
                        Clear exception &amp; return to automated status
                      </button>
                    </form>
                  </div>
                ) : (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500">
                      Mark requirement exception (N/A / accepted risk / compensating)
                    </summary>
                    <form
                      action={markRequirementExceptionAction.bind(
                        null,
                        requirement.id,
                      )}
                      className="mt-3 flex flex-col gap-2"
                    >
                      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                        Reason
                        <select
                          name="reason"
                          className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                        >
                          <option value="not_applicable">Not applicable</option>
                          <option value="accepted_risk">Accepted risk</option>
                          <option value="compensating_control">
                            Compensating control
                          </option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                        Note (required, kept as evidence)
                        <textarea
                          name="note"
                          required
                          rows={2}
                          className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <div>
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Record exception
                        </button>
                      </div>
                    </form>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
