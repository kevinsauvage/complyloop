"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
  type ConnectGitHubFormState,
  type DisconnectGitHubFormState,
} from "@/server/actions/connect";
import type { GitHubRepoSummary } from "@/server/github";

const connectInitial: ConnectGitHubFormState = { error: null, message: null };
const disconnectInitial: DisconnectGitHubFormState = {
  error: null,
  message: null,
};

export function GitHubRepoPicker({
  repos,
  connectedByFullName,
  usesGitHubApp = false,
}: {
  repos: GitHubRepoSummary[];
  /** GitHub fullName (lowercase) → connected project id for this workspace. */
  connectedByFullName: Record<string, string>;
  /** When true, empty state explains App installation instead of OAuth `repo`. */
  usesGitHubApp?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filterId = useId();
  const [connectState, connectAction, connectPending] = useActionState(
    connectGitHubRepoAction,
    connectInitial,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectGitHubRepoAction,
    disconnectInitial,
  );
  useActionToast(connectState);
  useActionToast(disconnectState);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(q) ||
        (repo.description?.toLowerCase().includes(q) ?? false),
    );
  }, [repos, query]);

  const pending = connectPending || disconnectPending;

  if (repos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {usesGitHubApp ? (
          <>
            No repositories from your GitHub App installations. Install the App
            on the repos you want to assess, then refresh.
          </>
        ) : (
          <>
            No repositories returned from GitHub. Check that your OAuth app has
            the <code className="font-mono text-xs">repo</code> scope (laptop
            demo), or configure a GitHub App for production.
          </>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        <Label htmlFor={filterId}>Filter repositories</Label>
        <Input
          id={filterId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="org/repo or description"
          className="font-mono"
        />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {filtered.slice(0, 20).map((repo) => {
          const projectId =
            connectedByFullName[repo.fullName.trim().toLowerCase()];
          const connected = Boolean(projectId);
          const formId = `disconnect-${repo.fullName}`;
          return (
            <li
              key={`${repo.installationId ?? "oauth"}:${repo.fullName}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 truncate font-mono text-sm font-medium">
                  {repo.fullName}
                  {connected ? (
                    <Badge className="border-transparent bg-emerald-500/15 font-sans text-emerald-400">
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
                <form id={formId} action={disconnectAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <ConfirmSubmitButton
                    label={disconnectPending ? "Disconnecting…" : "Disconnect"}
                    pendingLabel="Disconnecting…"
                    confirmMessage={`Disconnect ${repo.fullName}? Project findings and remediations will be removed.`}
                    confirmTitle="Disconnect repository"
                    variant="outline"
                    size="sm"
                    formId={formId}
                  />
                </form>
              ) : (
                <form action={connectAction}>
                  <input type="hidden" name="fullName" value={repo.fullName} />
                  {repo.installationId != null ? (
                    <input
                      type="hidden"
                      name="installationId"
                      value={String(repo.installationId)}
                    />
                  ) : null}
                  <Button type="submit" size="sm" disabled={pending}>
                    {connectPending ? "Connecting…" : "Connect"}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length > 20 ? (
        <p className="text-xs text-muted-foreground">
          Showing 20 of {filtered.length} matches — refine the filter to narrow
          results.
        </p>
      ) : null}
    </div>
  );
}
