import Link from "next/link";

import { presetSummaries } from "@complyloop/analysis-core/adapters/registry";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { PresetNavigator } from "./preset-navigator";

export function RequirementsPresetPanel({
  defaultPresetId,
  selectedPresetId,
  statusFilter,
  q,
}: {
  defaultPresetId: string;
  selectedPresetId: string;
  statusFilter: RequirementStatus | undefined;
  q?: string;
}) {
  const presets = presetSummaries();
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
          q={q}
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
