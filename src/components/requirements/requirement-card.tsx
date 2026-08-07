import {
  DeterminationBadge,
  RequirementStatusBadge,
} from "@/components/badges";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, formatDateTime } from "@/components/ui";
import type { Control, Requirement } from "@/core/types";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "@/server/actions/requirements";

export function RequirementCard({
  control,
  requirement,
  openCount,
  canRemediate,
}: {
  control: Control;
  requirement: Requirement;
  openCount: number;
  canRemediate: boolean;
}) {
  return (
    <Card>
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

      {requirement.humanPass ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p>
            Human pass: {requirement.humanPass.note}
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Set {formatDateTime(requirement.humanPass.at)} — sticky
            until cleared (assessments will not overwrite).
          </p>
          {canRemediate ? (
            <StatefulActionForm
              action={clearRequirementHumanPassAction.bind(
                null,
                requirement.id,
              )}
              submitLabel="Clear human pass & return to unable to verify"
              pendingLabel="Clearing…"
              submitClassName="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
              className="mt-2"
            />
          ) : null}
        </div>
      ) : null}

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
          {canRemediate ? (
            <StatefulActionForm
              action={clearRequirementExceptionAction.bind(
                null,
                requirement.id,
              )}
              submitLabel="Clear exception & return to automated status"
              pendingLabel="Clearing…"
              submitClassName="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              className="mt-2"
            />
          ) : null}
        </div>
      ) : canRemediate ? (
        <div className="mt-4 flex flex-col gap-3">
          {control.checkId === null && !requirement.humanPass ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-zinc-500">
                Mark passed (human review)
              </summary>
              <StatefulActionForm
                action={markRequirementPassedAction.bind(
                  null,
                  requirement.id,
                )}
                submitLabel="Record human pass"
                pendingLabel="Saving…"
                submitClassName="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                className="mt-3 flex flex-col gap-2"
              >
                <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                  Evidence note (required)
                  <textarea
                    name="note"
                    required
                    rows={2}
                    placeholder="What was reviewed and why this control passes"
                    className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              </StatefulActionForm>
            </details>
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs font-medium text-zinc-500">
              Mark requirement exception (N/A / accepted risk /
              compensating / temporary)
            </summary>
            <StatefulActionForm
              action={markRequirementExceptionAction.bind(
                null,
                requirement.id,
              )}
              submitLabel="Record exception"
              pendingLabel="Saving…"
              submitClassName="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
            </StatefulActionForm>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
