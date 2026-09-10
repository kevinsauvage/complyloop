# Architecture

**Orientation:** [`AGENTS.md`](../../AGENTS.md) (commands, graft). **Product scope:**
[`compliance-engineering-product-spec.md`](../compliance-engineering-product-spec.md).
**Enforceable rules:** [`.cursor/rules/`](../../.cursor/rules/).

## Modules

| Piece    | Location                               | Role                                                                                                                                                                                                                                                                        |
| -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract | `packages/analysis-core/src/contract/` | Statuses, findings, org/project/requirement types, job enums, persisted entities (`entities.ts`: Finding, Remediation, Assessment, Evidence, Alert)                                                                                                                         |
| Analysis | `packages/analysis-core/src/`          | AST checks + optional runtime audits                                                                                                                                                                                                                                        |
| Catalog  | `packages/analysis-core/src/adapters/` | RGAA/WCAG catalog, presets, guidance ("adapters" = catalog packaging, not hexagonal ports — no app-level adapters layer exists)                                                                                                                                             |
| DB       | `packages/db/src/`                     | Drizzle schema, `repo/`, workspace-load, `Db` slice (imports entities from contract; `types.ts` only re-exports for compat)                                                                                                                                                 |
| App core | `src/core/`                            | Shared kernel (contract only): `rbac`, `remediation-lifecycle` (domain transitions), `assessment-helpers` (worker-safe summaries), `finding-priority` (clustering/scoring), `finding-act` (finding-page UX beats), `finding-cluster` type, `datetime`, `display`, `filters` |
| AI       | `src/ai/`                              | Explain / remediate — never sets status; takes contract in, returns results / throws `PublicError`, reports failures only via an injected `onError` hook (never imports `@/server`)                                                                                         |
| Server   | `src/server/`                          | Jobs, GitHub, actions                                                                                                                                                                                                                                                       |
| App      | `src/app/`                             | Next.js UI + API                                                                                                                                                                                                                                                            |
| CI       | `packages/check/src/`                  | `npx complyloop-check` (AST only)                                                                                                                                                                                                                                           |

`src/core` must not import the catalog, db, or analysis-core beyond `contract/*`
(ESLint). Dependency direction: `contract → { db, catalog, app }`.
Integration is direct — pages/actions call `src/server`, which calls
`packages/db` and analysis-core. `src/ai` depends only on the contract
(plus its own gateway/fs helpers); `src/server` depends on `src/ai`.
Remediation legality lives in `src/core/remediation-lifecycle.ts`; the
finding-page beat model (`src/core/finding-act.ts`) is UI policy and must not
be imported by `src/server/assessment*` (ESLint).

Workspace packages export `src/*.ts`. Next transpiles them; `dist/` is
publish-only. `@complyloop/check` bundles analysis-core; Playwright stays
external.

**Connectors:** GitHub only. **State:** Postgres (`DATABASE_URL`). Evidence is
append-only. Tokens AES-256-GCM at rest. Assessments are durable jobs
(`npm run worker` in prod).

```
App (enqueue only) → assessment_jobs → Worker (clone → scan → persist)
                                         ↓
                         Core + contract → Catalog / Analysis / AI
                                         ↓
                                   GitHub clone (ephemeral)
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
  findings pages load via `src/server/evidence-queries.ts` and
  `src/server/findings-queries.ts`.
- **Writes (the write model)** — `withProjectWrite` / `withOrgWrite` /
  `withConnectWrite` / `withProjectLock` in `src/server/workspace-write.ts`.
  Project **compliance** mutations (findings, remediations, requirements,
  evidence) go through `withProjectWrite` / `withFindingWrite` so locking,
  stale-write guards, and evidence appends apply. Tenancy/org/connect
  mutations go through `withOrgWrite` / `withConnectWrite`. Raw `getDrizzle()`
  in actions is allowed **only** for reads or lock-scoped single-row touches
  that cannot violate stale-write/evidence invariants — today exactly:
  `actions/alerts.ts` (RBAC reads + `withProjectLock`-scoped alert read flags),
  `actions/org.ts` (org-export reads), `actions/pr.ts` (evidence read for the
  PR candidate; the state change itself uses `withFindingWrite`). Anything
  else must use the write helpers. No generic Unit-of-Work framework.
  callback returns a `ProjectWritePayload` (or void); `persistProjectRows`
  upserts it. Org writes return `{ result, insertOrgs, upsertMemberships,
deleteMembershipIds, deleteOrgIds }` — no JSON-diff of the in-memory slice.
  Connect/disconnect uses `withConnectWrite` (tenancy load, org lock, no
  project lock — there may be no active project yet) and returns
  `{ result, insertProjects, deleteProjectIds, evidence }`. Structural
  entities go through `repo/*`. `runAssessment` returns `{ assessment,
evidence, findings, remediations, requirements }`; the worker persists via
  `applyAssessmentPayload`. Stale-write guards take a single `loadedSlice`
  (`ProjectSlice`); `persistProjectRows` derives the per-entity `updatedAt`
  maps. Project-scoped filtering is shared via `projectScopedSlice` (used by
  `snapshotProjectSlice`, assessment scratch clones, and
  `buildAssessmentApplyPayload`).
- **Locks** — job claim `FOR UPDATE SKIP LOCKED`; interactive project writes
  and apply take `project-write:{projectId}`; org and connect writes take the
  user-scoped org lock. Requirement, finding and remediation
  upserts skip rows whose DB `updatedAt` is newer than the loaded slice
  (`repo/upsert-guard.ts`), so a stale apply cannot revert a concurrent human
  decision.
- **Latest assessment** — `latestAssessmentFor` compares `completedAt`.
  Do not use `.at(-1)` (loaders return newest-first).
- **Validation** — shared zod primitives (`entityIdSchema`,
  `requiredField`, `parseForm` / `parseInput` / `parseEntityId`) live in
  `src/core/filters.ts`; action- and route-specific schemas stay next to
  their actions/handlers. No separate validation layer.
- **Persistence API** — concrete `packages/db/repo` functions are the API.
  No abstract repositories, interfaces-per-table, or DI containers: expensive
  edges are injected explicitly via function params (`runAssessment`
  options), everything else is a direct import.
- **Jobs** — 30-min lease, 3 attempts, serial per project. HTTP only
  enqueues. Dev/e2e drain in-process.
- **Clones** — shallow temp checkout per job; deleted after. See
  [`deploy.md`](../deploy.md).

## Analysis

Three deterministic engines. AI is separate and never authoritative.

**AST** (`checks/` + jsx-a11y) — 75 check ids from source. Safe auto-fixes
and verified AI patches target AST findings.

**Runtime** (when `runtimeBaseUrl` is set) — Playwright + axe from disk.
Navigate with `domcontentloaded` + settle, not `networkidle`. Never add
`@axe-core/playwright`. Never import `ssrf-guard/node` in app code.
`linkinator`, `playwright`, `axe-core`, `html-validate` are server
externals in `next.config.ts`.

Engine containment: a throwing custom probe is recorded on
`probeFailures` and the rest of the pass continues. html-validate
failures are non-fatal. An axe crash still fails the scan.

**html-validate** — structural HTML for RGAA 8.2 / 10.1 only
(`markup-nesting`, `css-for-presentation`). Those stay `unable_to_verify`
until `htmlValidateRan`. Duplicate ids stay on axe + AST.

**Merge:** when runtime ran, drop composition-sensitive / runtime-only /
package-twin AST findings (`merge-findings.ts`). Dedupe priority:
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

1. Sticky human decisions (never overwritten; temp exceptions expire via
   `clearExpiredExceptions`).
2. Open findings → `failed` / `needs_review`.
3. Applicability (runtime absence) → `not_applicable`.
4. Authority gates → `unable_to_verify` or `passed`.

Manual controls (`checkId: null`) stay `unable_to_verify` until a human
pass or exception.

Assessments always use the project's `defaultPresetId`. Requirements page
`?presetId=` is browse-only.

## Key flows

**Assessment:** enqueue → worker clones + scans → `detectChanges` (depth-1
clone: author is HEAD) → AST → optional Playwright → merge → re-derive
statuses → `verifyDraftPrRemediation` (uses `approvalAction` on the
remediation, not historical evidence). Only a **default-branch** scan (or a
manual assessment) is authoritative: it persists findings/statuses and may
auto-verify. A **pull-request head** scan is a preview — it runs the same
analysis to post a Check Run but never resolves findings, flips statuses, or
auto-verifies, and persists nothing to the project store.

**Remediation:** source = patch → ComplyLoop → draft PR → merge → re-assess
→ `verified`. Runtime = guidance → approve → implement → re-audit. Verify
fails closed on HTTP errors, redirects away from the finding URL, or an
empty document. Site-level findings re-run the site audit; source findings
are not verified by applying a local patch. A successful runtime verify
forwards `runtimeRan` (and site-level / html-validate flags when those
engines ran) so the requirement can close. Runtime/DOM/site findings are
never resolved unless `runtimeRan`.

**Monitoring:** webhook enqueues only (`idempotency_key` from delivery id).
Only pushes to the project's **live** default branch
(`repository.default_branch`, persisted onto `project.github.defaultBranch`
when it changes) are enqueued as authoritative assessments; feature-branch
pushes are ignored. PR events post a Check Run. Failures become
`assessment_job_failed` evidence.

**Reports:** `report-model.ts` + markdown/HTML renderers; routes load via `loadReportInput` in `report.ts`.

## Rendering and data access

- **Server boundary** — `src/server/*` (and `packages/db/src/postgres.ts`)
  carry `import "server-only"` so a client import fails at build time.
  Client-safe shared types live in `*.types.ts` / `@/server/github-types`
  and `@complyloop/db/repo/*` (type-only); `src/server/actions/*`
  (`"use server"`) stay unfenced because clients invoke them.
- **Reads** — pages compose loaders from `@/server/*` (`getWorkspace`,
  `getProjectRuntime`, `findings-queries`, `evidence-queries`); pages never
  open Drizzle or import `@complyloop/db/repo/*` directly (except the health
  probe, which is a DB check by definition).
- **Caching** — authenticated `(app)` pages rely on dynamic-from-usage
  (`getWorkspace` reads `auth()`/`cookies()`; list pages also await
  `searchParams`) plus targeted `revalidatePath` on mutation
  (`src/server/actions/shared.ts`). No blanket `force-dynamic` on pages.
  `force-dynamic` stays only on JSON Route Handlers
  (`api/github/repos`, `assessment-jobs`, `health`, `internal/jobs/run`)
  where accidental static caching of per-user JSON must be impossible.
- **Mutations vs routes** — mutations go through Server Actions; Route
  Handlers exist only for webhooks, polling/streaming (`assessment-jobs`,
  picker typeahead), auth, health, and the internal job runner. Do not
  convert polling/search to Server Actions, and do not proxy Server
  Component reads through `/api`.
- **Providers** — `ThemeProvider` + `TooltipProvider` + `Toaster` stay in
  the root layout (theme needs the HTML shell to avoid FOUC). Only move
  them under `(app)/layout.tsx` if marketing pages ever need zero client
  JS; until then the global placement is intentional.

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
