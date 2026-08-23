import { EmptyState, PageHeader } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        <EmptyState title="No project connected">
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
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="font-medium">{project.name}</p>
            </div>
            {githubFullName ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  GitHub repository
                </p>
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
              </div>
            ) : null}
            {project.runtimeBaseUrl ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Runtime audit URL
                </p>
                <p className="font-mono text-sm break-all">
                  {project.runtimeBaseUrl}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-muted-foreground">
                Runtime audit is off — assessments use source (AST) checks only.
              </p>
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
