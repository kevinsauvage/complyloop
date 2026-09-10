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
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { githubRepoSearchResponseSchema, parseUnknown } from "@/core/boundary";
import { STATUS_TONE_BADGE } from "@/core/status-display";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  emptyActionMessageState,
  type ActionMessageState,
} from "@/server/action-state";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
} from "@/server/actions/connect";
import type { GitHubRepoSummary } from "@/server/github-access";
import { z } from "zod";

function repoOwner(fullName: string): string {
  return fullName.split("/")[0] ?? fullName;
}

type RepoOwnerGroup = {
  owner: string;
  repos: GitHubRepoSummary[];
};

/** Groups repos by GitHub owner/org, sorted alphabetically. */
function groupReposByOwner(repos: GitHubRepoSummary[]): RepoOwnerGroup[] {
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

const connectInitial: ActionMessageState = emptyActionMessageState;
const disconnectInitial: ActionMessageState = emptyActionMessageState;

const repoSearchErrorSchema = z.object({
  error: z.string().optional(),
});

async function fetchRepos(options: {
  q: string;
  page: number;
  signal?: AbortSignal;
}): Promise<z.infer<typeof githubRepoSearchResponseSchema>> {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.page > 1) params.set("page", String(options.page));

  const response = await fetch(
    `/api/github/repos${params.size > 0 ? `?${params.toString()}` : ""}`,
    { signal: options.signal },
  );
  const json: unknown = await response.json();
  if (!response.ok) {
    const payload = repoSearchErrorSchema.safeParse(json);
    throw new Error(
      (payload.success ? payload.data.error : undefined) ??
        "Could not load repositories.",
    );
  }
  return parseUnknown(
    githubRepoSearchResponseSchema,
    json,
    "Could not load repositories.",
  );
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
    async (nextPage: number, q: string, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);
      try {
        const result = await fetchRepos({
          q,
          page: nextPage,
          signal: controller.signal,
        });
        setRepos((prev) =>
          append
            ? [
                ...prev,
                ...result.repos.filter(
                  (repo) => !prev.some((existing) => existing.fullName === repo.fullName),
                ),
              ]
            : result.repos,
        );
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setFetchError(
          error instanceof Error ? error.message : "Could not load repositories.",
        );
        if (!append) setRepos([]);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  // Radix unmounts dialog content on close, so this refires per open —
  // intentional: each open shows fresh repos.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!fetchOnMount || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void loadRepos(1, "", false);
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
  const showEmpty = !loading && repos.length === 0 && !fetchError && !trimmedQuery;
  const showNoMatch =
    !loading && repos.length === 0 && !fetchError && trimmedQuery.length > 0;

  if (showEmpty) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No repositories from your GitHub App installations. Install the App
          on the repos you want to assess, then refresh this page.
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

      {connectState.error && !connectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {connectState.error}
        </p>
      ) : null}
      {disconnectState.error && !disconnectPending ? (
        <p className="text-sm text-destructive" role="alert">
          {disconnectState.error}
        </p>
      ) : null}

      <p aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground">
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
                          <Badge className={`${STATUS_TONE_BADGE.passed} font-sans`}>
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
                          label={disconnectPending ? "Disconnecting…" : "Disconnect"}
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
                        <input type="hidden" name="fullName" value={repo.fullName} />
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
          {loading ? "Loading…" : `Load more repositories (${repos.length} shown)`}
        </Button>
      ) : null}
    </div>
  );
}
