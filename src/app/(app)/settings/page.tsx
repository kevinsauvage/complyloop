import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { MetaTile, NoProjectNotice, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { DefaultPresetForm } from "@/components/settings/default-preset-form";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  presetById,
  presetSummaries,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/adapters/registry";
import { latestAssessmentFor } from "@/core/lifecycle";
import { loadActiveProjectPage } from "@/server/active-project-page";
import { getProjectRuntime } from "@/server/project-runtime";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Project configuration: connected repository, presets, and runtime audits.",
};

export default async function SettingsPage() {
  const { project, caps } = await loadActiveProjectPage();

  if (!project) {
    return (
      <NoProjectNotice
        title="Settings"
        description="Configure the active project once a repository is connected."
        hint="Connect a GitHub repository from the dashboard to manage settings."
      />
    );
  }

  const runtime = await getProjectRuntime(project.id, {
    findingStatuses: [],
  });
  const latestAssessment = latestAssessmentFor(runtime.assessments, project.id);
  const runtimeError = latestAssessment?.engines?.runtimeError ?? null;
  const runtimeStatus = latestAssessment?.engines?.runtime
    ? `Last assessment audited ${latestAssessment.engines.runtimePagesScanned ?? 0} page(s).`
    : runtimeError
      ? "Last runtime attempt failed — details below."
      : "No runtime audit has run yet for this project.";

  const githubFullName = project.github?.fullName;
  const repoUrl =
    project.sourceRef ??
    (githubFullName ? `https://github.com/${githubFullName}` : undefined);
  const defaultPresetId = projectDefaultPresetId(project);
  const defaultPreset = presetById(defaultPresetId);
  const presets = presetSummaries();

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Project configuration for "${project.name}".`}
      />

      <PageContent>
        <PageSection title="Project" description="Connected repository and assessment defaults.">
          <Card className="shadow-none">
            <CardContent className="space-y-3 pt-6 text-sm">
              <MetaTile label="Name">
                <p className="font-medium">{project.name}</p>
              </MetaTile>
              {githubFullName ? (
                <MetaTile label="GitHub repository">
                  {repoUrl ? (
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-sm text-foreground underline-offset-4 hover:underline"
                    >
                      {githubFullName}
                    </a>
                  ) : (
                    <p className="font-mono">{githubFullName}</p>
                  )}
                </MetaTile>
              ) : null}
              {project.runtimeBaseUrl ? (
                <MetaTile label="Preview URL">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 font-mono text-sm break-all">
                      {project.runtimeBaseUrl}
                    </p>
                    <CopyButton label="Copy preview URL" text={project.runtimeBaseUrl} />
                  </div>
                </MetaTile>
              ) : (
                <MetaTile label="Preview URL">
                  <p className="text-muted-foreground">
                    Not set — code checks only.{" "}
                    <Link
                      href="#preview-url"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Set preview URL
                    </Link>
                  </p>
                </MetaTile>
              )}
              {defaultPreset ? (
                <MetaTile label="Default framework scope">
                  <p className="font-medium">{defaultPreset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {defaultPreset.controlIds.length} controls
                  </p>
                </MetaTile>
              ) : null}
              <p className="text-sm">
                <Link
                  href="/dashboard"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Manage repositories
                </Link>
              </p>
            </CardContent>
          </Card>
        </PageSection>

        <PageSection
          title="Framework scope"
          description={
            <>
              <strong className="font-semibold text-foreground">
                Applies to future assessments only — does not re-score past
                runs.
              </strong>{" "}
              Default framework and level for assessments. Browse other
              frameworks on Requirements without changing this default.
            </>
          }
        >
          <Card className="shadow-none">
            <CardContent className="pt-6">
              {caps.canConnect ? (
                <DefaultPresetForm
                  key={defaultPresetId}
                  presets={presets}
                  defaultPresetId={defaultPresetId}
                />
              ) : (
                <PermissionNotice>
                  Changing the default preset requires an admin or owner role in
                  the active organization.
                </PermissionNotice>
              )}
            </CardContent>
          </Card>
        </PageSection>

        <PageSection
          id="preview-url"
          title="Preview URL"
          description={
            <>
              <strong className="font-semibold text-foreground">
                Applies to future assessments only — does not re-score past
                runs.
              </strong>{" "}
              Staging or preview URL for live-page checks. {runtimeStatus}
            </>
          }
        >
          <Card className="shadow-none">
            <CardContent className="space-y-3 pt-6 text-sm">
              {runtimeError ? (
                <Alert variant="destructive">
                  <AlertTitle>Preview audit failed</AlertTitle>
                  <AlertDescription>
                    The page didn&apos;t load for automated checks — live-page
                    checks stay unable to verify until the preview loads.
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">
                        Show technical details
                      </summary>
                      <p className="mt-1 font-mono text-xs break-all">
                        {runtimeError}
                      </p>
                    </details>
                  </AlertDescription>
                </Alert>
              ) : null}
              {caps.canConnect ? (
                <RuntimeAuditForm
                  runtimeBaseUrl={project.runtimeBaseUrl}
                  runtimeRoutes={project.runtimeRoutes}
                />
              ) : (
                <PermissionNotice>
                  Configuring the preview URL requires an admin or owner role in
                  the active organization.
                </PermissionNotice>
              )}
            </CardContent>
          </Card>
        </PageSection>
      </PageContent>
    </>
  );
}
