"use client";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_TONE_BADGE } from "@/core/display";
import type { GitHubRepoSummary } from "@/server/github/github-types";

export type RepoOwnerGroup = {
  owner: string;
  repos: GitHubRepoSummary[];
};

function repoOwner(fullName: string): string {
  return fullName.split("/")[0] ?? fullName;
}

export function groupReposByOwner(
  repos: GitHubRepoSummary[],
): RepoOwnerGroup[] {
  const byOwner = new Map<string, GitHubRepoSummary[]>();
  for (const repo of repos) {
    const owner = repoOwner(repo.fullName);
    const list = byOwner.get(owner) ?? [];
    list.push(repo);
    byOwner.set(owner, list);
  }
  return [...byOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, ownerRepos]) => ({ owner, repos: ownerRepos }));
}

export function GitHubRepoList({
  grouped,
  connectedByFullName,
  connectAction,
  disconnectAction,
  connectPending,
  disconnectPending,
}: {
  grouped: RepoOwnerGroup[];
  connectedByFullName: Record<string, string>;
  connectAction: (formData: FormData) => void;
  disconnectAction: (formData: FormData) => void;
  connectPending: boolean;
  disconnectPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {grouped.map(({ owner, repos: ownerRepos }) => (
        <section key={owner} aria-label={`Repositories for ${owner}`}>
          <h3 className="mb-2 font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {owner}
          </h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 ring-1 ring-border/40">
            {ownerRepos.map((repo) => {
              const projectId =
                connectedByFullName[repo.fullName.trim().toLowerCase()];
              const connected = Boolean(projectId);
              const formId = `disconnect-${repo.fullName}`;
              return (
                <li
                  key={`${repo.installationId ?? 0}:${repo.fullName}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-medium break-all">
                      {repo.fullName}
                      {connected ? (
                        <Badge
                          className={`${STATUS_TONE_BADGE.passed} font-sans`}
                        >
                          Connected
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {repo.private ? "Private" : "Public"}
                      {repo.description ? ` · ${repo.description}` : ""}
                    </p>
                  </div>
                  {connected && projectId ? (
                    <form
                      id={formId}
                      action={disconnectAction}
                      className="w-full sm:w-auto"
                    >
                      <input type="hidden" name="projectId" value={projectId} />
                      <ConfirmSubmitButton
                        label={
                          disconnectPending ? "Disconnecting…" : "Disconnect"
                        }
                        pendingLabel="Disconnecting…"
                        confirmMessage={`Disconnect ${repo.fullName}? Future assessments stop. Past evidence is retained for audit; findings and remediations for this project are removed.`}
                        confirmTitle="Disconnect repository"
                        variant="outline"
                        size="sm"
                        formId={formId}
                        className="w-full sm:w-auto"
                      />
                    </form>
                  ) : (
                    <form action={connectAction} className="w-full sm:w-auto">
                      <input
                        type="hidden"
                        name="fullName"
                        value={repo.fullName}
                      />
                      {repo.installationId != null ? (
                        <input
                          type="hidden"
                          name="installationId"
                          value={String(repo.installationId)}
                        />
                      ) : null}
                      <Button
                        type="submit"
                        size="sm"
                        disabled={connectPending}
                        className="w-full sm:w-auto"
                      >
                        {connectPending ? "Connecting…" : "Connect"}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
