import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { MetaTile, NoProjectNotice, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { DefaultPresetForm } from "@/components/settings/default-preset-form";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  allFrameworkPresets,
  presetById,
  projectDefaultPresetId,
} from "@complyloop/adapters/registry";
import { latestAssessmentFor } from "@/core/assessment";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";
import { getProjectRuntime } from "@/server/project-runtime";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description: "Project configuration: connected repository, presets, and runtime audits.",
};

export default async function SettingsPage() {
  const { project, access, activeOrgId } = await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);

  if (!project) {
    return (
      <NoProjectNotice
        title="Settings"
        description="Configure the active project once a repository is connected."
        hint="Connect a GitHub repository from the dashboard to manage settings."
      />
    );
  }

  const runtime = await getProjectRuntime(project.id);
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
  const presets = allFrameworkPresets();

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
                <MetaTile label="Preview URL (runtime audit)">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 font-mono text-sm break-all">
                      {project.runtimeBaseUrl}
                    </p>
                    <CopyButton label="Copy preview URL" text={project.runtimeBaseUrl} />
                  </div>
                </MetaTile>
              ) : (
                <p className="surface-panel rounded-xl px-3 py-2.5 text-muted-foreground">
                  Preview URL (runtime audit) is off — assessments use source
                  (AST) checks only.
                </p>
              )}
              {defaultPreset ? (
                <MetaTile label="Default assessment preset">
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
          title="Assessment preset"
          description="Default framework and level for assessments. Browse other presets on Requirements without changing this default."
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
          title="Preview URL (runtime audit)"
          description={`Staging or preview URL for rendered-page checks. ${runtimeStatus}`}
        >
          <Card className="shadow-none">
            <CardContent className="space-y-3 pt-6">
              {runtimeError ? (
                <details className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Runtime error details
                  </summary>
                  <p className="mt-2 font-mono text-xs break-all text-foreground">
                    {runtimeError}
                  </p>
                </details>
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
