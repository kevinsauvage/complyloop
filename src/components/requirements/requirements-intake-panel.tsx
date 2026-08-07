import { rgaaPresets } from "@/adapters/rgaa/presets";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card } from "@/components/ui";
import type { Control, Framework } from "@/core/types";
import {
  applyFrameworkPresetAction,
  importChecklistAction,
  importCustomControlAction,
  updateRequirementScopeAction,
} from "@/server/actions/requirements-intake";

export function RequirementsIntakePanel({
  canAssess,
  controls,
  frameworks,
  inScope,
}: {
  canAssess: boolean;
  controls: Control[];
  frameworks: Framework[];
  inScope: Set<string>;
}) {
  return (
    <div className="mb-6 flex flex-col gap-6">
      {!canAssess ? (
        <PermissionNotice>
          View-only role — you can review requirement status but not change
          scope or import controls.
        </PermissionNotice>
      ) : null}
      {canAssess ? (
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
                <StatefulActionForm
                  action={applyFrameworkPresetAction}
                  submitLabel="Apply"
                  pendingLabel="Applying…"
                  submitClassName="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <input type="hidden" name="presetId" value={preset.id} />
                </StatefulActionForm>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canAssess ? (
        <>
          <Card title="Import checklist">
            <p className="mb-3 text-sm text-zinc-600">
              Paste audit or customer lines as{" "}
              <code className="font-mono text-xs">
                CODE | Title | Description
              </code>
              . Each becomes a manual control (unable to verify until a human
              marks it passed or records an exception).
            </p>
            <StatefulActionForm
              action={importChecklistAction}
              submitLabel="Import checklist"
              pendingLabel="Importing…"
              submitClassName="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              className="flex flex-col gap-3"
            >
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
            </StatefulActionForm>
          </Card>

          <Card title="In-scope controls">
            <p className="mb-3 text-sm text-zinc-600">
              Select which controls apply to this project. Assessment only
              evaluates the selected set.
            </p>
            <StatefulActionForm
              action={updateRequirementScopeAction}
              submitLabel="Save scope"
              pendingLabel="Saving…"
              submitClassName="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              className="flex flex-col gap-3"
            >
              <ul className="flex flex-col gap-2">
                {controls.map((control) => {
                  const framework = frameworks.find(
                    (candidate) => candidate.id === control.frameworkId,
                  );
                  return (
                    <li
                      key={control.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        id={`scope-${control.id}`}
                        type="checkbox"
                        name="controlId"
                        value={control.id}
                        defaultChecked={inScope.has(control.id)}
                        className="mt-1"
                      />
                      <label
                        htmlFor={`scope-${control.id}`}
                        className="text-zinc-800"
                      >
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
            </StatefulActionForm>
          </Card>

          <Card title="Import a custom control">
            <p className="mb-3 text-sm text-zinc-600">
              Add a checklist item from an audit or customer requirement.
              Without an automated check it stays <em>unable to verify</em>{" "}
              until a human records a decision.
            </p>
            <StatefulActionForm
              action={importCustomControlAction}
              submitLabel="Import control"
              pendingLabel="Importing…"
              submitClassName="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
            </StatefulActionForm>
          </Card>
        </>
      ) : null}
    </div>
  );
}
