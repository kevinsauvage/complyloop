import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { allFrameworkPresets } from "@complyloop/adapters/registry";
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
  const presets = allFrameworkPresets();
  const viewingDefault = selectedPresetId === defaultPresetId;

  return (
    <Card size="sm" className="sticky top-6 shadow-none lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle>Preset</CardTitle>
        <CardDescription>
          Browse requirement scope by preset. The URL updates so views can be
          shared.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PresetNavigator
          presets={presets}
          defaultPresetId={defaultPresetId}
          selectedPresetId={selectedPresetId}
          statusFilter={statusFilter}
        />
        {!viewingDefault ? (
          <p className="text-xs text-muted-foreground">
            Viewing a non-default preset. Assessments still use the project
            default — change it in{" "}
            <Link
              href="/settings"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Settings
            </Link>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
