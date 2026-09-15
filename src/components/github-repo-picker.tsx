"use client";

import { useId, useMemo } from "react";

import {
  GitHubRepoList,
  groupReposByOwner,
} from "@/components/github-repo-list";
import { GitHubRepoPickerEmpty } from "@/components/github-repo-picker-empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGitHubRepoConnect } from "@/components/use-github-repo-connect";
import { useGitHubRepoSearch } from "@/components/use-github-repo-search";
import type { GitHubRepoSummary } from "@/server/github/github-types";

export function GitHubRepoPicker({
  initialRepos = [],
  connectedByFullName,
  appInstallUrl,
  fetchOnMount = false,
}: {
  /** Optional first page from the server — search and pagination use the API. */
  initialRepos?: GitHubRepoSummary[];
  /** GitHub fullName (lowercase) → connected project id for this workspace. */
  connectedByFullName: Record<string, string>;
  /** `https://github.com/apps/<slug>/installations/new` when `GITHUB_APP_SLUG` is set. */
  appInstallUrl?: string;
  /** Fetch page 1 on mount — used when the server skipped the eager fetch
   * because the picker mounts inside a lazily-opened dialog. */
  fetchOnMount?: boolean;
}) {
  const filterId = useId();
  const search = useGitHubRepoSearch({ initialRepos, fetchOnMount });
  const connect = useGitHubRepoConnect();
  const grouped = useMemo(
    () => groupReposByOwner(search.repos),
    [search.repos],
  );

  if (search.showEmpty) {
    return <GitHubRepoPickerEmpty appInstallUrl={appInstallUrl} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        <Label htmlFor={filterId}>Search repositories</Label>
        <Input
          id={filterId}
          type="search"
          value={search.query}
          onChange={(event) => search.onQueryChange(event.target.value)}
          placeholder="org/repo or description"
        />
        <p className="text-xs text-muted-foreground">
          Search your GitHub repositories by name or description.
        </p>
      </div>

      {search.fetchError ? (
        <p className="text-sm text-destructive" role="alert">
          {search.fetchError}
        </p>
      ) : null}

      {!connect.connectState.ok &&
      connect.connectState.message &&
      !connect.connectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {connect.connectState.message}
        </p>
      ) : null}
      {!connect.disconnectState.ok &&
      connect.disconnectState.message &&
      !connect.disconnectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {connect.disconnectState.message}
        </p>
      ) : null}

      <p
        aria-live="polite"
        aria-atomic="true"
        className="text-xs text-muted-foreground"
      >
        {search.loading && search.repos.length === 0
          ? "Loading repositories…"
          : `${search.repos.length} ${search.repos.length === 1 ? "repository" : "repositories"} shown`}
      </p>

      {search.showNoMatch ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-5">
          <p className="text-sm text-muted-foreground">
            No repositories match “{search.trimmedQuery}”.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => search.onQueryChange("")}
          >
            Clear search
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4" aria-busy={search.loading}>
        {search.loading && search.repos.length === 0 ? (
          <ul aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <li
                key={index}
                className="h-14 animate-pulse rounded-lg border border-border/60 bg-muted/40"
              />
            ))}
          </ul>
        ) : null}

        <GitHubRepoList
          grouped={grouped}
          connectedByFullName={connectedByFullName}
          connectAction={connect.connectAction}
          disconnectAction={connect.disconnectAction}
          connectPending={connect.connectPending}
          disconnectPending={connect.disconnectPending}
        />
      </div>

      {search.hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={search.loading}
          onClick={() =>
            void search.loadRepos(search.page + 1, search.query.trim(), true)
          }
        >
          {search.loading
            ? "Loading…"
            : `Load more repositories (${search.repos.length} shown)`}
        </Button>
      ) : null}
    </div>
  );
}
