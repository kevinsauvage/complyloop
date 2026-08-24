import { PermissionNotice } from "@/components/permission-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Control, Framework } from "@/core/project-types";
import { IntakeChecklistForm, IntakeCustomControlForm } from "./intake-import-forms";
import { IntakePresetList } from "./intake-preset-list";
import { IntakeScopeForm } from "./intake-scope-form";

export function RequirementsIntakePanel({
  canAssess,
  controls,
  frameworks,
  inScope,
  hasExplicitScope,
}: {
  canAssess: boolean;
  controls: Control[];
  frameworks: Framework[];
  inScope: Set<string>;
  hasExplicitScope: boolean;
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
        <Card size="sm" className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Intake</CardTitle>
            <CardDescription>
              Choose what assessment evaluates, or import a custom control.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="presets">
              <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto">
                <TabsTrigger value="presets" className="w-full">
                  Presets
                </TabsTrigger>
                <TabsTrigger value="scope" className="w-full">
                  Scope
                </TabsTrigger>
                <TabsTrigger value="import" className="w-full">
                  Import
                </TabsTrigger>
                <TabsTrigger value="custom" className="w-full">
                  Custom
                </TabsTrigger>
              </TabsList>

              <TabsContent value="presets">
                <IntakePresetList
                  controlCount={controls.length}
                  inScope={inScope}
                  hasExplicitScope={hasExplicitScope}
                />
              </TabsContent>

              <TabsContent value="scope">
                <IntakeScopeForm
                  controls={controls}
                  frameworks={frameworks}
                  inScope={inScope}
                  hasExplicitScope={hasExplicitScope}
                />
              </TabsContent>

              <TabsContent value="import">
                <IntakeChecklistForm />
              </TabsContent>

              <TabsContent value="custom">
                <IntakeCustomControlForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
