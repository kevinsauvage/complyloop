import { allFrameworkPresets } from "@/adapters/registry";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Control, Framework } from "@/core/project-types";
import {
  applyFrameworkPresetAction,
  importChecklistAction,
  importCustomControlAction,
  updateRequirementScopeAction,
} from "@/server/actions/requirements-intake";

const frameworkPresets = allFrameworkPresets();

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
    <div className="flex flex-col gap-4">
      {!canAssess ? (
        <PermissionNotice>
          View-only role — you can review requirement status but not change
          scope or import controls.
        </PermissionNotice>
      ) : null}

      {canAssess ? (
        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Intake</CardTitle>
            <CardDescription>
              Configure scope, apply presets, and import controls for this
              project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="presets">
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="presets">Presets</TabsTrigger>
                <TabsTrigger value="scope">Scope</TabsTrigger>
                <TabsTrigger value="import">Import</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>

              <TabsContent value="presets">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Apply a curated RGAA/WCAG subset in one click. You can
                    still fine-tune the scope below.
                  </p>
                  <ul className="flex flex-col gap-3">
                    {frameworkPresets.map((preset) => (
                      <li
                        key={preset.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {preset.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {preset.description} · {preset.controlIds.length}{" "}
                            controls
                          </p>
                        </div>
                        <StatefulActionForm
                          action={applyFrameworkPresetAction}
                          submitLabel="Apply"
                          pendingLabel="Applying…"
                          variant="secondary"
                          size="sm"
                        >
                          <input
                            type="hidden"
                            name="presetId"
                            value={preset.id}
                          />
                        </StatefulActionForm>
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="scope">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Select which controls apply to this project. Assessment only
                    evaluates the selected set.
                  </p>
                  <StatefulActionForm
                    action={updateRequirementScopeAction}
                    submitLabel="Save scope"
                    pendingLabel="Saving…"
                    variant="default"
                    size="sm"
                    className="flex flex-col gap-3"
                  >
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 p-1">
                      <ul className="flex flex-col gap-0.5">
                        {controls.map((control) => {
                          const framework = frameworks.find(
                            (candidate) => candidate.id === control.frameworkId,
                          );
                          return (
                            <li
                              key={control.id}
                              className="flex items-start gap-2.5 rounded px-2 py-1.5 hover:bg-muted/40"
                            >
                              {/* Native checkbox — Radix Checkbox does not participate in form posts. */}
                              <input
                                id={`scope-${control.id}`}
                                type="checkbox"
                                name="controlId"
                                value={control.id}
                                defaultChecked={inScope.has(control.id)}
                                className="mt-1 size-4 shrink-0 rounded border border-input accent-signal"
                              />
                              <Label
                                htmlFor={`scope-${control.id}`}
                                className="cursor-pointer font-normal"
                              >
                                <span className="font-medium">
                                  {control.title}
                                </span>
                                <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                                  {control.code}
                                  {control.checkId
                                    ? ` · check ${control.checkId}`
                                    : " · manual (no automated check)"}
                                  {framework ? ` · ${framework.name}` : ""}
                                </span>
                              </Label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </StatefulActionForm>
                </div>
              </TabsContent>

              <TabsContent value="import">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Paste audit or customer lines as{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      CODE | Title | Description [| secondary [| checkId]]
                    </code>
                    . Optional 5th field links to a shipped check (e.g.{" "}
                    <code className="font-mono text-xs">img-alt</code>). Without
                    a checkId each becomes a manual control.
                  </p>
                  <StatefulActionForm
                    action={importChecklistAction}
                    submitLabel="Import checklist"
                    pendingLabel="Importing…"
                    variant="secondary"
                    size="sm"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="intake-checklist">Checklist</Label>
                      <Textarea
                        id="intake-checklist"
                        name="checklist"
                        required
                        rows={5}
                        placeholder={
                          "CUST-1 | Privacy link present | Marketing pages link to the privacy notice\nCUST-2 | Cookie banner | Consent UI is keyboard accessible"
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                  </StatefulActionForm>
                </div>
              </TabsContent>

              <TabsContent value="custom">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Add a checklist item from an audit or customer requirement.
                    Leave check id empty for a manual control (
                    <em>unable to verify</em> until a human records a decision),
                    or link an existing analysis check for automated status.
                  </p>
                  <StatefulActionForm
                    action={importCustomControlAction}
                    submitLabel="Import control"
                    pendingLabel="Importing…"
                    variant="secondary"
                    size="sm"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="custom-code">Code</Label>
                      <Input
                        id="custom-code"
                        name="code"
                        required
                        placeholder="e.g. CUST-PRIV-1"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="custom-title">Title</Label>
                      <Input id="custom-title" name="title" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="custom-description">Description</Label>
                      <Textarea
                        id="custom-description"
                        name="description"
                        required
                        rows={2}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="custom-secondary-code">
                        Secondary reference{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="custom-secondary-code"
                        name="secondaryCode"
                        placeholder="e.g. customer checklist §3"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="custom-check-id">
                        Analysis check id{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="custom-check-id"
                        name="checkId"
                        placeholder="e.g. img-alt"
                        className="font-mono text-xs"
                      />
                    </div>
                  </StatefulActionForm>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
