# TODO — Architecture Review

Generated 2026-09-14 from actual codebase (graft map + source reads).
Do not implement speculative DDD/Clean/Hexagonal. Preserve what works.
Goal: simplest architecture where a developer can answer
"Where does this code belong?" and "What may depend on what?".

Preserved strengths (do not regress): `contract/` as single domain vocabulary
with ESLint fences; `src/core` kernel ban on catalog/db/server imports;
`src/ai` advisory-only (never sets status, `onError` injection instead of
`@/server` import); evidence append-only via `insertEvidence` convention;
Server Actions for mutations vs Route Handlers only for webhooks/polling/auth/health;
`server-only` boundary.

Dependency direction today (actual, mostly healthy):

```text
src/app (pages/actions call server)
  ↓
src/server/{assessment,workspace,github,reporting} + src/server/actions
  ↓
packages/db/repo/* + packages/analysis-core/{scan,runtime,catalog}
  ↓ (types only)
packages/analysis-core/src/contract/*
src/core (pure kernel: rbac, remediation-lifecycle, filters, display)
```

Violations and friction are listed below, ordered by architectural value.

---

## P0 — Critical

## P2 — Medium

- [x] **Collapse workspace read helpers to two entry points**
  - Done: `viewerCanViewProject` delegates to `requireProjectAccess` (15 lines of duplicated session/load/check removed, same boolean semantics); read-entry taxonomy documented on `getWorkspace`, on the slice-vs-DB lookups, and as the two-entry rule in `architecture.md`. `loadProjectDb`/`loadActiveProjectPage` verified as already-minimal single-purpose entries (not duplicated).
  - Why: 10+ ways to "load the workspace" forces every page/action to choose among near-duplicates.
  - Where: `src/server/workspace/workspace.ts:120-216` (`getWorkspace`, `viewerCanViewProject`, `requireFinding`, `requireRemediationForFinding`, `findingById`, `controlById`), `src/server/workspace/project-runtime.ts:39-67` (`getProjectRuntime`), `src/server/workspace/db.ts:8-10` (`loadProjectDb`), `src/server/workspace/active-project-page.ts:13-23` (`loadActiveProjectPage`), `src/server/workspace/project-rows.ts:25-84`, `packages/db/src/workspace-load.ts:42-241` (4 loaders: `loadTenancyDb`, `loadProjectWriteDb`, `loadProjectAssessmentDb`, `loadProjectRuntime` + `loadEvidenceWindow`).
  - Current: tenancy vs runtime split is documented and good, but spread over 6 files; `requireFinding`/`requireRemediationForFinding` duplicate `findingById`/`remediationForFinding` with different data sources (DB vs slice).
  - Problem: onboarding cost; easy to pick the uncached/direct variant and add a query per page section.
  - Change: expose exactly two cached reads — `getWorkspace()` (tenancy only) and `getProjectRuntime(projectId, opts)` — plus the write helpers. Demote the rest to internal: `loadProjectDb`/`active-project-page` become one-line delegates or are inlined; slice-lookup helpers (`findingById`, `remediationForFinding`) move next to the write helpers that use them. Document the two-entry rule in `architecture.md`.
  - Boundary: pages depend on 2 functions; loaders stay in `packages/db`, composition in `workspace/`.
  - Impact: fewer imports to choose from; request query count becomes predictable.
  - Risk: low

- [x] **Thin out app pages behind application-service functions**
  - Done: new `src/server/workspace/project-view.ts` with five loaders (`loadFindingsView`, `loadFindingDetailView`, `loadDashboardView`, `loadEvidenceView`, `loadRequirementsView`) owning all data-shaping moved verbatim from pages; pages are now param-parse → one loader → render (findings page 335→277 lines with thinner imports, dashboard similar). Item mapping kept in pages next to component imports; `generateMetadata` stays as route plumbing.
  - Why: 300-line pages duplicate loader composition, filtering, clustering, and pagination logic.
  - Where: `src/app/(app)/findings/page.tsx:50-335`, `src/app/(app)/findings/[id]/page.tsx:1-317`, `src/app/(app)/dashboard/page.tsx:1-319`, `src/app/(app)/evidence/page.tsx:1-317`, `src/app/(app)/requirements/page.tsx:1-279`.
  - Current: pages directly compose `loadActiveProjectPage` + `getProjectRuntime` + `countFindingsByStatus` + `parseFindingListParams` + `clusterFindings`/`prioritizeClusters` + pagination. This is correct Next.js colocation but repeated per page.
  - Problem: adding a list feature (e.g. new filter) touches page + `filter-params` + component; dashboard/findings/requirements each re-derive "open findings in scope" differently (`findingsInScope` vs `projectScopedSlice` vs tab counts).
  - Change: no new layer/framework. Add small `server/workspace/project-view.ts`-style loaders (e.g. `getFindingsView(projectId, params)`, `getDashboardView(projectId)`) that return exactly what the page renders. Pages become param-parse → one loader → render. Keep components as-is.
  - Boundary: data-shaping moves out of `src/app` into `src/server`; `src/app` keeps routing + rendering.
  - Impact: page diffs shrink; "open in scope" logic lives once; debugging a request starts at one function.
  - Risk: low

- [x] **Separate analysis-core scan orchestration from engines**
  - Done (discipline verified + documented): server already imports only stage entries + leaves (no `checks/*`/`custom-checks/*` internals anywhere in `src/`). Added stage headers to `scan.ts`/`runtime/scan.ts`/`merge-findings.ts`, new `packages/analysis-core/README.md` naming the 4 stages + leaf rules, pointer from `architecture.md`.
  - Why: `analysis-core` is the best-isolated package, but scan orchestration and engine details are interleaved; the 108-file `runtime/` subtree dominates.
  - Where: `packages/analysis-core/src/scan.ts`, `merge-findings.ts`, `check-authority.ts`, `check-registry.ts`, `jsx-a11y-scan.ts`, `runtime/scan.ts`, `runtime/` (108 files), `checks/` (17 files), `catalog/` (22 files).
  - Current: `scanProject`/`scanChangedFiles` + `mergeRawFindings` + `filterAstFindingsForAuthority` + `dedupeRuntimeFindings` form an implicit pipeline invoked from `src/server/assessment/assessment.ts`; runtime probes (`runtime/custom-checks/*`) share utils with AST checks (`parse.ts:56-190`, `jsx-primitives.ts`).
  - Problem: engine replaceability (e.g. swap axe version, drop linkinator) requires tracing server + core + runtime; authority lists risk duplication between `check-authority.ts` and catalog `checkId` wiring (`guidance.ts`).
  - Change: document and enforce `scan.ts` as the sole orchestration entry (AST → runtime → merge → dedupe) with engines behind a `RuntimePageScanner`-style interface (already started in `assessment.ts:22-24`); keep shared AST utils (`parse.ts`, `jsx-primitives.ts`, `a11y-aria.ts`) as leaves. No new packages. Add a package README naming the 4 stages.
  - Boundary: engines depend on shared leaves; orchestration depends on engines; server depends only on orchestration.
  - Impact: replacing an engine touches one directory; authority changes stay in one list.
  - Risk: low (mostly documentation + import discipline)

- [x] **Centralize runtime config/env and infra singletons**
  - Done (scoped): new `src/server/env.ts` with lazy getters (import-safe, `vi.stubEnv`-compatible) for GitHub App/webhook, support email, app URL, E2E flags, and checkout quotas; migrated `github-app`/`github`/`webhook`/`e2e-harness`/`repo-checkout`/inline-drain/org page. Dev drain outcome→message mapping moved into `assessment-job-inline.ts` (`drainAssessmentJobsInline`, tested) so the action is enqueue + one delegate. Deviations: `src/ai` keeps its own `AI_GATEWAY_API_KEY` read (ESLint bans `@/server` imports there); `AUTH_*`/framework keys stay direct (edge/middleware contexts); `rate-limit`/`observability`/`redact` stay at `server/` root (21 importers — a move is pure churn).
  - Why: env reads, rate limits, observability, and external clients are scattered; missing config fails late.
  - Where: `src/server/rate-limit.ts:25-95`, `src/server/observability.ts`, `src/server/redact.ts`, `src/sentry/*`, `src/instrumentation*.ts`, `src/auth.ts`, `src/auth-secret.ts`, `src/proxy.ts`, `packages/db/src/postgres.ts:61-227` (`createPostgresClient`, `getDrizzle`), `next.config.ts` (externals), ad-hoc `process.env` in `github-app.ts`, `ai-call.ts`, `assessment-job-inline.ts:10-12`.
  - Current: each edge reads its own env; `shouldDrainAssessmentJobsInline()` branches prod behavior on `NODE_ENV`/harness flag inside the action path (`actions/assessment.ts:32-55`).
  - Problem: no fail-fast validated env module; rate-limit/observability/redact sit at `server/` root with no `infra/` home; dev-inline drain logic is interleaved with prod enqueue.
  - Change: add one `src/server/env.ts` (zod-validated, fail-fast) and have all modules import it instead of `process.env`. Group `rate-limit`, `observability`, `redact` under `src/server/infra/` (moves only). Isolate dev-inline drain (`assessment-job-inline.ts`, `e2e-harness.ts`) behind the worker runner, not inside actions.
  - Boundary: edges depend on `env` + `infra`; domain/assessment code never reads `process.env` directly.
  - Impact: misconfiguration surfaces at boot; infra replaceable/moc
    kable in one place.
  - Risk: low

---

## P3 — Low

- [x] **Remove barrel/file duals (`display`, `filter-params`, `action-state`)**
  - Done: barrels declared canonical in P1-1 (all consumers already used them). `action-state` needs no change — `core/action-state.ts` documents the client-safe split and `server/action-state.ts` re-exports it for action callers; both directions already point at each other.
  - Why: `src/core/display.ts` + `src/core/display/`, `src/core/filter-params.ts` + `src/core/filter-params/`, `src/core/action-state.ts` + `src/server/action-state.ts` triple the guesswork for one import.
  - Where: `src/core/display.ts` vs `src/core/display/*.ts`, `src/core/filter-params.ts` vs `src/core/filter-params/*.ts`, `src/core/action-state.ts:11-25` vs `src/server/action-state.ts:19-44`, `src/server/actions/shared.ts:1-100` + `refresh-routes.ts:1-20`.
  - Current: barrels re-export or partially duplicate directory contents; `ActionState` type vs runtime split is undocumented at the import site.
  - Problem: minor but daily friction; import-sort churn.
  - Change: one file or one directory per module, not both. Keep `display/` and `filter-params/` directories, delete the same-named flat files (or keep flat files only as `index.ts`-style re-exports — pick one convention repo-wide). Add a one-line doc comment on `core/action-state.ts` pointing at `server/action-state.ts`.
  - Boundary: no responsibility moves; import graph only.
  - Impact: fewer duplicate import paths; cleaner graft/call graphs.
  - Risk: low

- [x] **Merge finding-presentation helpers (`finding-priority`, `finding-cluster`, `finding-act`)**
  - Done: `FindingCluster` interface folded into `finding-priority.ts` (where clusters are built); `finding-cluster.ts` deleted, 3 import sites updated. `finding-act.ts` stays separate by design (finding-page UX beats, ESLint-banned from the assessment pipeline).
  - Why: three modules slice one concern (which finding to show first and what CTA to render) with overlapping inputs.
  - Where: `src/core/finding-priority.ts:1-376`, `src/core/finding-cluster.ts`, `src/core/finding-act.ts:52-215`, `src/core/assessment-helpers.ts:1-105`, `src/components/findings/finding-next-step-panel.tsx:1-264`.
  - Current: pages call `clusterFindings` + `prioritizeClusters` + `findingAct` separately; `finding-act` ban in assessment pipeline is ESLint-enforced (`eslint.config.mjs:117-134`) — good — but the trio's inputs (`FindingActInput` vs cluster keys) overlap.
  - Problem: adding a sort/beat rule touches 2–3 files + panel component.
  - Change: keep the UX-policy/server split. Within `src/core`, consolidate to `finding-priority.ts` (ordering) + `finding-act.ts` (CTA beats), folding `finding-cluster.ts` types into priority or documenting why the split exists. No behavior change.
  - Boundary: presentation policy stays in `src/core`, out of `src/server/assessment`.
  - Impact: one place per presentation question.
  - Risk: low

- [x] **Isolate dev/e2e special-casing from prod request paths**
  - Done: drain outcome→message mapping extracted to `drainAssessmentJobsInline()` (tested) so the action is enqueue + one delegate; E2E key ownership moved to `server/env.ts`. Prod code reaches `e2e-harness.ts` only through fail-fast gates (fixture switch, prod App assertion, inline drain) — unreachable-by-test/edge gating is impossible without removing the harness itself, so this is the stable end state.
  - Why: prod readability suffers from inline dev branches; e2e harness leaks into server modules.
  - Where: `src/server/assessment/assessment-job-inline.ts:10-12`, `src/server/e2e-harness.ts`, `src/server/actions/assessment.ts:32-55` (inline drain), `scripts/run-assessment-worker.ts`, `scripts/e2e-seed.ts:47-179`, `e2e/auth.ts:23-50`.
  - Current: `runAssessmentAction` branches on `shouldDrainAssessmentJobsInline()`; worker rate-limit pruning notes live in `processNextAssessmentJob` comments.
  - Problem: every reader of the prod enqueue path must reason about dev drain; harness env flags (`E2E_AUTH_ENABLED`) appear in app code.
  - Change: move inline-drain behind `runAssessmentJobBatch` in the worker/dev script only; actions always enqueue. Gate harness imports so `e2e-harness.ts` is only reachable from scripts/tests.
  - Boundary: `src/app`/`src/server/actions` stay prod-only; dev behavior lives in `scripts/` + test setup.
  - Impact: prod paths read linearly; e2e setup can't accidentally ship.
  - Risk: low

---

## Target Architecture

Boring, explicit, dependency-controlled. No new frameworks, DI, or generic
repositories. Concrete shape to converge toward:

```text
src/app/                      # routing + rendering only
  (app)/findings/page.tsx     # parse params → one view loader → render
  api/*/route.ts              # webhooks, polling, auth, health, internal runner only

src/server/                   # application orchestration (server-only)
  actions/                    # thin: parse → guard → lifecycle → persist → refresh
  assessment/
    assessment-pipeline.ts    # THE orchestrator: change-detect → scan → merge →
                              # reconcile → status-refresh → verify (owns scratch rows)
    assessment-jobs.ts        # queue persistence only (imports job types)
    assessment-worker.ts      # load → pipeline → applyAssessmentPayload (no rule logic)
    repo-checkout.ts + github facade use
    ai-fix.ts                 # only checkout+patch module
  workspace/
    workspace.ts              # getWorkspace() tenancy only (cached)
    project-view.ts           # getProjectRuntime() + getFindingsView() etc. (cached)
    workspace-write.ts        # sole write entry: 4 helpers own locks/guards/evidence
  github/
    github-connector.ts       # facade: getProjectToken/cloneProject/createPr/postCheckRun
    <leaves>                  # app-auth, tokens, git, webhook, pr (not imported by app/)
  reporting/
    <thin composition>        # delegates to packages/db/repo/*, memoizes per request
  infra/
    env.ts                    # zod-validated env, fail-fast
    rate-limit.ts, observability.ts, redact.ts

src/core/                     # pure kernel, no Next/Drizzle/GitHub/engines
  validate.ts                 # zod primitives (parseForm/parseInput/parseEntityId)
  params/                     # zod-free URL/filter parsing
  display/                    # status/evidence/report text
  rbac.ts                     # permission matrix (stays here per architecture.md)
  remediation-lifecycle.ts    # transition authority
  assessment-helpers.ts       # worker-safe summaries only

src/ai/                       # advisory generation edge (contract in, result out)
  explainer.ts, remediation.ts, patch.ts (onError injection; no @/server import)

packages/analysis-core/
  contract/                   # vocabulary: entities (+Requirement), statuses,
                              # location, finding-types, assessment-jobs enums+zod,
                              # requirement-status derivation (pure, single source)
  scan.ts                     # sole orchestration: AST → runtime → merge → dedupe
  checks/, runtime/, catalog/ # engines + reference data (leaves)

packages/db/
  schema.ts + workspace-load.ts# loaders (accept DrizzleDb, no getDrizzle inside)
  repo/*                      # concrete persistence API (no abstract repos):
                              # apply, findings, remediations, requirements,
                              # evidence (append-only), alerts, nav-attention (single),
                              # projects, orgs

packages/check/               # npx CLI (AST only, bundles analysis-core)
```

Dependency rules (enforce in `eslint.config.mjs`, already partially done):

1. `src/app` → `src/server` + `src/core` (types/helpers) only. Never Drizzle, never `analysis-core` engines directly (catalog read for static display is the current exception — keep and document).
2. `src/server` → `packages/db/repo`, `analysis-core` orchestration (`scan`, `contract`), `src/core`, `src/ai`. `assessment/` never imports `finding-act`.
3. `src/core` → `contract/*` only. No catalog, db, server, AI, GitHub.
4. `src/ai` → `contract/*` only (+ own gateway/fs). Never `@/server`.
5. `packages/db`, `catalog`, `check` → `contract/*` only. No app/server/AI, no `@/` alias.
6. Writes: `src/server/actions` → `workspace-write` helpers only (zero-file `getDrizzle` allow-list). Reads: pages → `getWorkspace` / `getProjectRuntime` / view loaders only.
7. Statuses: only `deriveStatusForCheck` (analysis-core) computes; server only persists + appends evidence.

---

## Biggest Architectural Wins

1. **Collapse assessment orchestration around one pipeline owner** — the longest end-to-end flow becomes traceable; finding/status rule changes stop spanning 4 modules.
2. **Unify the write model; close raw `getDrizzle()` bypasses** — locks, stale-write guards, and evidence-append hold everywhere; "how do I persist?" has one answer.
3. **Single-source status derivation** — the core compliance rule becomes a pure, unit-testable function; server keeps side effects only.
4. **Collapse the triple-defined job contract** — queue/API/DB shapes can't drift; trigger/status changes touch one file.
5. **Facade the GitHub connector** — the only external integration becomes replaceable; token/clone/PR logic stops leaking into assessment and connect flows.
6. **Consolidate remediation paths** — one transition authority + two action files; AI/checkout isolated for replacement.
7. **Unify reporting reads** — badge/report/page counts share one query path; per-request query count becomes predictable.
8. **De-grab-bag `src/core` + contract entities** — "where does this type/helper belong?" becomes answerable in seconds; kernel stays bundle-safe.
