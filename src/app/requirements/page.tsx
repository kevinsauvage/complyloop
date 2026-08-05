import { rgaaPresets } from "@/adapters/rgaa/presets";
import {
  DeterminationBadge,
  RequirementStatusBadge,
} from "@/components/badges";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import {
  applyFrameworkPresetAction,
  clearRequirementExceptionAction,
  importChecklistAction,
  importCustomControlAction,
  markRequirementExceptionAction,
  updateRequirementScopeAction,
} from "@/server/actions";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const { db, project } = await getWorkspace();
  const frameworks = db.frameworks;
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const inScope = new Set(
    project.inScopeControlIds ?? db.controls.map((control) => control.id),
  );

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Bring in and scope controls for "${project.name}" — frameworks: ${frameworks.map((framework) => framework.name).join(", ")}`}
      />

      <div className="mb-6 flex flex-col gap-6">
        <Card title="Framework presets">
          <p className="mb-3 text-sm text-zinc-600">
            Apply a curated RGAA/WCAG subset in one click. You can still fine-tune
            checkboxes below.
          </p>
          <ul className="flex flex-col gap-3">
            {rgaaPresets.map((preset) => (
              <li
                key={preset.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {preset.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {preset.description} · {preset.controlIds.length} controls
                  </p>
                </div>
                <form action={applyFrameworkPresetAction}>
                  <input type="hidden" name="presetId" value={preset.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Apply
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Import checklist">
          <p className="mb-3 text-sm text-zinc-600">
            Paste audit or customer lines as{" "}
            <code className="font-mono text-xs">
              CODE | Title | Description
            </code>
            . Each becomes a manual control (unable to verify until human
            review).
          </p>
          <form action={importChecklistAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Checklist
              <textarea
                name="checklist"
                required
                rows={5}
                placeholder={
                  "CUST-1 | Privacy link present | Marketing pages link to the privacy notice\nCUST-2 | Cookie banner | Consent UI is keyboard accessible"
                }
                className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm font-normal"
              />
            </label>
            <div>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Import checklist
              </button>
            </div>
          </form>
        </Card>

        <Card title="In-scope controls">
          <p className="mb-3 text-sm text-zinc-600">
            Select which controls apply to this project. Assessment only evaluates
            the selected set.
          </p>
          <form action={updateRequirementScopeAction} className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {db.controls.map((control) => {
                const framework = frameworks.find(
                  (candidate) => candidate.id === control.frameworkId,
                );
                return (
                  <li key={control.id} className="flex items-start gap-2 text-sm">
                    <input
                      id={`scope-${control.id}`}
                      type="checkbox"
                      name="controlId"
                      value={control.id}
                      defaultChecked={inScope.has(control.id)}
                      className="mt-1"
                    />
                    <label htmlFor={`scope-${control.id}`} className="text-zinc-800">
                      <span className="font-medium">{control.title}</span>
                      <span className="mt-0.5 block font-mono text-xs text-zinc-500">
                        {control.code}
                        {control.checkId
                          ? ` · check ${control.checkId}`
                          : " · manual (no automated check)"}
                        {framework ? ` · ${framework.name}` : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Save scope
              </button>
            </div>
          </form>
        </Card>

        <Card title="Import a custom control">
          <p className="mb-3 text-sm text-zinc-600">
            Add a checklist item from an audit or customer requirement. Without an
            automated check it stays <em>unable to verify</em> until a human
            records a decision.
          </p>
          <form
            action={importCustomControlAction}
            className="flex max-w-xl flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Code
              <input
                name="code"
                required
                placeholder="e.g. CUST-PRIV-1"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Title
              <input
                name="title"
                required
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Description
              <textarea
                name="description"
                required
                rows={2}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Secondary reference (optional)
              <input
                name="secondaryCode"
                placeholder="e.g. customer checklist §3"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <div>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Import control
              </button>
            </div>
          </form>
        </Card>
      </div>

      {requirements.length === 0 ? (
        <EmptyState title="No requirements assessed yet">
          <p>Run an assessment from the dashboard to evaluate each in-scope requirement.</p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {db.controls
            .filter((control) => inScope.has(control.id))
            .map((control) => {
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
                        Exception (
                        {requirement.exception.reason.replace(/_/g, " ")}
                        ): {requirement.exception.note}
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        Set {formatDateTime(requirement.exception.at)}
                        {requirement.exception.expiresAt
                          ? ` — expires ${formatDateTime(requirement.exception.expiresAt)}`
                          : " — sticky until cleared (assessments will not overwrite)"}
                        .
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
                        Mark requirement exception (N/A / accepted risk /
                        compensating / temporary)
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
                            <option value="temporary">Temporary</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                          Expires (required for temporary)
                          <input
                            type="date"
                            name="expiresAt"
                            className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                          />
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
