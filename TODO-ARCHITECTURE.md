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

- [x] **Single-source requirement-status derivation (remove server-side authority re-mapping)**
  - Done 2026-09-14: new pure `deriveStatusForCheck(checkId, openFindings, audit)` (+ `CheckAuditInput`) in `packages/analysis-core/src/check-authority.ts` — owns the full `checkId → { authority, htmlValidateRequired, applicabilityConfirmed }` mapping and delegates to `deriveRequirementStatus`. Server `statusFromFindings` adapter deleted; the single call site calls the core function directly. `assessment-status.ts` is now orchestration only (sticky gates, manual controls, evidence, row merging). Covered by 5 new `deriveStatusForCheck` cases in `check-authority.test.ts`.
  - Why: the core business rule (what a requirement status means) is split across three layers; changing authority semantics touches all three.
  - Where: `packages/analysis-core/src/contract/requirement-status.ts:67-113` (`deriveRequirementStatus`, pure), `packages/analysis-core/src/check-authority.ts` + `packages/analysis-core/src/checks/registry.ts`, `src/server/assessment/assessment-status.ts:128-154` (`statusFromFindings`), `src/server/assessment/assessment-status.ts:176-265` (`refreshManualControl`, `applyDerivedStatusChange`, `refreshRequirementForControl`).
  - Current: contract owns pure derivation; server re-maps `checkId → authority` via `authorityForCheck` + `isHtmlValidateOwnedCheck` and re-implements sticky/manual/regression/evidence side effects around it.
  - Problem: authority mapping exists in two places (registry/contract vs server adapter); evidence + status mutation + derivation are interleaved in a 439-line module, so unit-testing the rule requires the server harness.
  - Change: move the full `checkId → { authority, htmlValidateRequired, applicabilityKey }` mapping into `analysis-core` (next to `check-authority.ts`, tested by `check-authority.test.ts`), exposing one `deriveStatusForCheck(checkId, openFindings, audit)` pure function. Shrink `assessment-status.ts` to orchestration only (load control, call pure fn, append evidence on change). No new layer, no interface.
  - Boundary: derivation logic moves down into `contract`/analysis-core; server keeps only persistence side effects.
  - Impact: business-rule change touches one pure function + tests; server diffs become mechanical.
  - Risk: low

- [ ] **Collapse the triple-defined assessment-job contract**
  - Why: one concept (job queue row) has three sources of truth; a status/trigger change must land in three files despite the comment claiming one.
  - Where: `packages/analysis-core/src/contract/assessment-jobs.ts:8-20` (status/trigger enums), `src/core/assessment-jobs.ts:9-38` (zod schemas + `AssessmentJob` types), `src/server/assessment/assessment-jobs.ts:42-44,108-374` (persistence + `isAssessmentJobStatus` re-validation), `src/core/assessment-job-guard.ts:30-38` (`parseAssessmentJobsResponse`).
  - Current: enums in contract, zod + types in `src/core`, row mapping + guards in server, plus a separate response parser. Comment in contract file points at `src/core/boundary.ts` which does not exist.
  - Problem: duplicated status sets (`ASSESSMENT_JOB_STATUSES` vs zod enum vs `JOB_STATUSES` set); API shape, DB shape, and validation can drift; stale comment misdirects onboarding.
  - Change: keep enums in `contract/assessment-jobs.ts`. Keep exactly one zod schema + inferred types next to it (either in contract if zod is acceptable there, else one `src/core/assessment-jobs.ts` that imports enums — not both). Delete `assessment-job-guard.ts` in favor of `assessmentJobsResponseSchema.parse`. Server imports, never re-declares.
  - Boundary: definition moves down to contract; `src/core` and `src/server` consume.
  - Impact: adding a trigger/status touches one file; API/DB/worker stay in sync.
  - Risk: low

---

## P1 — High

- [ ] **De-grab-bag `src/core`: separate validation, URL params, and display**
  - Why: `src/core` is the shared kernel but mixes three unrelated responsibilities; clients pull `zod` via URL helpers and GitHub shapes leak into the kernel.
  - Where: `src/core/filters.ts:1-125` (zod primitives + `githubRepoSearchResponseSchema:45-61` + form helpers), `src/core/filter-params/` (5 files: `findings`, `requirements`, `evidence`, `pagination`, `href`) + `src/core/filter-params.ts` barrel, `src/core/display.ts` + `src/core/display/` (4 files: `status`, `evidence`, `report-tones`, `must-get`), `src/core/action-state.ts` vs `src/server/action-state.ts:19-44`.
  - Current: comment in `filters.ts:5-9` admits the split is bundle-driven; `display.ts` and `display/` coexist; `ActionState` type lives in core while `runAction`/`publicErrorMessage` live in server.
  - Problem: no clear answer to "where does a new shared helper go?"; GitHub API shape in kernel violates the kernel's own ESLint intent; duplicate barrels (`filter-params.ts` + `filter-params/`, `display.ts` + `display/`) confuse imports.
  - Change: three explicit modules under `src/core`: `validate.ts` (zod primitives + `parseForm`/`parseInput`/`parseEntityId` only), `params/` (URL/filter parsing, zod-free), `display/` (tones/status text, no zod). Move `githubRepoSearchResponseSchema` to `src/server/github/` or the route that serves it. Merge `display.ts` into `display/` (or delete the barrel) and same for `filter-params`. Keep `ActionState` type in core, runtime in server — document once.
  - Boundary: kernel splits by dependency footprint (zod vs pure vs UI text), not by feature.
  - Impact: predictable placement; client bundles stop pulling zod transitively; GitHub leak removed.
  - Risk: low

- [ ] **Consolidate the contract entity vocabulary**
  - Why: the most-asked onboarding question ("what is a Finding/Requirement?") requires stitching 5 files.
  - Where: `packages/analysis-core/src/contract/entities.ts:20-181` (`Assessment`, `Finding`, `FileChange`, …), `packages/analysis-core/src/contract/project-types.ts` (`Requirement`, `Project`, `Control`, `ProjectGitHubMeta:61-70`), `packages/analysis-core/src/contract/finding-types.ts` (location/fix/suggestion/engine), `packages/analysis-core/src/contract/statuses.ts`, `packages/analysis-core/src/contract/location.ts`.
  - Current: `Finding` is split across `entities` + `finding-types` + `statuses` + `location`; `Requirement` lives in `project-types` while `Finding`/`Remediation` live in `entities`; `engine` is derived via `engineFor` (documented in `entities.ts:53-59`) but easy to miss.
  - Problem: unclear ownership; developers guess between `entities` and `project-types`; persistence envelope vs observation fields are only separated by comment.
  - Change: no new abstraction. Either (a) move `Requirement` into `entities.ts` so all persisted rows live together and `project-types.ts` keeps only `Project`/`Org`/`Control`, or (b) document the split at the top of both files and re-export one `contract/index`. Prefer (a) — one move, then fix imports. Keep `finding-types`/`location`/`statuses` as value-object leaves.
  - Boundary: persisted-entity types converge in one file; leaves stay leaves.
  - Impact: "where does this type belong?" becomes trivial; fewer import guesses.
  - Risk: low (mechanical import updates)

- [ ] **Put a facade in front of the GitHub connector**
  - Why: GitHub is the only external connector but is spread over 9 modules with token logic in 3 places; callers must know the internal topology.
  - Where: `src/server/github/github.ts` (Octokit + repo mapping), `github-app.ts:21-220` (app auth, installation resolution), `github-access.ts:26-72` (token→repo listing), `access-token.ts`, `github-tokens.ts:73-184` (user token store), `git.ts:30-88` (authed git), `pr.ts`, `webhook.ts:147-220`, `webhook-deliveries.ts`, plus `src/server/workspace/connect-github.ts:1-252`.
  - Current: `resolveProjectGitHubToken`, `resolveUserInstallationForRepo`, `storeUserGitHubToken`, `createAuthedGit`, `githubCloneUrl` are peers; checkout (`assessment/repo-checkout.ts:1-257`), PR creation, webhook handling, and connect flow each wire a different subset.
  - Problem: replacing auth strategy (App vs OAuth) or clone method touches N call sites; token-expiry and installation-mismatch handling is duplicated between webhook and connect paths.
  - Change: keep files, add one `github-connector.ts` facade exposing `getProjectToken(project)`, `cloneProject(project, dest)`, `createPr(…)`, `postCheckRun(…)`; internal modules become non-exported-to-app leaves. `connect-github.ts` and `repo-checkout.ts` call the facade. No DI container — plain functions.
  - Boundary: app/assessment code depends on the facade; Octokit/git/token-store details stay behind it.
  - Impact: swapping a GitHub mechanism touches one module; call sites shrink to 4 obvious functions.
  - Risk: medium (touches checkout + webhook + PR paths; cover with existing `github*.test.ts`, `repo-checkout.test.ts`, `webhook.test.ts`)

- [ ] **Consolidate remediation mutation paths**
  - Why: one domain action (finding → remediation state) is split across 5 modules with overlapping checkout/AI/verify concerns.
  - Where: `src/server/actions/remediation.ts:64-278` (approve/dismiss/bulk), `src/server/actions/remediation-verify.ts:63-269` (`markVerified`, `recordStillFailing`, verify/implement), `src/server/actions/remediation-ai.ts:21-138` (explain/remediate), `src/server/actions/ai-fix.ts:20-69` (patch action), `src/server/assessment/ai-fix.ts:1-209` (`persistPatchCandidate`, `runAiFixOnCheckout`, `generatePatchCandidate`).
  - Current: `actions/ai-fix.ts` is a thin wrapper over `assessment/ai-fix.ts` + `repo-checkout.ts`; verify path re-implements audit-flag plumbing (`VerifyAuditFlags:63-67`) that mirrors assessment engines; bulk vs single variants duplicate guard logic.
  - Problem: fixing "who may transition remediation X→Y" requires reading lifecycle (`src/core/remediation-lifecycle.ts:11-120`, correct home) plus 3 action files; AI/checkout details leak into action handlers.
  - Change: keep `remediation-lifecycle.ts` as the transition authority. Collapse actions to `remediation.ts` (state transitions) + `remediation-verify.ts` (verify/implement) with shared `requireFindingContext` guards from `actions/shared.ts`; make `assessment/ai-fix.ts` the only checkout+patch module and `actions/ai-fix.ts` a one-line delegate (or merge them). Extract bulk-loop helper so single/bulk share guards.
  - Boundary: transition rules stay in `src/core`; checkout/AI stays in `assessment/`; actions stay thin (parse → guard → lifecycle → persist → refresh).
  - Impact: adding a remediation rule touches lifecycle + one action; AI/checkout replaceable in one file.
  - Risk: medium

- [ ] **Unify reporting reads (remove dual nav-attention + direct-Drizzle queries)**
  - Why: reporting has two implementations of the same query and bypasses the read path used everywhere else.
  - Where: `src/server/reporting/nav-attention.ts:15-24` vs `packages/db/src/repo/nav-attention.ts`, `src/server/reporting/findings-queries.ts:1-11` (`countFindingsByStatus`), `src/server/reporting/evidence-queries.ts:20-46`, `src/server/reporting/report.ts:125-156` (`loadReportInput`), `report-model.ts` + `report-markdown.ts` + `report-html/`.
  - Current: pages (`findings/page.tsx:79`, dashboard, badges) call reporting queries that each open their own Drizzle connection; `nav-attention` exists in both `server/reporting` and `db/repo` with unclear precedence.
  - Problem: N+1-prone page loads (tenancy + runtime + counts + evidence each query separately); two sources for badge counts can drift; report renderers triple the model surface.
  - Change: keep one `nav-attention` in `packages/db/repo` (SQL), delete the server duplicate (or keep a memoized wrapper that delegates — not both). Route all reporting reads through `getProjectRuntime` + repo query fns that accept an already-open `DrizzleDb` so pages share one connection per request. Keep `report-model` as the single model; markdown/HTML become pure render functions of it (no independent loading).
  - Boundary: SQL stays in `packages/db/repo`; `server/reporting` becomes thin composition/memoization.
  - Impact: fewer queries per page; badge/report counts can't diverge; report formats stay in sync.
  - Risk: low-medium

---

## P2 — Medium

- [ ] **Collapse workspace read helpers to two entry points**
  - Why: 10+ ways to "load the workspace" forces every page/action to choose among near-duplicates.
  - Where: `src/server/workspace/workspace.ts:120-216` (`getWorkspace`, `viewerCanViewProject`, `requireFinding`, `requireRemediationForFinding`, `findingById`, `controlById`), `src/server/workspace/project-runtime.ts:39-67` (`getProjectRuntime`), `src/server/workspace/db.ts:8-10` (`loadProjectDb`), `src/server/workspace/active-project-page.ts:13-23` (`loadActiveProjectPage`), `src/server/workspace/project-rows.ts:25-84`, `packages/db/src/workspace-load.ts:42-241` (4 loaders: `loadTenancyDb`, `loadProjectWriteDb`, `loadProjectAssessmentDb`, `loadProjectRuntime` + `loadEvidenceWindow`).
  - Current: tenancy vs runtime split is documented and good, but spread over 6 files; `requireFinding`/`requireRemediationForFinding` duplicate `findingById`/`remediationForFinding` with different data sources (DB vs slice).
  - Problem: onboarding cost; easy to pick the uncached/direct variant and add a query per page section.
  - Change: expose exactly two cached reads — `getWorkspace()` (tenancy only) and `getProjectRuntime(projectId, opts)` — plus the write helpers. Demote the rest to internal: `loadProjectDb`/`active-project-page` become one-line delegates or are inlined; slice-lookup helpers (`findingById`, `remediationForFinding`) move next to the write helpers that use them. Document the two-entry rule in `architecture.md`.
  - Boundary: pages depend on 2 functions; loaders stay in `packages/db`, composition in `workspace/`.
  - Impact: fewer imports to choose from; request query count becomes predictable.
  - Risk: low

- [ ] **Thin out app pages behind application-service functions**
  - Why: 300-line pages duplicate loader composition, filtering, clustering, and pagination logic.
  - Where: `src/app/(app)/findings/page.tsx:50-335`, `src/app/(app)/findings/[id]/page.tsx:1-317`, `src/app/(app)/dashboard/page.tsx:1-319`, `src/app/(app)/evidence/page.tsx:1-317`, `src/app/(app)/requirements/page.tsx:1-279`.
  - Current: pages directly compose `loadActiveProjectPage` + `getProjectRuntime` + `countFindingsByStatus` + `parseFindingListParams` + `clusterFindings`/`prioritizeClusters` + pagination. This is correct Next.js colocation but repeated per page.
  - Problem: adding a list feature (e.g. new filter) touches page + `filter-params` + component; dashboard/findings/requirements each re-derive "open findings in scope" differently (`findingsInScope` vs `projectScopedSlice` vs tab counts).
  - Change: no new layer/framework. Add small `server/workspace/project-view.ts`-style loaders (e.g. `getFindingsView(projectId, params)`, `getDashboardView(projectId)`) that return exactly what the page renders. Pages become param-parse → one loader → render. Keep components as-is.
  - Boundary: data-shaping moves out of `src/app` into `src/server`; `src/app` keeps routing + rendering.
  - Impact: page diffs shrink; "open in scope" logic lives once; debugging a request starts at one function.
  - Risk: low

- [ ] **Separate analysis-core scan orchestration from engines**
  - Why: `analysis-core` is the best-isolated package, but scan orchestration and engine details are interleaved; the 108-file `runtime/` subtree dominates.
  - Where: `packages/analysis-core/src/scan.ts`, `merge-findings.ts`, `check-authority.ts`, `check-registry.ts`, `jsx-a11y-scan.ts`, `runtime/scan.ts`, `runtime/` (108 files), `checks/` (17 files), `catalog/` (22 files).
  - Current: `scanProject`/`scanChangedFiles` + `mergeRawFindings` + `filterAstFindingsForAuthority` + `dedupeRuntimeFindings` form an implicit pipeline invoked from `src/server/assessment/assessment.ts`; runtime probes (`runtime/custom-checks/*`) share utils with AST checks (`parse.ts:56-190`, `jsx-primitives.ts`).
  - Problem: engine replaceability (e.g. swap axe version, drop linkinator) requires tracing server + core + runtime; authority lists risk duplication between `check-authority.ts` and catalog `checkId` wiring (`guidance.ts`).
  - Change: document and enforce `scan.ts` as the sole orchestration entry (AST → runtime → merge → dedupe) with engines behind a `RuntimePageScanner`-style interface (already started in `assessment.ts:22-24`); keep shared AST utils (`parse.ts`, `jsx-primitives.ts`, `a11y-aria.ts`) as leaves. No new packages. Add a package README naming the 4 stages.
  - Boundary: engines depend on shared leaves; orchestration depends on engines; server depends only on orchestration.
  - Impact: replacing an engine touches one directory; authority changes stay in one list.
  - Risk: low (mostly documentation + import discipline)

- [ ] **Centralize runtime config/env and infra singletons**
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

- [ ] **Remove barrel/file duals (`display`, `filter-params`, `action-state`)**
  - Why: `src/core/display.ts` + `src/core/display/`, `src/core/filter-params.ts` + `src/core/filter-params/`, `src/core/action-state.ts` + `src/server/action-state.ts` triple the guesswork for one import.
  - Where: `src/core/display.ts` vs `src/core/display/*.ts`, `src/core/filter-params.ts` vs `src/core/filter-params/*.ts`, `src/core/action-state.ts:11-25` vs `src/server/action-state.ts:19-44`, `src/server/actions/shared.ts:1-100` + `refresh-routes.ts:1-20`.
  - Current: barrels re-export or partially duplicate directory contents; `ActionState` type vs runtime split is undocumented at the import site.
  - Problem: minor but daily friction; import-sort churn.
  - Change: one file or one directory per module, not both. Keep `display/` and `filter-params/` directories, delete the same-named flat files (or keep flat files only as `index.ts`-style re-exports — pick one convention repo-wide). Add a one-line doc comment on `core/action-state.ts` pointing at `server/action-state.ts`.
  - Boundary: no responsibility moves; import graph only.
  - Impact: fewer duplicate import paths; cleaner graft/call graphs.
  - Risk: low

- [ ] **Merge finding-presentation helpers (`finding-priority`, `finding-cluster`, `finding-act`)**
  - Why: three modules slice one concern (which finding to show first and what CTA to render) with overlapping inputs.
  - Where: `src/core/finding-priority.ts:1-376`, `src/core/finding-cluster.ts`, `src/core/finding-act.ts:52-215`, `src/core/assessment-helpers.ts:1-105`, `src/components/findings/finding-next-step-panel.tsx:1-264`.
  - Current: pages call `clusterFindings` + `prioritizeClusters` + `findingAct` separately; `finding-act` ban in assessment pipeline is ESLint-enforced (`eslint.config.mjs:117-134`) — good — but the trio's inputs (`FindingActInput` vs cluster keys) overlap.
  - Problem: adding a sort/beat rule touches 2–3 files + panel component.
  - Change: keep the UX-policy/server split. Within `src/core`, consolidate to `finding-priority.ts` (ordering) + `finding-act.ts` (CTA beats), folding `finding-cluster.ts` types into priority or documenting why the split exists. No behavior change.
  - Boundary: presentation policy stays in `src/core`, out of `src/server/assessment`.
  - Impact: one place per presentation question.
  - Risk: low

- [ ] **Isolate dev/e2e special-casing from prod request paths**
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
