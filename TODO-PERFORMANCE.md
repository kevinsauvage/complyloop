# TODO — Performance

## P2 — Medium

- [ ] **App layout blocks children streaming on the nav-attention count**
  - Where: `src/app/(app)/layout.tsx:10-27` awaits `navAttentionForProject` (and `WorkspaceContext`) before rendering `{children}`; no `<Suspense>` around them.
  - Change: Move the attention count (and context strip) into small async components wrapped in `<Suspense>` with a neutral fallback so the shell and page stream first.
  - Expected impact: Better TTFB/first paint and streaming on every app route.
  - Risk: low.
  - Confidence: **Confirmed** structure; measure route Server-Timing.

- [ ] **`html-validate` DOM-to-source mapping is near-quadratic per page**
  - Where: `packages/analysis-core/src/runtime/html-validate-runtime.ts:107-133` (`selectorOf` walks ancestors + sibling scans; `:154` `el.outerHTML` per element), `:209-227` (`elementAtOffset` scans the element array twice per message), `:276` (`offsetForLineColumn` scans from 0 per message).
  - Change: Sort messages by offset and sweep elements once; compute offsets incrementally; avoid `outerHTML` for elements not referenced by messages.
  - Expected impact: Visible on large pages (thousands of elements, many messages).
  - Risk: medium.
  - Confidence: **Measure first** — element count × message count × time in `htmlValidateFindingsForPage`.

- [ ] **Runtime pages and link checks run strictly serially**
  - Where: `packages/analysis-core/src/runtime/scan.ts:189-283` (`for (const url of urls) { await context.newPage(); … }`), `packages/analysis-core/src/runtime/site-level/link-check.ts:138-164` (linkinator per URL).
  - Change: Bounded page pool (2–4) over independent URLs with the shared DNS cache from P0; run a subset of starting URLs for site-level checks.
  - Expected impact: Runtime-phase wall time moves from N × per-page time toward N/pool.
  - Risk: medium (resource contention, shared route interceptor).
  - Confidence: **Measure first** — per-URL durations and total scan wall time.

---

## P3 — Low

- [x] **`shippedCatalog()` allocates a fresh controls array on every call, including per-row lookups**
  - Status: **Fixed.** `shippedCatalog()` returns frozen module-level `frameworks`/`controls` slices (no per-call copy); `frameworkForProject` memoizes the resolved framework per preset and `displayControl` caches themed controls per `frameworkId:controlId`, so per-row lookups are O(1).
  - Where: `packages/analysis-core/src/adapters/catalog.ts:6-14` (`controls: [...rgaaControls]`); callers include `src/server/report.ts:44` (`frameworkForProject` per `displayControl` call, used per finding row on dashboard/findings).
  - Change: Return frozen module-level arrays; resolve the project framework once per request and build a `Map<controlId, displayControl>`.
  - Impact: Removes repeated catalog alloc/lookups on hot render paths. Risk: low. Confidence: **Confirmed**.

- [x] **`FRAMEWORK_PRESETS` serializes full `controlIds` to client components that only use `.length`**
  - Status: **Fixed.** Added `presetSummaries()` (`{ id, name, description, frameworkId, controlCount }`) in the adapters registry; `/settings` and `/requirements` pass the projection, so the catalog id list no longer ships in the RSC payload.
  - Where: `src/app/(app)/settings/page.tsx:59,140-144` → `src/components/settings/default-preset-form.tsx`; `src/components/requirements/requirements-preset-panel.tsx:29-34` → `preset-navigator.tsx`; only consumer uses `preset.controlIds.length` (`src/components/requirements/preset-item-body.tsx:29`).
  - Change: Pass a projection `{ id, name, description, frameworkId, controlCount }`.
  - Impact: Smaller RSC payload on `/settings` and `/requirements`. Risk: low. Confidence: **Confirmed**.

- [x] **Org export issues one full `loadProjectRuntime` per project (N+1)**
  - Status: **Fixed.** Added `listFindingsForProjects`/`listRemediationsForProjects`/`listRequirementsForProjects`/`listAlertsForProjects` in `packages/db` (one set-based `inArray` query per entity type); export now runs six parallel set queries instead of ~6×P. `org.test.ts` updated.
  - Where: `src/server/actions/org.ts:219-225` (`Promise.all(chunk.map(loadProjectRuntime))`, concurrency 5, cap 50) — ~6 queries per project.
  - Change: One set-based query per entity type for all exported projects, or accept as bounded. Impact: export latency. Risk: medium. Confidence: **Confirmed** (bounded by `MAX_EXPORT_PROJECTS`).

- [x] **Worker processes exactly one job per process with no in-process concurrency**
  - Status: **Fixed (opt-in).** `runAssessmentJobBatch` accepts a bounded `concurrency` (default 1 keeps the sequential path); the standalone worker reads `WORKER_CONCURRENCY` (1–8) and the scheduler route accepts `?concurrency=1..4`. Per-project exclusivity stays enforced by `claimNextAssessmentJob` (`NOT EXISTS` + `FOR UPDATE SKIP LOCKED`), so pool workers never race one project. Covered by `assessment-runner.test.ts`.
  - Where: `src/server/assessment-runner.ts:13-22`, `scripts/run-assessment-worker.ts:43` (`runAssessmentJobBatch(1)`), `src/app/api/internal/jobs/run/route.ts:60` (up to 10, still sequential).
  - Change: Bounded in-process pool respecting per-project exclusivity. Impact: throughput; horizontal scaling requires more processes today. Risk: medium. Confidence: **Confirmed**. Measure: queue depth / job latency percentiles.

- [x] **`buildSuggestion` re-reads and re-parses the file for every new finding; snapshot hashing always runs**
  - Status: **Fixed (file reads).** A per-run `FileTextCache` is threaded through `reconcileControlFindings` → `createFinding` → `buildSuggestion`, so each source file is read once per run. Snapshot hashing was already short-circuited on an unchanged git HEAD by the P0 work.
  - Where: `src/server/assessment-findings.ts:109-126` (`fs.readFileSync` per finding, called `:295`), `src/server/monitor.ts:13-29` + `src/server/assessment.ts:184` (hashing all script files every assessment).
  - Change: Memoize file text per `(rootPath, path)` for the run; skip/short-circuit hashing when HEAD is unchanged (see P0 clone item).
  - Impact: Fewer syscalls/OOM pressure on finding-heavy runs. Risk: low. Confidence: **Confirmed**.

---
