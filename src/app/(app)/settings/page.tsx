import type { Metadata } from "next";
import Link from "next/link";

import { RuntimeAuditForm } from "@/components/forms/runtime-audit-form";
import { CopyButton } from "@/components/primitives/copy-button";
import {
  MetaTile,
  NoProjectNotice,
  PageContent,
  PageHeader,
  PageSection,
} from "@/components/primitives/page-primitives";
import { PermissionNotice } from "@/components/primitives/permission-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { loadSettingsView } from "@/server/workspace/settings-view";

import { DefaultPresetForm } from "./_components/default-preset-form";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Project configuration: connected repository, presets, and runtime audits.",
};

export default async function SettingsPage() {
  const view = await loadSettingsView();

  if (!view.project) {
    return (
      <NoProjectNotice
        title="Settings"
        description="Configure the active project once a repository is connected."
        hint="Connect a GitHub repository from the dashboard to manage settings."
      />
    );
  }

  const {
    project,
    caps,
    runtimeError,
    runtimeStatus,
    githubFullName,
    repoUrl,
    defaultPresetId,
    defaultPreset,
    presets,
    runtimeOnlyCheckCount,
  } = view;

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Project configuration for "${project.name}".`}
      />

      <PageContent>
        <PageSection
          title="Project"
          description="Connected repository and assessment defaults."
        >
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
                    <CopyButton
                      label="Copy preview URL"
                      text={project.runtimeBaseUrl}
                    />
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
              {/* Empty-state hint — code-only projects leave every
                  runtime-only criterion unable_to_verify until a preview URL
                  is set. */}
              {!project.runtimeBaseUrl && !runtimeError ? (
                <p className="text-sm text-muted-foreground">
                  {runtimeOnlyCheckCount} criteria need a runtime audit.{" "}
                  <Link
                    href="#preview-url"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Set a preview URL
                  </Link>{" "}
                  to verify them.
                </p>
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
