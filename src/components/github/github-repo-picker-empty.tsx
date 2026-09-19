"use client";

import { Button } from "@/components/ui/button";

/** Empty install state when no repos are available from GitHub App installations. */
export function GitHubRepoPickerEmpty({
  appInstallUrl,
}: {
  appInstallUrl?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        No repositories from your GitHub App installations. Install the App on
        the repos you want to assess, then refresh this page.
      </p>
      <p className="text-xs text-muted-foreground">
        Not seeing your repo? It may live on an installation this account
        can&apos;t see, or under a renamed/transferred name — search above only
        covers the first page of installations.
      </p>
      {appInstallUrl ? (
        <Button asChild size="sm" className="w-fit">
          <a href={appInstallUrl} target="_blank" rel="noreferrer">
            Install the GitHub App
          </a>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Set <code className="font-mono">GITHUB_APP_SLUG</code> to show an
          install link (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </div>
  );
}
