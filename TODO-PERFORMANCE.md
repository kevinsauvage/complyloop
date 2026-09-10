# TODO — Performance

Audit of the whole repo for real, measurable performance wins. Findings are
grounded in source (`file:line`) and, where noted, in the last production build
in `.next/` (Next 16 / Turbopack). Numbers quoted as `raw / gzip` come from the
built client chunks, not estimates.

**Confidence key**

- **Confirmed** — visible in code/build output; no profiling needed to act.
- **Measure first** — mechanism is real, but the size of the win depends on
  production data shape. The item states exactly what to measure.

**What was checked and is fine (do not spend time here):** fonts
(`next/font` self-hosted, `subsets: ["latin"]`), `public/` assets (5 small
SVGs), no raw `<img>`, all `lucide-react` imports are named (tree-shakeable),
`tw-animate-css` is actually used, `playwright`/`axe-core`/`html-validate`/
`linkinator`/`diff`/`simple-git`/`ai`/`@octokit/*` are server-only and in
`serverExternalPackages`, advisory locks are transaction-scoped (no leaks),
`withRepoCheckout` never `npm install`s, and the browser is process-reused
(`packages/analysis-core/src/runtime/scan.ts:56-67`).

---

## P0 — Critical

- [x] **Sentry browser SDK (≈133 KB gzip) loads on every route, even when no DSN is set**
  - Status: **Fixed.** `src/instrumentation-client.ts` now dynamically imports and initializes Sentry only when `NEXT_PUBLIC_SENTRY_DSN` is set (fire-and-forget per the instrumentation-client contract); `onRouterTransitionStart` forwards once the chunk resolves. Also moved `ActionState`/`initialActionState` to `src/core/action-state.ts` and repointed client importers so `@/server/action-state` → `observability` → Sentry no longer leaks into the client graph. Build: SDK is now a lazy 172 KB gzip chunk; eager root JS fell ~206 KB → ~131 KB gzip.
  - Why: Initial-load JS is the single largest lever on TTI/LCP, and the app currently spends ~64% of its shared root JavaScript on error reporting.
  - Where: `src/instrumentation-client.ts:1-4`, `src/sentry/init.ts:14-21`, `next.config.ts:62-72`. Build evidence: root main files in `.next/build-manifest.json` include `.next/static/chunks/11l6vou6kjymy.js` = **427,801 B raw / 132,571 B gzip** plus `.next/static/chunks/0ar-73jy9w2xf.js` (18,890 B gzip). Shared root main files total ≈ **206 KB gzip** per route.
  - Problem: `Sentry.init(...)` runs unconditionally; the SDK is statically imported and bundled into the shared root chunk for `/`, `/login`, `/legal/*`, and every app route. When `NEXT_PUBLIC_SENTRY_DSN` is unset (local, CI, self-hosted), the bytes are pure waste. `next.config.ts` even disables source-map upload without `SENTRY_AUTH_TOKEN`, so much of this may be inert.
  - Change: Gate the import so no DSN means no SDK: read the DSN first and `if (dsn) { const Sentry = await import("@sentry/nextjs"); Sentry.init(sentryInitOptions(dsn)); }`. Consider `Sentry.lazyLoadIntegration`/disabling unused integrations, and dropping `widenClientFileUpload`. Confirm `onRouterTransitionStart` is only exported when initialized.
  - Expected impact: Remove up to ~133 KB gzip + ~19 KB gzip of initial JS and a large share of client parse/execute time on first load; directly improves LCP/TTI and Lighthouse "reduce unused JavaScript".
  - Risk: low (observability-only; gate on DSN).
  - Confidence: **Confirmed** (build chunks). Follow-up measure: `npm run analyze` to confirm the chunk disappears from shared client graph when DSN is absent.

- [x] **Every project page loads the entire findings history into memory (unbounded, then paginated in JS)**
  - Status: **Fixed (read path).** Added `statuses` filtering to `listFindingsForProject` + `countFindingsByStatusForProject` (index-backed), threaded `findingStatuses` through `loadProjectRuntime`/`getProjectRuntime`. Dashboard/requirements/finding-detail now load open (or the active status) only; settings and alert actions load none. Findings page loads open + the active history tab and uses SQL status counts for inactive tab badges. Write/assessment/report/org-export paths still load full history. Follow-up: SQL pagination for resolved/dismissed and a retention/archive job.
  - Why: Server response time and RSC payload grow linearly with lifetime assessment count, not with the rows the user sees. This is the primary reason pages get slower as a project matures.
  - Where: `packages/db/src/repo/findings.ts:20-29` (`listFindingsForProject` — no `status` filter, no `LIMIT`), called by `loadProjectRuntime` (`packages/db/src/workspace-load.ts:59-67`), surfaced via `getProjectRuntime` (`src/server/project-runtime.ts:33-55`), and consumed on every page (`src/app/(app)/findings/page.tsx:95-122`, dashboard, requirements, settings, reports). Pagination happens in memory at `src/app/(app)/findings/page.tsx:120-122` (`paginateSlice`).
  - Problem: Findings are never deleted (`grep` finds no `delete(findings)`), and `createFinding` mints a new UUID row for each violation (`src/server/assessment-findings.ts:274`), so resolved/dismissed rows accumulate forever. A project assessed hourly can carry thousands of dead rows into every request, plus `structuredClone` in the write path.
  - Change: (a) In `listFindingsForProject`, fetch only what each surface needs: `open` findings always, plus a bounded window of `resolved`/`dismissed` (or SQL `LIMIT/OFFSET` for the list tabs). (b) Push tab/status/search pagination into SQL for `resolved`/`dismissed`. (c) Add a retention/archive job for old resolved findings. Keep `open` in memory only because clustering/priority needs it.
  - Expected impact: >95% reduction in RSC payload/memory on Findings/Dashboard for mature projects; major TTFB/LCP win.
  - Risk: medium (touches shared read path and several pages — preserve cluster/priority behavior for open findings).
  - Confidence: **Confirmed** (code). Measure first: `SELECT project_id, count(*) FROM findings GROUP BY 1 ORDER BY 2 DESC` and RSC payload/Server-Timing on `/findings` with a seeded large project.

- [x] **Assessment polling reloads the full tenancy every 3 s and refreshes the whole app on completion**
  - Status: **Fixed.** Route now uses `viewerCanViewProject` (session + one project row + that org's memberships) instead of `getWorkspace()`. Poller pauses while `document.hidden`, guards against overlapping requests with an in-flight flag, and polls immediately on visibility resume. (Full-page `router.refresh()` on completion kept: no scoped-refresh API.)
  - Why: A dashboard left open during a run generates continuous avoidable DB + auth load per tab, and completion triggers a full `force-dynamic` refetch of the page.
  - Where: `src/components/dashboard/assessment-job-status-live.tsx:10,30-73` (`POLL_MS = 3000`, `setInterval`, `router.refresh()` at `:53`); route `src/app/api/projects/[projectId]/assessment-jobs/route.ts:25` calls `getWorkspace()`; `src/server/workspace.ts:115-139` (`loadViewerWorkspaceState` → `auth()` + 2 cookies + `listOrgIdsForUser` + organizations/memberships/projects = ~4-5 queries).
  - Problem: Each poll authorizes with a full tenancy load to return ~5 job rows; there is no `document.visibilitychange` pause and no in-flight guard, so slow responses overlap; on completion `router.refresh()` re-runs the entire page (and the unbounded findings load from the previous item).
  - Change: Make the poll route session-only auth (verify `auth()` + project visibility without `loadTenancyDb`); pause polling when `document.hidden`; guard with an `inFlight` ref; replace full `router.refresh()` with a pipeline-scoped refresh or optimistic job state.
  - Expected impact: Eliminates ~20 redundant tenancy query batches/minute per open tab and removes a full-page recompute per completed run.
  - Risk: low.
  - Confidence: **Confirmed**.

- [x] **Missing index `evidence(finding_id)` makes the finding detail page scan the largest table**
  - Status: **Fixed.** Added `evidence_finding_at_idx` to `packages/db/src/schema.ts` and `drizzle/0003_add_evidence_finding_at_index.sql`. Other missing indexes remain in P1 for a follow-up migration.
  - Why: `evidence` is append-only and grows without bound; the finding page and PR action filter by `finding_id`, which has no index.
  - Where: Query `packages/db/src/repo/evidence.ts:137-147` (`listEvidenceForFinding`: `WHERE finding_id = $1 ORDER BY at DESC`); schema `packages/db/src/schema.ts:233-236` and `drizzle/0000_init.sql` define only `evidence_at_idx` and `evidence_project_at_idx`. Consumers: `src/app/(app)/findings/[id]/page.tsx:109` and `src/server/actions/pr.ts:59`.
  - Problem: Postgres must Seq Scan + Sort the whole `evidence` table for one finding page — O(total evidence) per view.
  - Change: Add `index("evidence_finding_at_idx").on(table.findingId, table.at)` (descending `at` if supported) via a Drizzle migration. While in that migration, add the other missing indexes listed in P1 "Missing indexes" so it ships once.
  - Expected impact: Finding detail and PR prep go from full scan to index range scan; large TTFB reduction on the most-visited triage route.
  - Risk: low.
  - Confidence: **Confirmed** (schema vs predicate). Measure first: `EXPLAIN (ANALYZE, BUFFERS)` the query.

- [x] **Runtime audits perform a DNS resolution for every subresource request**
  - Status: **Fixed.** Added `createCachedDnsLookup` and use it in the Playwright `**/*` route interceptor (per-scan memoization). The pre-navigation and `assertStableRuntimeDns` rebinding checks keep using the uncached lookup by design.
  - Why: This is hidden per-page wall-time in the core product loop (assessing a repo's live preview).
  - Where: `packages/analysis-core/src/runtime/scan.ts:165-187` — `context.route("**/*", ...)` calls `allowRuntimeNavigation(request.url(), ...)`; `packages/analysis-core/src/runtime/url-safety.ts:98-128,157-170` resolves the host via `dns.lookup(hostname, { all: true })` on every call.
  - Problem: The `**/*` pattern matches images, fonts, CSS, JS, XHR, beacons — potentially hundreds of requests per page — and each incurs an async DNS lookup before `route.continue()`. There is no per-host cache and no resource-type filter.
  - Change: Cache resolutions per hostname for the lifetime of a scan (a `Map<string, …>` passed into the interceptor), and skip full SSRF re-resolution for same-origin subresources of an already-validated document, or only validate `document`/`script`/`stylesheet`/`xhr`/`fetch`. Keep the pre-navigation and redirect-hop checks.
  - Expected impact: Removes a large fixed latency tax from every audited page (likely seconds per page on asset-heavy sites).
  - Risk: medium (SSRF boundary — keep document/navigation/redirect checks and the rebinding guard intact).
  - Confidence: **Confirmed** (code path). Measure first: Playwright request count + route-handler time per page.

- [x] **Every assessment re-clones the repo and re-hashes/re-stats the whole tree**
  - Status: **Fixed (per-job work).** `detectChanges` now short-circuits when `git HEAD` is unchanged (reuses the prior snapshot, no re-hash). `runAssessment` additionally skips the full AST scan and reuses prior AST findings when HEAD **and** the control scope **and** the check registry are unchanged (`controlScopeKey` = registry signature + scoped control ids, stored on the snapshot). Ephemeral clones per job are an intentional architecture choice, so no persistent checkout cache was added.
  - Why: For continuous re-assessment of the same project this re-transfers and re-walks everything on every job.
  - Where: `src/server/repo-checkout.ts:183-222` (`withRepoCheckout`: `mkdtempSync` → `cloneAuthedShallow` → `assertCheckoutWithinQuota` → `rmSync`), `:144-160` (`--depth 1`), `:42-83` (quota walk stats every file); `src/server/monitor.ts:13-29` (`captureSnapshot` globs `**/*.{tsx,jsx,ts,js}` and SHA-256s each file); `src/server/assessment.ts:184` always calls `detectChanges`.
  - Problem: Each webhook/assessment/PR job does a fresh network clone into a temp dir that is deleted, then at least two more full-tree passes (quota + snapshot hashing), then `scanProject` re-reads the JSX subset. No per-project mirror/cache, no reuse when HEAD is unchanged.
  - Change: Keep a per-project bare mirror (or `--reference` repo) and `git fetch --depth 1` + `git checkout` instead of a full clone; short-circuit `detectChanges` when the fetched HEAD equals the last snapshot's `gitHead` (then skip hashing/scanning unchanged content); reuse the glob result and hash while reading files for parsing.
  - Expected impact: Dominant reduction in worker I/O and wall time for large repos and frequent re-assessments.
  - Risk: medium (cache invalidation/auth/token handling and cleanup).
  - Confidence: **Confirmed** (code). Measure first: clone duration + bytes per job, and `read`/`stat` counts per `runAssessment`.

---

## P1 — High

- [ ] **AST scan runs all 52 checks as independent full-tree walks and parses each file twice**
  - Why: This is the AST half of the assessment loop; cost is O(checks × nodes) per file plus a duplicate parse.
  - Where: `packages/analysis-core/src/scan.ts:30-51` (`scanFile` = `allChecks.flatMap(check => check.run(parsed))`), `packages/analysis-core/src/checks/registry.ts:68-122` (52 checks), traversal in `packages/analysis-core/src/parse.ts:35-44`, and `packages/analysis-core/src/jsx-a11y-scan.ts:50` (`linter.verify(text, …)` re-parses the same text with `@typescript-eslint/parser`).
  - Problem: Nearly every check calls `visitJsxTags`/`visitJsxElements`, each a fresh `ts.forEachChild` recursion. `lintJsxA11y` ignores the already-built `SourceFile` and hands raw text to ESLint for a second full parse.
  - Change: Single indexed traversal that dispatches nodes to interested checks (a visitor registry keyed by tag/attr/role), so each file is walked once. For jsx-a11y, either accept the second parse or drop the redundant engine if findings overlap; if kept, investigate a shared parse service/program.
  - Expected impact: Large reduction in CPU per scanned file (AST phase is a major share of job time on larger repos).
  - Risk: high (behavior parity across 52 checks — needs the existing test suite as a gate).
  - Confidence: **Confirmed** (code). Measure first: counter on `forEachChild` invocations per `scanProject`; split time between `parseSource` and `linter.verify`.

- [ ] **Axe runs ~6× per page and target-size is computed 3×**
  - Why: `axe.run` is typically the most expensive single browser step.
  - Where: `packages/analysis-core/src/runtime/scan.ts`: baseline `runAxeOnPage` `:212`; `axeTargetSizeViolations` `:251`; mobile viewport `:406`, coarse pointer `:417`; per theme condition `:446` (dark + light).
  - Problem: Per page = 1 full axe pass + 2 full condition passes + 3 target-size passes. The target-size runs differ only by viewport/pointer emulation; the full condition passes differ only by `emulateMedia`.
  - Change: Compute target-size once per viewport/pointer combination and reuse across the baseline; run theme-condition axe passes only when the page actually uses `prefers-color-scheme`-sensitive styling (or limit to `THEME_SENSITIVE_AXE_RULES`).
  - Expected impact: Removes 3 of ~6 engine passes per page.
  - Risk: medium (must preserve condition-attributed findings).
  - Confidence: **Confirmed** (code). Measure first: count/duration of `axe.run` per page.

- [ ] **Focus probes press Tab up to 80× per page, and repeat for each theme condition**
  - Why: Each Tab is a CDP round-trip, and the probe re-queries the DOM every step.
  - Where: `packages/analysis-core/src/runtime/custom-checks/focus.ts:222,289` (`MAX_TAB_STEPS = 80`, `for … await page.keyboard.press("Tab")` + `querySelectorAll`/`indexOf` per step), invoked from `custom-checks/index.ts:128,191` and `runtime/scan.ts:450`; also `restorePageAfterMutatingProbes` does a full `page.goto` reload between interaction and viewport probes (`page-restore.ts:10-17`, called `custom-checks/index.ts:158`).
  - Problem: ~80 tabs × (baseline + dark + light) ≈ 240+ tab round-trips per page, plus a full page reload per page scan.
  - Change: Cache the focusable list once; skip the theme re-run when no color-scheme-sensitive focus styling exists; replace the mid-scan reload with targeted state restoration where safe.
  - Expected impact: Tens of seconds per focusable-heavy page removed.
  - Risk: medium.
  - Confidence: **Confirmed** (code). Measure first: `keyboard.press`/`page.evaluate` counts and probe duration.

- [ ] **Missing indexes on hot predicates (batch into one migration)**
  - Why: Confirmed schema/predicate mismatches cause Seq Scans on frequently-hit queries.
  - Where / Problem:
    - `assessments` — latest-per-project sorts on `payload->>'completedAt'`/`startedAt` (`packages/db/src/repo/assessments.ts:41-75`), only `project_id` indexed (`schema.ts:146`). Add `(project_id, (payload->>'completedAt') DESC, (payload->>'startedAt') DESC)`.
    - `alerts` — unread count filters `project_id AND read=false` (`packages/db/src/repo/nav-attention.ts:29-30`); only `project_id` indexed (`schema.ts:216`). Add partial `(project_id) WHERE read = false`.
    - `evidence.kind` — count/group-by/list filter `kind` (`packages/db/src/repo/evidence.ts:52-103`); unindexed. Add `(project_id, kind, at)`.
    - `memberships` — `WHERE lower(github_login) = $1` with no `org_id` (`packages/db/src/repo/orgs.ts:59-74,157-160`) cannot use `memberships_org_login_uidx` (`schema.ts:81-84`, leading column `org_id`). Add standalone `(lower(github_login))`.
    - `projects` — `WHERE lower(payload->'github'->>'fullName') = $1` with no `org_id` (`packages/db/src/repo/projects.ts:55-71`) cannot use `projects_org_github_uidx` (`schema.ts:104-106`). Add standalone expression index.
    - `rate_limit_buckets.updated_at` — prune deletes `WHERE updated_at < cutoff` (`src/server/rate-limit.ts:70-78`) with only the PK (`schema.ts:309`). Add `(updated_at)`.
    - `assessment_jobs.lease_expires_at` — lease recovery filters `status='running' AND lease_expires_at <= now` (`src/server/assessment-jobs.ts:187-222`); `assessment_jobs_ready_idx` is `(status, available_at)`. Add `(status, lease_expires_at)` or a partial index on `running`.
  - Change: Add all of the above in a single Drizzle migration; verify each with `EXPLAIN (ANALYZE, BUFFERS)`.
  - Expected impact: Removes full scans from navigation, evidence, webhook, assessment and job-queue paths.
  - Risk: low (index-only; slightly more write cost).
  - Confidence: **Confirmed** (schema vs predicate); planner choice should still be verified against prod-shaped data.

- [ ] **A one-row mutation revalidates the whole app layout, forcing every `force-dynamic` page to fully refetch**
  - Why: Action→UI latency is dominated by unrelated page recomputation, and it compounds the unbounded findings load.
  - Where: `src/server/actions/shared.ts:26-28` (`refresh()` = `revalidatePath("/", "layout")`), called from `src/server/actions/remediation.ts:134,172,214,268`, `alerts.ts:48,82`, `requirements.ts:199,265,314`, etc.; pages set `dynamic = "force-dynamic"` (all of `src/app/(app)/**/page.tsx`).
  - Problem: Marking one alert read or approving one remediation re-runs `getProjectRuntime` (all findings + remediations), `clusterFindings`, `prioritizeFindings`, `prioritizeClusters`, and activity filtering.
  - Change: Revalidate the narrowest scope (`revalidatePath("/findings")`, or tag-based `revalidateTag` per entity) and return the updated row for optimistic UI.
  - Expected impact: Big reduction in server CPU and perceived latency under active triage.
  - Risk: medium (stale-cache regressions — cover with tests).
  - Confidence: **Confirmed**.

- [ ] **Findings list computes all three status slices, clusters, and a full sort on every request**
  - Why: ~3× the filtering plus an extra full sort for data that is discarded.
  - Where: `src/app/(app)/findings/page.tsx:101-122` — `clusterFindings`, `prioritizeClusters`, then `byStatus("open"|"resolved"|"dismissed")` (each calls `orderFindingsForList` → full filter/sort) unconditionally; only one tab renders (`:231-263`).
  - Change: Compute only the active tab's slice plus one `countByStatus` pass for the tab labels/cluster count; skip `byStatus` for non-active tabs.
  - Expected impact: ~2–3× less compute on `/findings`, scaling with finding count.
  - Risk: low.
  - Confidence: **Confirmed**.

- [ ] **Finding detail reloads the full runtime and recomputes clusters + full queue ordering on every view**
  - Why: Opening/navigating findings (the highest-frequency triage action) costs work proportional to the entire project's finding set.
  - Where: `src/app/(app)/findings/[id]/page.tsx:99-102` (`getProjectRuntime` + `requireRemediationForFinding`), `:128-150` (`clusterFindings`, `prioritizeClusters`, `orderedFindingIdsForQueue` over all scoped findings) just to render "3 of 412" and prev/next; `src/components/findings/finding-queue-nav.tsx` `router.push`es per `j`/`k` keypress.
  - Change: Cache/env the ordered open-finding ID list (or cluster table) per project+filter, or compute neighbors with a bounded window query; prefetch adjacent findings.
  - Expected impact: Large TTFB reduction on the most navigated route.
  - Risk: medium (ordering/queue correctness).
  - Confidence: **Confirmed**.

- [ ] **Requirements page renders the entire preset (~100) as client-component islands, unpaginated**
  - Why: Hydration cost and DOM size are the main front-end risk on the second-heaviest route.
  - Where: `src/app/(app)/requirements/page.tsx:156-163` → `src/components/requirements/assessed-requirement-list.tsx:27-52` maps every control with no pagination/virtualization → `src/components/requirements/requirement-card.tsx:139-143` renders `RequirementRemediationActions` (client, `useActionState`, `Collapsible`, textareas) for each.
  - Change: URL-driven pagination/windowing by theme + status (pattern already exists via `PaginationNav` on findings/evidence), or render summary rows and lazy-mount the action island on interaction/intersection.
  - Expected impact: Lower INP/time-to-interactive and less hydration work on `/requirements`.
  - Risk: medium.
  - Confidence: **Confirmed** (no pagination in path). Measure first: React DevTools hydration timeline + Lighthouse.

- [ ] **No route/component code splitting; the `radix-ui` barrel and heavy conditional UI sit in the shared graph**
  - Why: The authenticated shell is on every app route; statically bundling rarely-used UI inflates every navigation.
  - Where:
    - **No `next/dynamic` anywhere** (`grep` finds zero dynamic/lazy imports in `src`).
    - `radix-ui` barrel imported in 11 `ui/*` modules (`src/components/ui/alert-dialog.tsx:4`, `avatar.tsx:4`, `badge.tsx:3`, `button.tsx:3`, `collapsible.tsx:3`, `dialog.tsx:4`, `dropdown-menu.tsx:4`, `label.tsx:4`, `separator.tsx:4`, `sheet.tsx:4`, `tooltip.tsx:4`) — the barrel eagerly pulls every primitive and is **not** in Next's default `optimizePackageImports`.
    - `GitHubRepoPicker` (381 lines + zod + `core/filters`) is statically imported into the global shell via `src/components/workspace-context.tsx:5,50` and `src/components/connect-project-panel.tsx:7`; the mobile `Sheet` (`src/components/app-shell.tsx:12-18,133-155`) ships on desktop too.
    - `next.config.ts:25-60` defines no `optimizePackageImports`/`experimental` block.
  - Change: (a) Add `experimental.optimizePackageImports: ["radix-ui"]` and/or switch to subpath imports (`radix-ui/dialog`). (b) `dynamic(() => import("@/components/github-repo-picker"), { ssr: false })` behind the existing open-state. (c) Dynamic-import the mobile `Sheet` subtree or use a CSS disclosure. (d) Dynamic-import `OrgDataLifecycle` inside the owner branch (`src/app/(app)/org/page.tsx:5,177`).
  - Expected impact: Meaningfully smaller shared JS across all app routes.
  - Risk: low–medium.
  - Confidence: **Confirmed** (import graph + no dynamic usage). Measure first: `npm run analyze` — count `@radix-ui/react-*` modules, and whether `github-repo-picker`/`zod`/`sheet` are in the shell chunk.

- [ ] **`zod` (64.5 KB gzip) reaches the client through shared modules**
  - Why: A schema library is in the client graph for small response parsing / URL helpers.
  - Where: `src/core/filters.ts:1` (`import { z } from "zod"`, schemas `:467-516`), `src/core/assessment-jobs.ts:1-38`; client consumers `src/components/github-repo-picker.tsx:17,29`, `src/components/dashboard/assessment-job-status-live.tsx:3-5`, `src/components/findings/findings-filter-bar.tsx:5-6`, `findings-bulk-list.tsx:10-13`, `finding-queue-nav.tsx:12`. Build evidence: `.next/static/chunks/1dr1jm0uhmg8d.js` = **284,859 B raw / 64,513 B gzip** begins with the zod runtime.
  - Change: Use `zod/mini`, hand-write the few small guards used client-side, or move validation server-side and share only types. Split pure client-safe helpers (href builders/param parsers) out of `core/filters` so importing them does not pull zod/`lifecycle`.
  - Expected impact: Remove a large chunk from dashboard/findings/picker bundles; reduces parse/execute on hydration.
  - Risk: low–medium.
  - Confidence: **Confirmed** (build chunk + imports).

- [ ] **`auth()` is called 3–4× per request and is not request-memoized**
  - Why: Repeated JWT/session work per request, multiplied by polling and navigation.
  - Where: `src/app/(app)/layout.tsx:16`, `src/server/workspace.ts:104` (inside cached `getWorkspace`), `src/components/connect-project-panel.tsx:30` (mounted globally), `src/app/(app)/org/page.tsx:36`, `src/server/actions/shared.ts:20`.
  - Change: Wrap the NextAuth `auth` in React `cache(...)` (or pass the session down from the layout) so one decode is shared per request.
  - Expected impact: Small CPU saving per request that compounds under polling/action-heavy use.
  - Risk: low.
  - Confidence: **Confirmed** (call sites). Measure first: timing wrapper around `auth()`.

- [ ] **Requirement status refresh is O(controls × findings) and re-scans the catalog per requirement**
  - Why: Write/assessment latency scales multiplicatively with findings history.
  - Where: `src/server/assessment-status.ts:211-216` (`findings.filter(... controlId ...)` inside the per-control loop `:315-325`), `:50-63` (`catalogControls().find(...)` per requirement); same pattern in `src/server/assessment.ts:243-264` and `src/server/assessment-findings.ts:194-215`.
  - Change: Group findings once into `Map<controlId, Finding[]>` (and a `Map<checkId, Control>` for the catalog) before the loops; reuse it for `refreshRequirementStatuses`, reconciliation, and assessment.
  - Expected impact: Order-of-magnitude faster full-scope refresh on large projects.
  - Risk: medium (status derivation must stay identical).
  - Confidence: **Confirmed**.

---

## P2 — Medium

- [ ] **`getProjectRuntime` over-fetches remediations and defeats React `cache` with an object literal**
  - Where: `packages/db/src/repo/remediations.ts:20-35` (two sequential queries: all finding IDs, then `inArray(remediations.findingId, findingIds)`), `src/server/project-runtime.ts:33-49`, caller `src/server/report.ts:121` passes `{ includeEvidence: false }` inline.
  - Problem: Remediation load is 2 round trips and its `IN` list grows with all historical findings; the fresh options object prevents request-cache dedupe against an equivalent call.
  - Change: Join remediations via `findings ON findings.project_id` in one query; change the option to a boolean/module constant for cache identity.
  - Expected impact: One fewer query per runtime load; avoids latent duplicate loads.
  - Risk: low.
  - Confidence: **Confirmed**.

- [ ] **Evidence page performs three scans of the same evidence slice and loads all requirements for link resolution**
  - Where: `src/app/(app)/evidence/page.tsx:69-81` — `countEvidenceForProject` (unfiltered), `countEvidenceForProject(kind)`, `countEvidenceKindsForProject`, plus `listRequirementsForProject` used only to resolve per-row links (`src/core/filters.ts:141-162`).
  - Change: Derive the unfiltered total from the group-by counts (skip the third scan); fetch only the control IDs referenced on the current page, or pass `Map<controlId, status>` built once.
  - Expected impact: Removes proportional-to-evidence scans and an unbounded requirements read.
  - Risk: low.
  - Confidence: **Confirmed**.

- [ ] **App layout blocks children streaming on the nav-attention count**
  - Where: `src/app/(app)/layout.tsx:10-27` awaits `navAttentionForProject` (and `WorkspaceContext`) before rendering `{children}`; no `<Suspense>` around them.
  - Change: Move the attention count (and context strip) into small async components wrapped in `<Suspense>` with a neutral fallback so the shell and page stream first.
  - Expected impact: Better TTFB/first paint and streaming on every app route.
  - Risk: low.
  - Confidence: **Confirmed** structure; measure route Server-Timing.

- [ ] **Idle worker issues writes to Postgres every poll (~5 s)**
  - Where: `scripts/run-assessment-worker.ts:42-46` (`while (!stopping) { runAssessmentJobBatch(1); maybePruneRateLimitBuckets(); sleep(pollMs) }`), `src/server/assessment-worker.ts:237-249` (prune on every idle tick), `src/server/assessment-jobs.ts:226-230` (`claimNextAssessmentJob` runs `recoverExpiredLeases` = 2 UPDATEs each call).
  - Change: Run lease recovery/prune on a wall-clock cadence (or only when a ready job exists), not on every idle claim.
  - Expected impact: Eliminates constant DB churn per idle worker; scales with worker pool size.
  - Risk: low.
  - Confidence: **Confirmed**.

- [ ] **Client-boundary hygiene: several server-capable modules are forced client / re-exported into server pages**
  - Where:
    - `src/components/ui/table.tsx:1` is `"use client"` with zero interactivity, used from server `src/components/org-members-card.tsx` — remove the directive.
    - `src/components/badges.tsx:1` is entirely client because `BadgeWithDescription` uses Tooltip; build chunk `.next/static/chunks/1n-901nyyuoa1.js` confirms Tooltip ships with badges. Split plain badges into a server module and isolate the tooltip badge.
    - `src/components/page-primitives.tsx:226` re-exports the client `CodeBlock` (which pulls `lucide-react` + `sonner`), imported by 19 modules including pages that never render code — delete the re-export; import `CodeBlock` directly in its 3 real users.
    - `src/app/layout.tsx:51-54` mounts `Toaster` (sonner) and Radix `TooltipProvider` on marketing routes. Scope them to `(app)` or lazy-mount.
  - Expected impact: Smaller client JS / less hydration on every route.
  - Risk: low.
  - Confidence: **Confirmed** (imports/build). Measure: `npm run analyze`.

- [ ] **List rows default-prefetch up to 25 dynamic finding-detail routes (each an expensive render)**
  - Where: `src/components/findings/findings-bulk-list.tsx:92-93` (`<Link href={findingDetailHref(...)}>` per row); `src/app/(app)/findings/[id]/loading.tsx` exists, which can trigger dynamic prefetch.
  - Problem: Potential burst of background RSC requests, each running the full finding-detail path (see P1 finding detail item).
  - Change: `prefetch={false}` on list-row links (keep prefetch on prev/next queue links); verify via a Network recording.
  - Expected impact: Removes N background heavy renders per list view.
  - Risk: low.
  - Confidence: **Measure first** — confirm RSC prefetch requests fire on `/findings`.

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

- [ ] **Duplicate finding fetch (`generateMetadata` + page) is not request-cached**
  - Where: `src/app/(app)/findings/[id]/page.tsx:64` and `:92` both call `requireFinding` → `getFindingById` (`src/server/workspace.ts:172-176`); unlike `getWorkspace`, it is not wrapped in `cache`.
  - Change: Wrap `requireFinding`/`requireRemediationForFinding` in React `cache`, or reuse the page's result.
  - Expected impact: Removes one identical `SELECT` per finding page render.
  - Risk: low.
  - Confidence: **Confirmed**.

- [ ] **`clusterFindings` copies bucket arrays on every insert and does linear control lookups; `FindingsBulkList` re-renders every row on selection**
  - Where: `src/core/lifecycle.ts:258-274` (`[...(map.get(k) ?? []), finding]` per insert), `:245-247`/`:337` (`controls.find` per finding/group); `src/components/findings/findings-bulk-list.tsx:136-160,256-267` (selection state at list root, unstable `toggle`, no `React.memo` on rows).
  - Change: Use `push` into existing buckets and a `Map<checkId|controlId, Control>`; for the list, `useCallback(toggle)`, `useMemo(approvableIds)` and `React.memo` rows.
  - Expected impact: Lower CPU on findings pages; list win modest at page size 25 but scales if the page size grows.
  - Risk: low.
  - Confidence: **Confirmed** (code).

---

## P3 — Low

- [ ] **Redundant index on the `assessment_snapshots` primary key**
  - Where: `packages/db/src/schema.ts:150-158` (PK on `assessment_id`) and `drizzle/0000_init.sql:81-82` (`assessment_snapshots_assessment_id_idx`, same column).
  - Change: Drop the duplicate index. Impact: one fewer index write per assessment. Risk: low. Confidence: **Confirmed**.

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

- [ ] **`claimNextAssessmentJob` reads the claimed row twice**
  - Where: `src/server/assessment-jobs.ts:235-258` (`SELECT … FOR UPDATE SKIP LOCKED` then a second `select().where(id = candidateId)`).
  - Change: `RETURNING *` on the claim/update, or run the update on the locked row. Impact: one round trip per claim (queue hot loop). Risk: low. Confidence: **Confirmed**.

- [ ] **`buildSuggestion` re-reads and re-parses the file for every new finding; snapshot hashing always runs**
  - Where: `src/server/assessment-findings.ts:109-126` (`fs.readFileSync` per finding, called `:295`), `src/server/monitor.ts:13-29` + `src/server/assessment.ts:184` (hashing all script files every assessment).
  - Change: Memoize file text per `(rootPath, path)` for the run; skip/short-circuit hashing when HEAD is unchanged (see P0 clone item).
  - Impact: Fewer syscalls/OOM pressure on finding-heavy runs. Risk: low. Confidence: **Confirmed**.

---

## Biggest Performance Wins

Ranked by expected real-world impact for this product:

1. **Stop shipping the Sentry browser SDK unconditionally** — ~133 KB gzip on every route today; gate on `NEXT_PUBLIC_SENTRY_DSN` (`src/instrumentation-client.ts`, `src/sentry/init.ts`).
2. **Bound the findings read path** — stop loading all historical findings on every page; push pagination into SQL and add retention (`packages/db/src/repo/findings.ts:20-29`, `src/app/(app)/findings/page.tsx:120-122`).
3. **Make assessments cheaper** — cache the repo checkout, short-circuit unchanged HEAD, single-pass AST traversal, de-duplicate axe/target-size/focus probes (`src/server/repo-checkout.ts`, `packages/analysis-core/src/scan.ts`, `runtime/scan.ts`, `custom-checks/`).
4. **Fix the assessment-job polling** — auth-only route, pause when hidden, in-flight guard, scoped refresh (`src/app/api/projects/[projectId]/assessment-jobs/route.ts`, `assessment-job-status-live.tsx`).
5. **Ship the missing indexes in one migration** — especially `evidence(finding_id)`, `assessments` latest-ordering expression, `alerts` unread, and the standalone `lower()` indexes.
6. **Cache DNS per host in the Playwright route interceptor** — removes a per-subresource latency tax from every runtime audit (`runtime/scan.ts:165-187`, `url-safety.ts`).
7. **Kill whole-app revalidation** — replace `revalidatePath("/", "layout")` with scoped/tag revalidation plus optimistic rows (`src/server/actions/shared.ts:26-28`).
8. **Code-split the shell and dedupe heavy shared deps** — dynamic-import the repo picker/mobile sheet, subpath or optimize `radix-ui`, and keep `zod` out of the client (`next.config.ts`, `src/components/workspace-context.tsx`, `src/core/filters.ts`).
9. **Make requirements render bounded** — paginate/window the ~100 client cards (`src/components/requirements/assessed-requirement-list.tsx`).
10. **De-duplicate page computation** — compute only the active findings tab, cache `requireFinding`, and stream the layout around nav-attention (`src/app/(app)/findings/page.tsx`, `findings/[id]/page.tsx`, `(app)/layout.tsx`).

---

## Measurement plan

Before/after each change, capture:

- **Bundle:** `npm run analyze` (`next experimental-analyze --output`). Current baseline from `.next/`: shared root main ≈ **206 KB gzip**, of which Sentry ≈ **132.6 KB gzip**; zod chunk ≈ **64.5 KB gzip**.
- **Server/pages:** RSC payload size + Server-Timing on `/findings`, `/findings/[id]`, `/requirements`, `/dashboard` with a seeded project of several thousand findings.
- **DB:** `EXPLAIN (ANALYZE, BUFFERS)` for the queries above; `pg_stat_statements` for the worker idle-poll writes; pool wait/`pg_stat_activity` under concurrent export + page load (pool `max = 3`, `packages/db/src/postgres.ts:189`).
- **Worker:** `node --cpu-prof` of `runAssessment` on a large fixture; count `forEachChild`, `axe.run`, `keyboard.press`, `readFileSync`/`stat`, and clones per job; `detectChanges`/`scanProject`/`scanRuntime` `performance.mark`s.
- **Client runtime:** React DevTools Profiler first-load hydration + checkbox toggle on `/findings`; Lighthouse "reduce unused JavaScript" and TTI on `/` and `/dashboard`.
