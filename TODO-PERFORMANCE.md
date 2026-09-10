# TODO — Performance

## P1 — High

- [ ] **AST scan runs all 52 checks as independent full-tree walks and parses each file twice**
  - Why: This is the AST half of the assessment loop; cost is O(checks × nodes) per file plus a duplicate parse.
  - Where: `packages/analysis-core/src/scan.ts:30-51` (`scanFile` = `allChecks.flatMap(check => check.run(parsed))`), `packages/analysis-core/src/checks/registry.ts:68-122` (52 checks), traversal in `packages/analysis-core/src/parse.ts:35-44`, and `packages/analysis-core/src/jsx-a11y-scan.ts:50` (`linter.verify(text, …)` re-parses the same text with `@typescript-eslint/parser`).
  - Problem: Nearly every check calls `visitJsxTags`/`visitJsxElements`, each a fresh `ts.forEachChild` recursion. `lintJsxA11y` ignores the already-built `SourceFile` and hands raw text to ESLint for a second full parse.
  - Change: Single indexed traversal that dispatches nodes to interested checks (a visitor registry keyed by tag/attr/role), so each file is walked once. For jsx-a11y, either accept the second parse or drop the redundant engine if findings overlap; if kept, investigate a shared parse service/program.
  - Expected impact: Large reduction in CPU per scanned file (AST phase is a major share of job time on larger repos).
  - Risk: high (behavior parity across 52 checks — needs the existing test suite as a gate).
  - Confidence: **Confirmed** (code). Measure first: counter on `forEachChild` invocations per `scanProject`; split time between `parseSource` and `linter.verify`.

- [ ] **A one-row mutation revalidates the whole app layout, forcing every `force-dynamic` page to fully refetch**
  - Why: Action→UI latency is dominated by unrelated page recomputation, and it compounds the unbounded findings load.
  - Where: `src/server/actions/shared.ts:26-28` (`refresh()` = `revalidatePath("/", "layout")`), called from `src/server/actions/remediation.ts:134,172,214,268`, `alerts.ts:48,82`, `requirements.ts:199,265,314`, etc.; pages set `dynamic = "force-dynamic"` (all of `src/app/(app)/**/page.tsx`).
  - Problem: Marking one alert read or approving one remediation re-runs `getProjectRuntime` (all findings + remediations), `clusterFindings`, `prioritizeFindings`, `prioritizeClusters`, and activity filtering.
  - Change: Revalidate the narrowest scope (`revalidatePath("/findings")`, or tag-based `revalidateTag` per entity) and return the updated row for optimistic UI.
  - Expected impact: Big reduction in server CPU and perceived latency under active triage.
  - Risk: medium (stale-cache regressions — cover with tests).
  - Confidence: **Confirmed**.

- [ ] **Requirements page renders the entire preset (~100) as client-component islands, unpaginated**
  - Why: Hydration cost and DOM size are the main front-end risk on the second-heaviest route.
  - Where: `src/app/(app)/requirements/page.tsx:156-163` → `src/components/requirements/assessed-requirement-list.tsx:27-52` maps every control with no pagination/virtualization → `src/components/requirements/requirement-card.tsx:139-143` renders `RequirementRemediationActions` (client, `useActionState`, `Collapsible`, textareas) for each.
  - Change: URL-driven pagination/windowing by theme + status (pattern already exists via `PaginationNav` on findings/evidence), or render summary rows and lazy-mount the action island on interaction/intersection.
  - Expected impact: Lower INP/time-to-interactive and less hydration work on `/requirements`.
  - Risk: medium.
  - Confidence: **Confirmed** (no pagination in path). Measure first: React DevTools hydration timeline + Lighthouse.

- [ ] **`zod` (64.5 KB gzip) reaches the client through shared modules**
  - Why: A schema library is in the client graph for small response parsing / URL helpers.
  - Where: `src/core/filters.ts:1` (`import { z } from "zod"`, schemas `:467-516`), `src/core/assessment-jobs.ts:1-38`; client consumers `src/components/github-repo-picker.tsx:17,29`, `src/components/dashboard/assessment-job-status-live.tsx:3-5`, `src/components/findings/findings-filter-bar.tsx:5-6`, `findings-bulk-list.tsx:10-13`, `finding-queue-nav.tsx:12`. Build evidence: `.next/static/chunks/1dr1jm0uhmg8d.js` = **284,859 B raw / 64,513 B gzip** begins with the zod runtime.
  - Change: Use `zod/mini`, hand-write the few small guards used client-side, or move validation server-side and share only types. Split pure client-safe helpers (href builders/param parsers) out of `core/filters` so importing them does not pull zod/`lifecycle`.
  - Expected impact: Remove a large chunk from dashboard/findings/picker bundles; reduces parse/execute on hydration.
  - Risk: low–medium.
  - Confidence: **Confirmed** (build chunk + imports).

---

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

- [ ] **`shippedCatalog()` allocates a fresh controls array on every call, including per-row lookups**
  - Where: `packages/analysis-core/src/adapters/catalog.ts:6-14` (`controls: [...rgaaControls]`); callers include `src/server/report.ts:44` (`frameworkForProject` per `displayControl` call, used per finding row on dashboard/findings).
  - Change: Return frozen module-level arrays; resolve the project framework once per request and build a `Map<controlId, displayControl>`.
  - Impact: Removes repeated catalog alloc/lookups on hot render paths. Risk: low. Confidence: **Confirmed**.

- [ ] **`FRAMEWORK_PRESETS` serializes full `controlIds` to client components that only use `.length`**
  - Where: `src/app/(app)/settings/page.tsx:59,140-144` → `src/components/settings/default-preset-form.tsx`; `src/components/requirements/requirements-preset-panel.tsx:29-34` → `preset-navigator.tsx`; only consumer uses `preset.controlIds.length` (`src/components/requirements/preset-item-body.tsx:29`).
  - Change: Pass a projection `{ id, name, description, frameworkId, controlCount }`.
  - Impact: Smaller RSC payload on `/settings` and `/requirements`. Risk: low. Confidence: **Confirmed**.

- [ ] **Org export issues one full `loadProjectRuntime` per project (N+1)**
  - Where: `src/server/actions/org.ts:219-225` (`Promise.all(chunk.map(loadProjectRuntime))`, concurrency 5, cap 50) — ~6 queries per project.
  - Change: One set-based query per entity type for all exported projects, or accept as bounded. Impact: export latency. Risk: medium. Confidence: **Confirmed** (bounded by `MAX_EXPORT_PROJECTS`).

- [ ] **Worker processes exactly one job per process with no in-process concurrency**
  - Where: `src/server/assessment-runner.ts:13-22`, `scripts/run-assessment-worker.ts:43` (`runAssessmentJobBatch(1)`), `src/app/api/internal/jobs/run/route.ts:60` (up to 10, still sequential).
  - Change: Bounded in-process pool respecting per-project exclusivity. Impact: throughput; horizontal scaling requires more processes today. Risk: medium. Confidence: **Confirmed**. Measure: queue depth / job latency percentiles.

- [ ] **`buildSuggestion` re-reads and re-parses the file for every new finding; snapshot hashing always runs**
  - Where: `src/server/assessment-findings.ts:109-126` (`fs.readFileSync` per finding, called `:295`), `src/server/monitor.ts:13-29` + `src/server/assessment.ts:184` (hashing all script files every assessment).
  - Change: Memoize file text per `(rootPath, path)` for the run; skip/short-circuit hashing when HEAD is unchanged (see P0 clone item).
  - Impact: Fewer syscalls/OOM pressure on finding-heavy runs. Risk: low. Confidence: **Confirmed**.

---
