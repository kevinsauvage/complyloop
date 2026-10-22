"use client";

import { useId, useState } from "react";

import { normalizeRoutes } from "@complyloop/analysis-core/runtime/routes";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateRuntimeAuditAction } from "@/server/actions/runtime-audit";

import { StatefulActionForm } from "./stateful-action-form";

/** Below this many options a filter input is noise. */
const FILTER_THRESHOLD = 8;

const MANUAL_PATH_MESSAGE =
  "Enter a page path (e.g. /pricing), or a full URL on the same host as the preview URL.";

interface DiscoveredRoutes {
  source: "robots" | "sitemap" | "none";
  paths: string[];
  truncated: boolean;
}

/**
 * Preview-URL settings: the base URL, the pages to audit, and a picker that
 * offers the pages the site's own sitemap declares.
 *
 * The selection is a set of real checkboxes named `runtimeRoutes`, so the form
 * submits the chosen pages natively — no hidden inputs mirroring React state,
 * and a saved selection still round-trips if the picker never runs. Pages
 * outside the sitemap are added by hand and become options like any other.
 */
export function RuntimeAuditForm({
  projectId,
  runtimeBaseUrl,
  runtimeRoutes,
  maxRoutes,
}: {
  projectId: string;
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
  /** Pages one assessment audits; selecting more would be dropped by the scan. */
  maxRoutes: number;
}) {
  const filterId = useId();
  const manualId = useId();
  const hintId = useId();
  const [baseUrl, setBaseUrl] = useState(runtimeBaseUrl ?? "");
  const [selected, setSelected] = useState<string[]>(() =>
    normalizeRoutes(runtimeRoutes ?? []),
  );
  // Every page the picker has shown, independent of what is currently
  // selected: unchecking a saved page must not remove it from the list.
  const [known, setKnown] = useState<string[]>(() =>
    normalizeRoutes(runtimeRoutes ?? []),
  );
  const [discovered, setDiscovered] = useState<DiscoveredRoutes | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const needle = filter.trim().toLowerCase();
  const matchesFilter = (path: string): boolean =>
    needle.length === 0 || path.toLowerCase().includes(needle);
  const nothingMatches =
    known.length > 0 && filter.trim().length > 0 && !known.some(matchesFilter);

  const atCap = selected.length >= maxRoutes;

  function toggle(path: string): void {
    setSelected((current) =>
      current.includes(path)
        ? current.filter((candidate) => candidate !== path)
        : current.length >= maxRoutes
          ? current
          : [...current, path],
    );
  }

  function addManual(): void {
    const trimmed = manual.trim();
    if (trimmed.length === 0) return;

    let path: string;
    if (/^https?:\/\//i.test(trimmed)) {
      // A pasted URL is only usable when it points at the same host we audit;
      // anything else would be refused at save time, so say so now.
      const origin = originOf(baseUrl);
      let parsed: URL | null = null;
      try {
        parsed = new URL(trimmed);
      } catch {
        parsed = null;
      }
      if (parsed === null || origin === null || parsed.origin !== origin) {
        setManualError(MANUAL_PATH_MESSAGE);
        return;
      }
      path = normalizeRoutes([parsed.pathname])[0] ?? "/";
    } else {
      const [normalized] = normalizeRoutes([trimmed]);
      if (normalized === undefined) {
        setManualError(MANUAL_PATH_MESSAGE);
        return;
      }
      path = normalized;
    }

    setManualError(null);
    setKnown((current) =>
      current.includes(path) ? current : [...current, path],
    );
    if (selected.length >= maxRoutes) {
      // The Add button is disabled at the cap; Enter has to say why too.
      setManualError(
        `At most ${maxRoutes} page${maxRoutes === 1 ? "" : "s"} can be audited per run — uncheck one first.`,
      );
      return;
    }
    if (!selected.includes(path)) {
      setSelected((current) => [...current, path]);
    }
    setManual("");
  }

  async function loadPages(): Promise<void> {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/runtime-routes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUrl }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setError(
          isErrorPayload(payload)
            ? payload.error
            : "Could not read the sitemap for that URL.",
        );
        return;
      }
      if (!isDiscoveryPayload(payload)) {
        setStatus("error");
        setError("Could not read the sitemap for that URL.");
        return;
      }
      setDiscovered(payload);
      setKnown((current) => [...new Set([...current, ...payload.paths])]);
      setStatus("idle");
      // Pre-select the site root: it is the page every preview has.
      if (payload.paths.includes("/")) {
        setSelected((current) =>
          current.includes("/") || current.length >= maxRoutes
            ? current
            : ["/", ...current],
        );
      }
    } catch {
      setStatus("error");
      setError("Could not reach that URL. Check it and try again.");
    }
  }

  const statusLine =
    status === "error"
      ? null
      : status === "loading"
        ? "Reading the sitemap…"
        : discovered === null
          ? "Load the site's sitemap to pick pages, or add them by hand."
          : discovered.source === "none"
            ? "No sitemap found at this URL — add the pages you want to audit."
            : `${discovered.paths.length} page${discovered.paths.length === 1 ? "" : "s"} found in the ${
                discovered.source === "robots"
                  ? "sitemap listed in robots.txt"
                  : "sitemap"
              }.${discovered.truncated ? " The sitemap lists more; add the rest by hand." : ""}`;

  return (
    <StatefulActionForm
      action={updateRuntimeAuditAction}
      submitLabel="Save preview URL"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeBaseUrl">Preview URL (runtime audit)</Label>
        <Input
          id="runtimeBaseUrl"
          name="runtimeBaseUrl"
          type="url"
          placeholder="https://your-app.vercel.app"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          autoComplete="off"
          aria-describedby="runtimeBaseUrl-hint"
        />
        <p id="runtimeBaseUrl-hint" className="text-xs text-muted-foreground">
          Fallback for manual runs, not tied to a commit: findings found here
          are reported, but only an audit of a deployment of the scanned commit
          can pass live-page checks or replace source findings. Leave empty for
          code-only assessment.
        </p>
      </div>

      <fieldset
        className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
        aria-describedby={hintId}
        aria-busy={status === "loading"}
      >
        <legend className="px-1 text-sm font-medium">Pages to audit</legend>
        <p id={hintId} className="text-xs text-muted-foreground">
          One assessment audits up to {maxRoutes} page
          {maxRoutes === 1 ? "" : "s"} of this URL. With none selected, only{" "}
          <code className="font-mono">/</code> is audited.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadPages()}
            disabled={status === "loading" || baseUrl.trim().length === 0}
          >
            {status === "loading" ? "Reading sitemap…" : "Load pages"}
          </Button>
          {selected.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected([])}
            >
              Clear all
            </Button>
          ) : null}
          <span
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {statusLine}
          </span>
        </div>

        {status === "error" && error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {known.length > 0 ? (
          <div className="flex flex-col gap-2">
            {known.length > FILTER_THRESHOLD ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={filterId} className="text-xs">
                  Filter pages
                </Label>
                <Input
                  id={filterId}
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter must filter, not submit the whole settings form.
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="pricing"
                  autoComplete="off"
                />
              </div>
            ) : null}
            {nothingMatches ? (
              <p className="text-xs text-muted-foreground" role="status">
                No page matches “{filter}”. The {selected.length} selected page
                {selected.length === 1 ? "" : "s"} stay selected and will be
                saved.
              </p>
            ) : null}
            {/* Every option keeps its checkbox mounted: a filtered-out row
                must still submit its value, or saving would silently drop the
                pages the filter is hiding. */}
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto pr-1">
              {known.map((path) => {
                const checked = selected.includes(path);
                const matches = matchesFilter(path);
                return (
                  <li key={path} hidden={!matches}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/25">
                      <input
                        type="checkbox"
                        name="runtimeRoutes"
                        value={path}
                        checked={checked}
                        onChange={() => toggle(path)}
                        disabled={!checked && atCap}
                        className="size-4 shrink-0 accent-signal"
                      />
                      <span className="truncate font-mono text-xs">{path}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={manualId} className="text-xs">
            Add a page that is not in the sitemap
          </Label>
          <div className="flex gap-2">
            <Input
              id={manualId}
              type="text"
              value={manual}
              onChange={(event) => {
                setManual(event.target.value);
                setManualError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // Enter adds the page; it must not submit the settings form.
                event.preventDefault();
                addManual();
              }}
              placeholder="/pricing"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addManual}
              disabled={manual.trim().length === 0 || atCap}
            >
              Add
            </Button>
          </div>
          {manualError ? (
            <p className="text-xs text-destructive" role="alert">
              {manualError}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {baseUrl.trim().length === 0
            ? "No preview URL — saving clears the page selection."
            : selected.length === 0
              ? "No page selected — only / will be audited."
              : `${selected.length} of ${maxRoutes} page${maxRoutes === 1 ? "" : "s"} selected.`}
        </p>
      </fieldset>
    </StatefulActionForm>
  );
}

/** Origin of a typed preview URL, or null while it is not yet parseable. */
function originOf(raw: string): string | null {
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isErrorPayload(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isDiscoveryPayload(value: unknown): value is DiscoveredRoutes {
  if (!isRecord(value)) return false;
  return (
    (value.source === "robots" ||
      value.source === "sitemap" ||
      value.source === "none") &&
    Array.isArray(value.paths) &&
    value.paths.every((path) => typeof path === "string") &&
    typeof value.truncated === "boolean"
  );
}
