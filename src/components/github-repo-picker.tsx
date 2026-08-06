"use client";

import { useActionState, useMemo, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
  type ConnectGitHubFormState,
  type DisconnectGitHubFormState,
} from "@/server/actions";
import type { GitHubRepoSummary } from "@/server/github";

const connectInitial: ConnectGitHubFormState = { error: null };
const disconnectInitial: DisconnectGitHubFormState = { error: null };

export function GitHubRepoPicker({
  repos,
  connectedByFullName,
  usesGitHubApp = false,
}: {
  repos: GitHubRepoSummary[];
  /** GitHub fullName → connected project id for the signed-in user. */
  connectedByFullName: Record<string, string>;
  /** When true, empty state explains App installation instead of OAuth `repo`. */
  usesGitHubApp?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [connectState, connectAction, connectPending] = useActionState(
    connectGitHubRepoAction,
    connectInitial,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectGitHubRepoAction,
    disconnectInitial,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(q) ||
        (repo.description?.toLowerCase().includes(q) ?? false),
    );
  }, [repos, query]);

  const error = connectState.error ?? disconnectState.error;
  const pending = connectPending || disconnectPending;

  if (repos.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
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
      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Filter repositories
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="org/repo or description"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm font-normal"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {filtered.slice(0, 20).map((repo) => {
          const projectId = connectedByFullName[repo.fullName];
          const connected = Boolean(projectId);
          return (
            <li
              key={`${repo.installationId ?? "oauth"}:${repo.fullName}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 truncate font-mono text-sm font-medium text-zinc-900">
                  {repo.fullName}
                  {connected ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-xs font-medium text-emerald-800">
                      Connected
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {repo.private ? "Private" : "Public"}
                  {repo.description ? ` · ${repo.description}` : ""}
                </p>
              </div>
              {connected && projectId ? (
                <form action={disconnectAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <ConfirmSubmitButton
                    label={disconnectPending ? "Disconnecting…" : "Disconnect"}
                    pendingLabel="Disconnecting…"
                    confirmMessage={`Disconnect ${repo.fullName}? The local workspace clone will be removed.`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {connectPending ? "Connecting…" : "Connect"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length > 20 ? (
        <p className="text-xs text-zinc-400">
          Showing 20 of {filtered.length} matches — refine the filter to narrow
          results.
        </p>
      ) : null}
    </div>
  );
}
