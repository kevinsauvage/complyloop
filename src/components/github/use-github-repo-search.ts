"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GitHubRepoSummary } from "@/server/github/github-types";

import {
  githubRepoSearchError,
  type GitHubRepoSearchResponse,
  parseGitHubRepoSearchResponse,
} from "./github-repo-search";

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

export function useGitHubRepoSearch(options: {
  initialRepos: GitHubRepoSummary[];
  fetchOnMount: boolean;
}) {
  const { initialRepos, fetchOnMount } = options;
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GitHubRepoSummary[]>(initialRepos);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialRepos.length >= 30);
  const [loading, setLoading] = useState(fetchOnMount);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

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

  const trimmedQuery = query.trim();
  const showEmpty =
    !loading && repos.length === 0 && !fetchError && !trimmedQuery;
  const showNoMatch =
    !loading && repos.length === 0 && !fetchError && trimmedQuery.length > 0;

  return {
    query,
    repos,
    page,
    hasMore,
    loading,
    fetchError,
    trimmedQuery,
    showEmpty,
    showNoMatch,
    loadRepos,
    onQueryChange,
  };
}
