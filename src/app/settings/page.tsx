import { EmptyState, MetaTile, PageActionLink, PageHeader } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { DefaultPresetForm } from "@/components/settings/default-preset-form";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { allFrameworkPresets, presetById, presetCatalog } from "@/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { db, project, access, activeOrgId } = await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);

  if (!project) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Configure the active project once a repository is connected."
        />
        <EmptyState
          title="No project connected"
          action={<PageActionLink href="/">Go to dashboard</PageActionLink>}
        >
          <p>Connect a GitHub repository from the dashboard to manage settings.</p>
        </EmptyState>
      </>
    );
  }

  const latestAssessment = db.assessments
    .filter((assessment) => assessment.projectId === project.id)
    .at(-1);
  const runtimeStatus = latestAssessment?.engines?.runtime
    ? `Last assessment audited ${latestAssessment.engines.runtimePagesScanned ?? 0} page(s).`
    : latestAssessment?.engines?.runtimeError
      ? `Last runtime attempt failed: ${latestAssessment.engines.runtimeError}`
      : "No runtime audit has run yet for this project.";

  const githubFullName = project.github?.fullName;
  const repoUrl =
    project.sourceRef ??
    (githubFullName ? `https://github.com/${githubFullName}` : undefined);
  const defaultPresetId = projectDefaultPresetId(project, presetCatalog);
  const defaultPreset = presetById(defaultPresetId);
  const presets = allFrameworkPresets();

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Project configuration for "${project.name}".`}
      />

      <div className="flex flex-col gap-6">
        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>
              Connected repository used for assessments and remediations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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
              <MetaTile label="Runtime audit URL">
                <p className="font-mono text-sm break-all">
                  {project.runtimeBaseUrl}
                </p>
              </MetaTile>
            ) : (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-muted-foreground">
                Runtime audit is off — assessments use source (AST) checks only.
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
          </CardContent>
        </Card>

        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Assessment preset</CardTitle>
            <CardDescription>
              Default framework and level for assessments. Browse other presets
              on Requirements without changing this default.
            </CardDescription>
          </CardHeader>
          <CardContent>
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

        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Runtime audit</CardTitle>
            <CardDescription>
              Staging or preview URL for rendered-page checks (labels, names,
              headings). Leave empty to assess source only. {runtimeStatus}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
      </div>
    </>
  );
}
