# Architecture

**Orientation:** [`AGENTS.md`](../../AGENTS.md) (commands, graft). **Product scope:**
[`compliance-engineering-product-spec.md`](../compliance-engineering-product-spec.md).
**Enforceable rules:** [`.cursor/rules/`](../../.cursor/rules/).

> **TL;DR** — Next.js app + Postgres. Analysis is deterministic (AST + optional
> Playwright/axe); AI is advisory only. Assessments are durable queued jobs run
> by a GitHub Actions worker. Evidence is append-only. Writes go through
> `with*Write` helpers with per-project locks; actions never call `getDrizzle()`
> directly.

## Modules

| Piece    | Location                               | Role                                                                                       |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Contract | `packages/analysis-core/src/contract/` | Shared types: statuses, findings, org/project/requirement types, job enums, entities       |
| Analysis | `packages/analysis-core/src/`          | AST checks + optional runtime audits                                                       |
| Catalog  | `packages/analysis-core/src/catalog/`  | RGAA/WCAG reference data (not a ports/adapters layer)                                      |
| DB       | `packages/db/src/`                     | Drizzle schema, `repo/`, workspace-load, `WorkspaceSlice`                                  |
| App core | `src/core/`                            | Shared kernel: `rbac`, `datetime`, `assessment/`, `findings/`, `requirements/`, `actions/` |
| AI       | `src/ai/`                              | Explain / remediate — never sets status; never imports `@/server`                          |
| Server   | `src/server/`                          | `assessment/`, `github/`, `workspace/`, `reporting/` + `actions/` mutation edge            |
| App      | `src/app/`                             | Next.js UI + API                                                                           |

Details per folder:

- **Contract** persists `Finding, Remediation, Assessment, Evidence, Alert`
  (`entities.ts`).
- **App core** holds the job vocabulary and guards (`assessment/`), finding
  clustering/scoring and finding-page beats (`findings/`), the remediation
  lifecycle (`requirements/remediation-lifecycle.ts`), and client-safe
  action-state + zod validation (`actions/`).
- **DB** imports entity _types_ from the contract for the slice shape only —
  no entity re-exports.
- **AI** takes contract types in, returns results or throws `PublicError`,
  and reports failures only via an injected `onError` hook.

**Dependency rules** (enforced by ESLint):

- `src/core` imports only `contract/*` — never the catalog, db, or analysis
  beyond the contract.
- Direction: `contract → { db, catalog, app }`.
- Integration is direct: pages/actions call `src/server`, which calls
  `packages/db` and analysis-core.
- `src/ai` depends only on the contract (plus its own gateway/fs helpers);
  `src/server` depends on `src/ai`.
- Remediation legality lives in `src/core/requirements/remediation-lifecycle.ts`.
- The finding-page beat model (`src/core/findings/finding-act.ts`) is UI policy
  and must not be imported by `src/server/assessment/`.

Workspace packages export `src/*.ts`. Next transpiles them; `dist/` is
publish-only.

**Runtime topology:**

- **Connectors:** GitHub only. **State:** Postgres (`DATABASE_URL`).
- Evidence is append-only. Tokens are AES-256-GCM at rest.
- Server-owned env keys live in `src/server/env.ts` (lazy getters — never
  module constants); `AUTH_*` stays with auth/middleware/token crypto,
  framework keys stay direct.
- Manual and webhook assessments are durable jobs: enqueue →
  `repository_dispatch` kicks the GitHub Actions `assessment-worker`
  (Playwright Chromium, same family as local dev) → 15-min schedule backstop
  for failed dispatches, killed tasks, and expired leases. Dev/e2e drain inline.

```
Manual run (dashboard action enqueues + after() dispatch) → assessment-worker (GH) → claim → scan → persist
Webhook (enqueue + after() dispatch) → assessment-worker (GH); 15-min schedule covers orphans/expired leases
                                           ↓ (clone → scan → persist)
                           Core + contract → Catalog / Analysis / AI
                                           ↓
                           isomorphic-git checkout (ephemeral, no git CLI)
```

## Dependency notes

- **Auth — `next-auth@5.0.0-beta.32` (exact pin).** Auth.js v5 has no stable
  release upstream (`dist-tags.latest` is still v4; `beta` is the v5 line), so
  the pin _is_ the latest v5. Re-evaluate when v5 ships stable; a move to
  Better Auth is a deliberate auth/RBAC migration, not routine maintenance.
  GitHub token refresh is serialized per user (advisory lock + re-read inside
  it): GitHub rotates refresh tokens, so concurrent refreshes would read as
  revoked.
- **`reactCompiler: true`** is a stable Next 16 option, backed by the stable
  `babel-plugin-react-compiler` devDependency. The
  `experimental.turbopackRustReactCompiler` flag was removed: the Rust
  implementation is a build-speed experiment with upgrade risk, and the stable
  path keeps the build green.

## Domains and standards

**Direction, not current behavior.** The code implements Accessibility only.
Model, phasing and open decisions: [`platform-direction.md`](./platform-direction.md).

| Concern                                            | Shared platform | Domain-specific                                                    |
| -------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| Tenancy, RBAC, project                             | ✅              | —                                                                  |
| Requirement + status derivation                    | ✅              | —                                                                  |
| Finding / Remediation lifecycle, Evidence, Alerts  | ✅              | —                                                                  |
| Job queue, lease, worker, write model, locks       | ✅              | —                                                                  |
| Catalog mechanism (`Framework`/`Control`/`Preset`) | ✅              | controls, guidance, themes, presets per standard                   |
| Engines                                            | —               | AST/axe/jsx-a11y (a11y); measurement engine (eco, perf)            |
| Verification strategy                              | —               | source merge (a11y AST), re-audit (a11y runtime), re-measure (eco) |

Domain is a field on `Framework` (`accessibility | eco_design | performance | security`);
there is no plugin interface and no per-domain schema.

| Standard                             | Class                                                         | Domain        | Note                                               |
| ------------------------------------ | ------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| RGAA 4                               | legal/regulatory reference (France)                           | accessibility | shipped catalog                                    |
| WCAG 2.2                             | technical standard                                            | accessibility | shipped as cross-references + presets              |
| RGESN 2024                           | official French reference framework (Arcep/Arcom, under REEN) | eco_design    | planned; Licence Ouverte 2.0, attribution required |
| EcoIndex                             | optional metric / scoring methodology (CC BY-NC-ND)           | eco_design    | off by default; never the scoring core             |
| Core Web Vitals, performance budgets | measurement framework / optional metrics                      | performance   | planned; lab metrics before field data             |
| Headers, TLS, dependency checks      | technical good practice (not regulatory here)                 | security      | planned, passive only                              |

## Assessment mapping

Chain per domain. `exists` = shipped, `evolves` = shipped but domain-blind today,
`new` = not built.

| Stage             | Accessibility today                                                                                       | Eco-design target                                                       | Status               |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| Scope             | `presetById` → `scopedControlIds`, undefined ⇒ whole catalog (`src/server/workspace/project-scope.ts:19`) | union of enabled presets, one per domain                                | evolves (Phase 0)    |
| Assessment        | `runAssessment` (`src/server/assessment/assessment.ts`), checkout + AST + optional runtime                | `runMeasurement`, no checkout, routes + conditions                      | new (Phase 2)        |
| Latest assessment | `latestAssessmentFor(assessments, projectId)` (`src/core/assessment/assessment-helpers.ts:12`)            | same with `domain`                                                      | evolves (Phase 0)    |
| Finding           | `checkId` union, analyzers `ast \| runtime`, location `source \| dom \| site`                             | `measurement` engine, location `page` (url, metric, observed)           | new (Phase 3)        |
| Authority         | `CheckAuthority` (`manual \| standard \| runtime_only \| heuristic \| site_level`)                        | `measured` — passes only if every configured route was measured cleanly | new (Phase 3)        |
| Verification      | patch → PR → merge → re-assess; runtime re-audit                                                          | re-measure same route + conditions                                      | new (Phase 3)        |
| Evidence          | append-only `evidence`, frozen kinds, `detail.event` discriminants                                        | same writers, `measurement_recorded` detail                             | evolves              |
| Monitoring        | push → enqueue → scan, alerts on requirement regression                                                   | metric series + baseline + noise band                                   | new (Phases 2, 4, 5) |

## Architecture gaps

| #   | Gap                                                                    | Evidence                                             | Resolved by   |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| B1  | No preset ⇒ whole catalog                                              | `project-scope.ts:19-27`                             | Phase 0       |
| B2  | One preset per project                                                 | `Project.defaultPresetId`                            | Phase 0       |
| B3  | Catalog assumes RGAA/WCAG (required `secondaryCode`, hardcoded themes) | `catalog/control-theme.ts`, `catalog.ts`             | Phase 0       |
| B4  | `latestAssessmentFor` is domain-blind                                  | `assessment-helpers.ts:12`, dashboard/settings views | Phase 0       |
| B5  | `Assessment` is AST-shaped (`filesScanned`, `snapshot`, `engines.ast`) | `contract/entities.ts`                               | Phase 0 / 2   |
| B6  | Every job clones the repo; a11y-named stages                           | `assessment-worker.ts`, `ASSESSMENT_JOB_STAGES`      | Phase 2       |
| B7  | Finding vocabulary is a11y-closed, engine check `ast \| runtime`       | `schema.ts:232`                                      | Phase 3       |
| B8  | No "measured" authority                                                | `contract/requirement-status.ts`                     | Phase 3       |
| B9  | No measurement/page-identity store                                     | —                                                    | Phase 2       |
| B10 | CI/PR integration contradicts a recorded decision                      | "no per-PR Check Runs" below                         | D-CI approval |

## Persistence

- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`). Roles
  `owner|admin|member|viewer`. Workspace load is membership-org + active
  project. RBAC stays in the app kernel — never move the permission matrix
  into analysis-core.
- **Reads** — `getWorkspace()` loads **tenancy only** (orgs, memberships,
  projects, active project). Compliance rows load via
  `getProjectRuntime(projectId)` or repo `list*`/`get*` helpers. The compliance
  catalog is compile-time data (`shippedCatalog()`). File hashes live in
  `assessment_snapshots` and load for the assessment scan
  (`scanAssessment`). Evidence and
  findings pages load via `src/server/reporting/evidence-queries.ts` and
  `src/server/workspace/findings-view.ts` (`loadFindingsView`). The org
  portfolio (`/projects`) is the one cross-project read: `loadPortfolioView`
  plus `repo/portfolio.ts`, one grouped query per metric over the org's visible
  project ids — never a runtime load per project.
- **Writes (the write model)** — all mutations go through helpers in
  `src/server/workspace/workspace-write.ts` (`withProjectTx` /
  `withOrgWrite` / `withConnectWrite`) with locking in
  `src/server/workspace/db.ts` (`withProjectLock`). The permission matrix lives
  in `src/server/workspace/project-visibility.ts` (`assertProjectPermission`
  over the project's org memberships) so the write layer never imports from the
  action edge.
  - Project **compliance** mutations (findings, remediations, requirements,
    evidence) → `withProjectTx(projectId, permission, fn)`: authorize, take the
    project lock, open one transaction, and let the callback call the explicit
    repo functions for the rows it touches (`upsertFindings`,
    `upsertRemediations`, `upsertRequirements`, `insertEvidence`,
    `updateProject`). No project-wide load, snapshot or diff: a click costs what
    it touches, not the project's history.
  - Requirement status after a write is re-derived by
    `refreshRequirementsForControls(tx, project, controlIds, options)`
    (`src/server/assessment/assessment-status.ts`): it loads only those
    controls' requirement rows and **open findings**, reuses the pure
    `refreshRequirementStatuses`, and returns the changed rows to write.
  - Tenancy/org/connect mutations → `withOrgWrite` / `withConnectWrite`.
  - Actions never call `getDrizzle()` (ESLint).
  - Single-row alert touches use the `requireAlertAccess` /
    `requireProjectAccess` read guards (`src/server/workspace/workspace.ts`)
    plus `withProjectLock`. Org export reads via `loadOrgExportData`
    (`src/server/workspace/orgs.ts`); PR evidence reads via the reporting loader.
  - Connection acquisition lives in `workspace/*`, `project-runtime.ts`,
    reporting loaders, and job/infra paths. SQL lives in `packages/db/repo/*`
    (rate-limit buckets, GitHub tokens, webhook deliveries each have a repo
    module — server files keep only policy/cryptography).
  - Org writes return `{ result, insertOrgs, upsertMemberships,
deleteMembershipIds, deleteOrgIds }` — explicit rows, no in-memory slice diff.
  - Connect/disconnect uses `withConnectWrite` (tenancy load, org lock, no
    project lock — there may be no active project yet) and returns
    `{ result, insertProjects, deleteProjectIds, evidence }`. The validation
    clone (`assertGitHubRepoAssessable`) runs **before** the write lock: a
    checkout takes minutes and must not pin a pool connection.
  - Structural entities go through `repo/*`. An assessment runs in two phases:
    `scanAssessment` (pure: reads the checkout, returns raw findings + snapshot,
    touches no rows) then `reconcileAssessment` (folds the scan into project
    rows and builds the record + evidence). `runAssessment` composes both for
    callers that already hold the rows; the worker scans once and lets
    `applyAuthoritativeAssessment` reconcile on rows it loads **inside** the
    apply transaction, under the project lock — so a scan that takes minutes
    cannot reconcile a stale slice.
  - Stale writes are prevented by the lock, not by `updatedAt` comparison:
    every writer of a project's findings, remediations, requirements or alerts
    holds `project-write:{projectId}`, and interactive writes read the rows
    they mutate _inside_ that transaction — so a concurrent human decision
    cannot be reverted by a stale copy. Assessment apply reconciles against the
    rows it loads under the lock too (`applyAssessmentPayload` with a
    `baseline`), skipping unchanged rows only to avoid churning `updatedAt`.
  - Project-scoped filtering is shared via `projectScopedSlice` (assessment
    scratch clones).
- **Locks** — job claim `FOR UPDATE SKIP LOCKED`. Interactive project writes
  and apply take `project-write:{projectId}`; org and connect writes take the
  user-scoped org lock.
  - Serial-per-project is enforced by the database, not just the claim query:
    the partial unique index `assessment_jobs_running_project_uidx`
    (`project_id` where `running`, `drizzle/0000_init`) rejects a second
    concurrent claim (23505 → claim returns null).
  - Corrupt job payloads terminal-fail at claim time instead of scanning.
  - Scan authority is explicit (`resolveJobAuthoritative`: manual, or webhook
    push without a PR SHA).
  - Project `updatedAt` on findings/remediations/requirements is still stamped
    on every write (`repo/upsert-guard.ts`), but it is no longer a stale-write
    guard: the per-project lock serialises writers and each write reads its
    target row inside its own transaction.
- **Latest assessment** — `latestAssessmentFor` compares `completedAt`.
  Do not use `.at(-1)` (loaders return newest-first).
- **Typed query columns** — JSONB `payload` stays the source of truth for the
  entity; fields SQL filters or orders on are projected onto typed columns by
  `repo/mappers.ts` (the only writers, same rule as `severity_rank`/`engine`):
  `findings.detected_at` (`findings_open_detected_idx`, partial on `open`),
  `assessments.started_at`/`completed_at`
  (`assessments_project_completed_at_idx`), plus a `pg_trgm` GIN index on
  `evidence.summary` for the free-text filter. Never compare or order these as
  `payload->>'…'` text: that only sorted correctly for UTC `Z` strings.
  `drizzle/0006_typed_query_columns.sql` backfilled them; columns stay nullable
  so an unparseable legacy value cannot abort a production migration.
- **Read bounding** — findings list order is severity-first
  (`findings.severity_rank`, `ORDER BY severity_rank, id`; same order in SQL
  and the JS fallback).
  - The list paginates in SQL for every filter except free-text search
    (status/severity/rule/engine/remediation all have columns or an `EXISTS`
    clause); search takes the bounded status-scoped load.
  - Status-scoped page loads cap at `FINDINGS_LIST_LOAD_LIMIT` (most severe
    first; counts stay exact via SQL, truncation is flagged, never silent).
    Writes/reports/exports load full history.
  - Dashboard loads only the six findings its activity card renders
    (`findingsLimit: 6`) and skips remediation rows; requirements and settings
    load no finding/remediation rows at all (`findingStatuses: []`,
    `includeRemediations: false`) — their badges/counts come from SQL.
  - Evidence exports cap per project (`EVIDENCE_EXPORT_LIMIT`, newest first,
    flagged); per-finding reads cap at `FINDING_EVIDENCE_LIMIT`.
- **Retention/erasure** — evidence is append-only (trigger) with one gated
  exception: org deletion erases tenant evidence via `deleteEvidenceForOrg`
  (transaction-scoped `complyloop.allow_evidence_erase` flag). Project
  disconnect keeps retention.
  - Pipeline bookkeeping is pruned on the worker tick by
    `repo/retention.ts` (`prunePipelineRetention`): terminal
    (`succeeded`/`failed`/`cancelled`) `assessment_jobs` older than 30 days,
    then the oldest `assessments` beyond the newest 30 per project (ranked per
    project, not globally), plus abandoned never-completed rows. Snapshots
    cascade with their assessment. An assessment still referenced by a finding
    is never deleted (`findings.assessment_id` is `ON DELETE CASCADE`, so
    pruning it would erase the finding and its remediation history), and the
    newest full file-hash snapshot per project is kept so change detection
    never loses its fallback map — the FK stays `CASCADE` and retention simply
    keeps those rows.
  - `ops:check` measures `assessment_jobs`/`assessments`/
    `assessment_snapshots` (`OPS_MAX_PIPELINE_TABLE_MB`, default 512 MiB) so a
    stopped retention pass fails the check instead of growing silently.
  - Snapshots dedup identical hash maps (`hashes_unchanged`, reader fallback).
  - `webhook_deliveries` prunes to 10k per batch tick.
  - Patch evidence keeps full edit texts — they are load-bearing for
    `applyFileEdits` PR apply; identical candidates dedup on write instead.
- **Verification loop** — every finding type reaches `verified`: source via
  PR merge + re-assessment auto-verify; runtime/site via on-demand re-audit
  (works on open and resolved findings, re-opens on re-detection) or manual
  attestation with a required note (`remediation_manually_verified`).
  An inconclusive re-audit (timeout, preview down, zero pages) records a
  failed-verification evidence row only: it never re-opens the finding or
  derives a requirement status. The finding-page beat follows the remediation
  status, never the finding.
- **Webhooks** — same repo may be connected in several orgs: deliveries
  resolve via `findProjectsByGithubFullName` (all matches, id order) pinned
  by installation id; ambiguous or foreign-installation deliveries are
  rejected, never run against an arbitrary row.
- **Migrations** — `scripts/vercel-build.mjs` applies `drizzle/*.sql` on
  production deploys only (`VERCEL_ENV=production` or unset). Preview and
  development builds skip `db:migrate`: a preview pointed at a shared/staging
  `DATABASE_URL` must never apply unreviewed SQL before review. Previews should
  use an isolated database (`DATABASE_URL` scoped per Vercel environment), not
  the production branch's.
- **Validation** — shared zod primitives (`entityIdSchema`,
  `requiredField`, `parseForm` / `parseInput` / `parseEntityId`) live in
  `src/core/actions/validate.ts`; action- and route-specific schemas stay next to
  their actions/handlers. No separate validation layer.
- **Persistence API** — concrete `packages/db/repo` functions are the API.
  No abstract repositories, interfaces-per-table, or DI containers: expensive
  edges are injected explicitly via function params (`runAssessment`
  options), everything else is a direct import.
- **Jobs** — 30-min lease (renewed by a 5-min heartbeat while a scan runs),
  3 attempts, serial per project, cancellable (`queued`/`running` →
  `cancelled`, project-scoped; a cancelled mid-run run saves nothing).
  Two triggers, one queued topology, one job model:
  - **Manual** — `runAssessmentAction` enqueues (`queued`, `attempts: 0`)
    and schedules the drain in `after()`. The click resolves fast with
    "queued" copy; progress lives in the Pipeline section (polls every 3s,
    refreshes on completion). A second click while a scan is live is refused;
    a click while a job is queued-due re-kicks the worker without enqueuing
    a duplicate — claims are serial per project.
  - **Webhook (queued)** — enqueue then `after()` dispatch of the GH worker;
    its 15-min schedule is the backstop for failed dispatches, killed tasks,
    and expired leases. Dev/e2e drain the queue inline. Expired rate-limit
    buckets prune once per batch.
- **Checkouts** — shallow ephemeral checkout per job via pure-JS git
  (isomorphic-git, no `git` CLI); deleted after. Worker-only: request handlers
  read the one source file they need through the contents API
  (`withProjectFileWorkspace`, `src/server/assessment/single-file-source.ts`).
  Fix PRs never clone at all: `commitFixBranch`
  (`src/server/github/fix-branch.ts`) writes blob → tree → commit → ref through
  the Git Data API from the verified `candidate.edits`, re-checking each
  `oldText` against the base commit so a stale patch fails closed. Connecting a
  repo requires write access on the **user's** token (`permissions.push`
  /`admin`), and `commitFixBranch` re-checks the installation's permission
  before writing, so a read-only collaborator cannot have the App open branches
  for them. The executor
  uses its locally installed Playwright browser. See
  [`vercel.md`](../vercel.md).

## Analysis

Three deterministic engines. AI is separate and never authoritative.
Stage entries and leaf rules: `packages/analysis-core/README.md`.

- **AST** (`checks/` + jsx-a11y) — custom checks over source. Full check-id
  list in `CHECK_REGISTRY` (`packages/analysis-core/src/check-registry.ts`).
  Safe auto-fixes and verified AI patches target AST findings.
- **Runtime** (when `runtimeBaseUrl` is set) — Playwright + axe from disk.
  Navigate with `domcontentloaded` + settle, not `networkidle`. Never add
  `@axe-core/playwright`. Never import `ssrf-guard/node` in app code.
  `linkinator`, `playwright`, `axe-core`, `html-validate` are server
  externals in `next.config.ts`.

Engine containment: a throwing custom probe is recorded on
`probeFailures` and the rest of the pass continues. html-validate
failures are non-fatal. A per-page failure (axe crash, navigation, …)
is contained to that page (`pageFailures`) and sibling pages continue;
only a total outage (zero pages) fails the sub-scan.

**Partial coverage is not authority.** Findings from rendered pages are still
reported and those routes may resolve their own findings, but a run with any
`pageFailures` is not authoritative: runtime-only/site-level requirements stay
`unable_to_verify`, applicability is not confirmed, and AST findings are not
dropped by the merge (`runtimeCoverage` stays `null`, the same fail-closed path
as unknown coverage). A route that failed never resolves a finding recorded
against it, and an untied run never resolves by pathname alone — the audited
origin must match.

**Custom-probe rules** (`runtime/custom-checks/`): keep a probe only if it
measures one deterministic fact on an unmodified page. Probes that inject CSS,
emulate zoom or forced colors, submit forms, or compare text lengths were
retired (`resize-text`, `forced-colors`, `label-adjacent`, `css-hover-keyboard`,
`css-disabled-content`, and the AAA focus checks); their controls are manual
review (`checkId: null`). Inference probes are `advisory` (warnings, never
failures). Probes that submit forms run behind `withBlockedWrites`
(`block-writes.ts`): in-page, non-read `fetch`/XHR/beacon fail and native form
navigation is cancelled — never a Playwright route, which raced the scan's own
context route and killed the worker. The focus walk covers the whole tab order
(identity = tab-order position, not tag + class) and `focus-not-obscured` fails
only when the control is entirely covered.

**Web bundle:** nothing a Vercel page imports may reference `axe-core` (or the
other worker-only engines) by a literal specifier: Turbopack turns it into an
external module evaluated at load, and `next.config.ts` keeps those packages
out of web functions, so the page 500s (`Failed to load external module
axe-core-…`). `resolveAxeMinJsPath` resolves through a bound reference for this
reason.

**html-validate** — structural HTML for RGAA 8.2 / 10.1 only
(`markup-nesting`, `css-for-presentation`). Those stay `unable_to_verify`
until `htmlValidateRan`. Duplicate ids stay on axe + AST.

**Tracked branch:** `Project.github.trackedBranch` (optional, JSONB, no migration)
overrides the default branch as the project's truth: `webhook.ts` accepts only
pushes/deployments of `effectiveBranch()`, manual runs check it out
(`refForProjectCheckout`), and fix PRs target it. Set via `updateTrackedBranchAction`
(verified against GitHub first).

**Commit tying:** a runtime audit is _tied_ only when it hit a deployment whose
SHA equals the scanned checkout's `HEAD`. `deployment_status` (success; the deployment ref is the default branch or the
commit SHA itself, as Vercel sends it; and the SHA must be the newest pushed
commit) enqueues a job whose `runtimeTarget` carries
the deployment URL + SHA; the audited SHA and `runtimeTied` are recorded on
`Assessment.engines`. An untied run (static `runtimeBaseUrl`, or a SHA
mismatch) still reports its violations but does not supersede AST findings,
resolve runtime findings, or pass runtime-only/site-level requirements.

**Merge:** when a tied runtime audit ran, drop composition-sensitive / runtime-only /
package-twin AST findings (`merge-findings.ts`) **scoped to the pages the audit
actually rendered** (`runtime-coverage.ts` maps `scannedRoutes` → page files).
When the audit covered every discovered page the drop is repo-wide; when it
covered a subset, only covered page files are dropped and AST findings on
unrendered pages survive (a false `passed` is worse than a duplicate). Unknown
coverage (no discoverable page files) keeps AST findings. Dedupe priority:
axe > html-validate > playwright-custom > site-level > linkinator > ast > jsx-a11y.

### Check authority (`check-authority.ts`)

| Class                 | Behavior                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Runtime-only          | `unable_to_verify` until page audit — never `passed` from empty AST |
| Composition-sensitive | AST in CI; runtime findings replace AST when both run               |
| Heuristic AST         | Empty scan → `unable_to_verify`, not `passed`                       |
| Site-level            | Needs `runtimeRan` + ≥2 preview routes                              |
| Standard              | Empty AST scan → `passed`                                           |

Precedence: site_level → runtime_only → heuristic → standard.
Composition-sensitive uses `standard` authority; runtime override is merge,
not a separate class. Do not duplicate id lists in docs — the source is
`check-authority.ts` + `checks/registry.ts`.

**Adding a check id:** `CHECK_IDS` → registry or jsx-a11y map → authority
list → runtime map if needed → catalog `checkId` → `guidance.ts`. Tests:
`check-authority.test.ts`, `catalog-coverage.test.ts`.

### Status derivation (`contract/requirement-status.ts`)

1. Sticky human decisions (held until cleared; temp exceptions expire via
   `clearExpiredExceptions`; an open violation detected after the decision
   re-arms it — the decision is revoked with evidence and status re-derives).
2. Open findings → `failed` / `needs_review`.
3. Applicability (runtime absence) → `not_applicable`.
4. Authority gates → `unable_to_verify` or `passed`.

Manual controls (`checkId: null`) stay `unable_to_verify` until a human
pass or exception.

Assessments always use the project's `defaultPresetId`. Requirements page
`?presetId=` is browse-only.

## Key flows

**Assessment:** manual runs enqueue in the dashboard action and kick the GH
worker via dispatch (backstop: 15-min schedule); webhook runs go
enqueue → dispatch, 15-min schedule backstop (see Jobs above). Either way the
worker clones + scans:

1. `detectChanges` (depth-1 clone: author is HEAD)
2. AST → optional Playwright → merge
3. Re-derive statuses → `verifyRemediationOnResolve` (uses the run's re-scan
   proof, not historical evidence)

Only a **default-branch** scan (or a manual assessment) is authoritative: it
persists findings/statuses and may auto-verify. Anything else (legacy
non-push rows still draining) runs the same analysis but persists nothing
and never resolves findings, flips statuses, or auto-verifies. There is no
per-PR scan: PR feedback arrives via the merge-push scan.

**Decision (permanent, Sep 2026): no per-PR Check Runs.** PR preview scans
and the GitHub Checks surface were built, shipped (`a45401c`), then removed
deliberately (`6644864`) and the PR webhook path deleted with them
(`webhook.ts` handles `push` only). This is a product decision, not drift:
pre-merge feedback is out of scope, and the merge-push scan plus the
dashboard own the loop. Do not re-propose Check Runs, PR deltas, changed-line
annotations, PR summary comments, `check_run` handling, or PR-scoped scans
without a new product decision that explicitly reverses this one. The
`Checks R/W` App permission was unused; it is no longer listed as required
(`README.md` / `.env.example`) — remove it from the App registration the next
time App permissions are touched.

**Oct 2026 — pending, not reversed.** The product direction plans CI/PR
integration as Phase 6 ([`platform-direction.md`](./platform-direction.md#5-cicd-gated)).
That does **not** override this decision: Phase 6 stays blocked until the
owner records **D-CI** in that document. Until then, do not add
`pull_request` handling, Check Runs, PR comments or PR-scoped scans.

**Remediation:**

- Source: patch → ComplyLoop → draft PR → merge → re-assess → `verified`. The
  draft PR is committed through the Git Data API (`preparePullRequest` →
  `commitFixBranch`), never a checkout; patch generation reads only the
  Finding's file through the contents API.
- Runtime: guidance → approve → implement → re-audit.
- Verify fails closed on HTTP errors, redirects away from the finding URL, or
  an empty document.
- Site-level findings re-run the site audit; source findings are not verified
  by applying a local patch.
- A successful runtime verify forwards `runtimeRan` (and site-level /
  html-validate flags when those engines ran) so the requirement can close.
- Runtime/DOM/site findings are never resolved unless `runtimeRan`.

**Monitoring:** webhook enqueues only (`idempotency_key` from delivery id).
Only pushes to the project's **live** default branch
(`repository.default_branch`, persisted onto `project.github.defaultBranch`
when it changes) are enqueued as authoritative assessments; feature-branch
pushes and PR events are ignored. Failures become
`assessment_job_failed` evidence.

**Reports:** `report-model.ts` + markdown/HTML renderers; routes load via `loadReportInput` in `report.ts`.

## Rendering and data access

- **Server boundary** — `src/server/*` (and `packages/db/src/postgres.ts`)
  carry `import "server-only"` so a client import fails at build time.
  Client-safe shared types live in `*.types.ts` /
  `@/server/github/github-types` and `@complyloop/db/repo/*` (type-only).
  `src/server/actions/*` (`"use server"`) stay unfenced because clients
  invoke them.
- **Reads** — pages compose two cached reads (`getWorkspace` for tenancy,
  `getProjectRuntime` for compliance rows; `loadActiveProjectPage` where caps
  are needed) plus the reporting loaders (`loadFindingsView`,
  `evidence-queries`, `nav-attention`).
  - Pages never open Drizzle or import `@complyloop/db/repo/*` directly
    (except the health probe).
  - Sanctioned extra reads: `requireProjectAccess`, `requireAlertAccess`,
    `loadProjectDb`.
  - In-write slice lookups (`findingById`, `remediationForFinding`) are for
    `with*Write` callbacks only — page previews use `requireFinding` /
    `requireRemediationForFinding`.
- **Caching** — authenticated `(app)` pages rely on dynamic-from-usage
  (`getWorkspace` reads `auth()`/`cookies()`; list pages also await
  `searchParams`) plus targeted `revalidatePath` on mutation
  (`src/server/actions/shared.ts`). No blanket `force-dynamic` anywhere:
  pages are dynamic from usage, and Route Handlers are dynamic by default —
  no handler needs the config export.
- **Mutations vs routes** — mutations go through Server Actions. Route
  Handlers exist only for webhooks, polling/streaming (`assessment-jobs`,
  picker typeahead), auth, and health. The jobs poll returns a whitelisted DTO
  (`publicAssessmentJobView`): preview URLs in `payload.runtimeTarget`, refs and
  idempotency keys never leave the server, and the error is redacted.
- **Providers** — `ThemeProvider` + `TooltipProvider` + `Toaster` stay in
  the root layout (theme needs the HTML shell to avoid FOUC).

## Invariants

- Evidence append-only; decisions keep history. Enforced by convention: writes
  go through `insertEvidence` (`packages/db/src/repo/evidence.ts`) — there is
  no update/delete helper for evidence rows.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check. Status derivation order (sticky
  human decisions → findings → applicability → authority gates) is the source
  of truth in `packages/analysis-core/src/contract/requirement-status.ts`; AI
  (`src/ai/`) is advisory only and never writes statuses.
- Webhook assessments idempotent via job `idempotencyKey`.
- Request handlers never clone a repository. Assessments run on the worker;
  patch generation reads one file and fix PRs write through the Git Data API.
- Repo-derived text is untrusted at the AI boundary: finding reasons, snippets,
  locations and file contents are wrapped in `<untrusted-finding>` /
  `<untrusted-file>` blocks with close tags neutralized, and model-authored
  `attributeValue` rejects characters that could break out of the source edit.
- A ready patch stores a bounded edit window (not the whole file) in
  append-only evidence, and a patch whose text looks like a credential is
  refused rather than stored redacted — redaction would silently change the
  branch later committed.
- Production DB connections require `sslmode=require` (or `verify-ca`/
  `verify-full`): `createPostgresClient` refuses a plaintext `DATABASE_URL`
  unless `DATABASE_SSL_INSECURE=true` or the host is local (dev/e2e). A
  whole-org export is owner-only.
- `jsx-a11y/no-noninteractive-tabindex` allows `region` in addition to
  `tabpanel`: scrollable code blocks are keyboard focus targets (WCAG 2.1.1).
  Every other non-interactive role stays banned.

## Tests

Commands: [`AGENTS.md`](../../AGENTS.md). Coverage excludes and thresholds:
`vitest.config.mts`. Vitest resolves workspace packages to **source**.
