"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { GitHubRepoList, groupReposByOwner } from "@/components/github-repo-list";
import {
  githubRepoSearchError,
  type GitHubRepoSearchResponse,
  parseGitHubRepoSearchResponse,
} from "@/components/github-repo-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState,initialActionState } from "@/core/action-state";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
} from "@/server/actions/connect";
import type { GitHubRepoSummary } from "@/server/github/github-types";

const connectInitial: ActionState = initialActionState;
const disconnectInitial: ActionState = initialActionState;

async function fetchRepos(options: {
  q: string;
  page: number;
  signal?: AbortSignal;
}): Promise<GitHubRepoSearchResponse> {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.page > 1) params.set("page", String(options.page));

  const response = await fetch(
    `/api/github/repos${params.size > 0 ? `?${params.toString()}` : ""}`,
    { signal: options.signal },
  );
  const json: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      githubRepoSearchError(json) ?? "Could not load repositories.",
    );
  }
  return parseGitHubRepoSearchResponse(json);
}

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
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GitHubRepoSummary[]>(initialRepos);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialRepos.length >= 30);
  const [loading, setLoading] = useState(fetchOnMount);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const filterId = useId();
  const [connectState, connectAction, connectPending] = useActionState(
    connectGitHubRepoAction,
    connectInitial,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectGitHubRepoAction,
    disconnectInitial,
  );
  useActionToast(connectState, connectPending);
  useActionToast(disconnectState, disconnectPending);

  const loadRepos = useCallback(
    async (
      nextPage: number,
      q: string,
      append: boolean,
      externalSignal?: AbortSignal,
    ) => {
      let ownedController: AbortController | null = null;
      let effectiveSignal = externalSignal;
      if (!effectiveSignal) {
        abortRef.current?.abort();
        ownedController = new AbortController();
        abortRef.current = ownedController;
        effectiveSignal = ownedController.signal;
      }
      const requestId = (requestIdRef.current += 1);
      const isCurrent = () => requestIdRef.current === requestId;
      setLoading(true);
      setFetchError(null);
      try {
        const result = await fetchRepos({
          q,
          page: nextPage,
          signal: effectiveSignal,
        });
        if (!isCurrent()) return;
        setRepos((prev) =>
          append
            ? [
                ...prev,
                ...result.repos.filter(
                  (repo) =>
                    !prev.some(
                      (existing) => existing.fullName === repo.fullName,
                    ),
                ),
              ]
            : result.repos,
        );
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setFetchError(
          error instanceof Error
            ? error.message
            : "Could not load repositories.",
        );
        if (!append) setRepos([]);
        setHasMore(false);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [],
  );

  // Radix unmounts dialog content on close, so this refires per open —
  // intentional: each open shows fresh repos. Effect-scoped controller keeps
  // this StrictMode-safe: the simulated unmount aborts the first fetch and
  // the remount retries instead of stranding `loading`. Deferred via timeout
  // so the effect body itself doesn't synchronously set state.
  useEffect(() => {
    if (!fetchOnMount) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadRepos(1, "", false, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchOnMount, loadRepos]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  function scheduleSearch(nextQuery: string) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void loadRepos(1, nextQuery.trim(), false);
    }, 300);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    scheduleSearch(value);
  }

  const grouped = useMemo(() => groupReposByOwner(repos), [repos]);
  const trimmedQuery = query.trim();
  const showEmpty =
    !loading && repos.length === 0 && !fetchError && !trimmedQuery;
  const showNoMatch =
    !loading && repos.length === 0 && !fetchError && trimmedQuery.length > 0;

  if (showEmpty) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No repositories from your GitHub App installations. Install the App on
          the repos you want to assess, then refresh this page.
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

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        <Label htmlFor={filterId}>Search repositories</Label>
        <Input
          id={filterId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="org/repo or description"
        />
        <p className="text-xs text-muted-foreground">
          Search your GitHub repositories by name or description.
        </p>
      </div>

      {fetchError ? (
        <p className="text-sm text-destructive" role="alert">
          {fetchError}
        </p>
      ) : null}

      {!connectState.ok && connectState.message && !connectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {connectState.message}
        </p>
      ) : null}
      {!disconnectState.ok && disconnectState.message && !disconnectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {disconnectState.message}
        </p>
      ) : null}

      <p
        aria-live="polite"
        aria-atomic="true"
        className="text-xs text-muted-foreground"
      >
        {loading && repos.length === 0
          ? "Loading repositories…"
          : `${repos.length} ${repos.length === 1 ? "repository" : "repositories"} shown`}
      </p>

      {showNoMatch ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-5">
          <p className="text-sm text-muted-foreground">
            No repositories match “{trimmedQuery}”.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => onQueryChange("")}
          >
            Clear search
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4" aria-busy={loading}>
        {loading && repos.length === 0 ? (
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
          connectAction={connectAction}
          disconnectAction={disconnectAction}
          connectPending={connectPending}
          disconnectPending={disconnectPending}
        />
      </div>

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={loading}
          onClick={() => void loadRepos(page + 1, query.trim(), true)}
        >
          {loading
            ? "Loading…"
            : `Load more repositories (${repos.length} shown)`}
        </Button>
      ) : null}
    </div>
  );
}
