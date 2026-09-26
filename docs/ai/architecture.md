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

## Persistence

- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`). Roles
  `owner|admin|member|viewer`. Workspace load is membership-org + active
  project. RBAC stays in the app kernel — never move the permission matrix
  into analysis-core.
- **Reads** — `getWorkspace()` loads **tenancy only** (orgs, memberships,
  projects, active project). Compliance rows load via
  `getProjectRuntime(projectId)` or repo `list*`/`get*` helpers. The compliance
  catalog is compile-time data (`shippedCatalog()`). File hashes live in
  `assessment_snapshots` and load only for `runAssessment`. Evidence and
  findings pages load via `src/server/reporting/evidence-queries.ts` and
  `src/server/workspace/project-view.ts` (`loadFindingsView`).
- **Writes (the write model)** — all mutations go through helpers in
  `src/server/workspace/workspace-write.ts` (`withProjectWrite` /
  `withFindingWrite` / `withOrgWrite` / `withConnectWrite`) with locking in
  `src/server/workspace/db.ts` (`withProjectLock`). Finding-scope permission
  (`requireOnFindingProject`) lives in
  `src/server/workspace/project-visibility.ts` so the write layer never
  imports from the action edge.
  - Project **compliance** mutations (findings, remediations, requirements,
    evidence) → `withProjectWrite` / `withFindingWrite` (locking,
    stale-write guards, evidence appends).
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
  - Callback returns a `ProjectWritePayload` (or void); `persistProjectRows`
    upserts it. Org writes return `{ result, insertOrgs, upsertMemberships,
deleteMembershipIds, deleteOrgIds }` — no JSON-diff of the in-memory slice.
  - Connect/disconnect uses `withConnectWrite` (tenancy load, org lock, no
    project lock — there may be no active project yet) and returns
    `{ result, insertProjects, deleteProjectIds, evidence }`.
  - Structural entities go through `repo/*`. `runAssessment` returns
    `{ assessment, evidence, findings, remediations, requirements }`; the worker
    persists via `applyAssessmentPayload`.
  - Stale-write guards take a single `loadedSlice` (`ProjectSlice`);
    `persistProjectRows` derives the per-entity `updatedAt` maps.
  - Project-scoped filtering is shared via `projectScopedSlice` (used by
    `snapshotProjectSlice`, assessment scratch clones, and
    `buildAssessmentApplyPayload`).
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
  - Requirement, finding and remediation upserts skip rows whose DB `updatedAt`
    is newer than the loaded slice (`repo/upsert-guard.ts`), so a stale apply
    cannot revert a concurrent human decision.
- **Latest assessment** — `latestAssessmentFor` compares `completedAt`.
  Do not use `.at(-1)` (loaders return newest-first).
- **Read bounding** — findings list order is severity-first
  (`findings.severity_rank`, `ORDER BY severity_rank, id`; same order in SQL
  and the JS fallback).
  - The list paginates in SQL for every filter except free-text search
    (status/severity/rule/engine/remediation all have columns or an `EXISTS`
    clause); search takes the bounded status-scoped load.
  - Status-scoped page loads cap at `FINDINGS_LIST_LOAD_LIMIT` (most severe
    first; counts stay exact via SQL, truncation is flagged, never silent).
    Writes/reports/exports load full history.
  - Evidence exports cap per project (`EVIDENCE_EXPORT_LIMIT`, newest first,
    flagged); per-finding reads cap at `FINDING_EVIDENCE_LIMIT`.
- **Retention/erasure** — evidence is append-only (trigger) with one gated
  exception: org deletion erases tenant evidence via `deleteEvidenceForOrg`
  (transaction-scoped `complyloop.allow_evidence_erase` flag). Project
  disconnect keeps retention.
  - Snapshots dedup identical hash maps (`hashes_unchanged`, reader fallback).
  - `webhook_deliveries` prunes to 10k per batch tick.
  - Patch evidence keeps full edit texts — they are load-bearing for
    `applyFileEdits` PR apply; identical candidates dedup on write instead.
- **Verification loop** — every finding type reaches `verified`: source via
  PR merge + re-assessment auto-verify; runtime/site via on-demand re-audit
  (works on open and resolved findings, re-opens on re-detection) or manual
  attestation with a required note (`remediation_manually_verified`).
  The finding-page beat follows the remediation status, never the finding.
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
  (isomorphic-git, no `git` CLI); deleted after. The executor uses its
  locally installed Playwright browser. See [`vercel.md`](../vercel.md).

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

**html-validate** — structural HTML for RGAA 8.2 / 10.1 only
(`markup-nesting`, `css-for-presentation`). Those stay `unable_to_verify`
until `htmlValidateRan`. Duplicate ids stay on axe + AST.

**Merge:** when runtime ran, drop composition-sensitive / runtime-only /
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

**Remediation:**

- Source: patch → ComplyLoop → draft PR → merge → re-assess → `verified`.
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
  picker typeahead), auth, and health.
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

## Tests

Commands: [`AGENTS.md`](../../AGENTS.md). Coverage excludes and thresholds:
`vitest.config.mts`. Vitest resolves workspace packages to **source**.
