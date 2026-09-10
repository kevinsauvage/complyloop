import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FRAMEWORK_PRESETS } from "@complyloop/analysis-core/adapters/registry";
import { PresetNavigator } from "./preset-navigator";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

export function RequirementsPresetPanel({
  defaultPresetId,
  selectedPresetId,
  statusFilter,
}: {
  defaultPresetId: string;
  selectedPresetId: string;
  statusFilter: RequirementStatus | undefined;
}) {
  const presets = FRAMEWORK_PRESETS;
  const viewingDefault = selectedPresetId === defaultPresetId;

  return (
    <Card size="sm" className="shadow-none lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle level={3}>Framework scope</CardTitle>
        <CardDescription>
          A framework scope is a framework + level (e.g. RGAA 4.1 A+AA). The
          URL updates so views can be shared.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PresetNavigator
          presets={presets}
          defaultPresetId={defaultPresetId}
          selectedPresetId={selectedPresetId}
          statusFilter={statusFilter}
        />
        <p className="text-xs text-muted-foreground">
          Assessments always use the project default.{" "}
          <Link
            href="/settings"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Change it in Settings
          </Link>
          .
        </p>
        {!viewingDefault ? (
          <p className="text-xs text-muted-foreground">
            Viewing a non-default preset. Assessments still use the project
            default.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
