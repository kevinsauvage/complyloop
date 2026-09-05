# TODO — Architecture

Critical review of the current architecture **against the actual code** (not the docs).
Recreated 2026-09-05 after `TODO-ARCHITECTURE.md` was deleted in `3f10a71`
("remove TODO-ARCHITECTURE.md and enhance architecture documentation"). All claims
below were re-verified against the current tree (branch `main`, clean) in this session;
the write model changed materially since the deleted document (`withTargetedProjectWrite`,
job-start-slice diffs, per-project advisory locks, live-Postgres integration suite in CI).
Completed work is recorded in [Completed](#completed) so the audit log survives.

## How to read this

Each item answers three questions in order:

1. **Could this be simpler?**
2. **Is this abstraction actually justified?**
3. **Is this responsibility in the right place?**

Priorities: `P0` = can silently falsify compliance state under the production
multi-action pattern (webhook re-assessment + concurrent human decisions). `P1` =
structural cost/risk paid on every write today, or a fix that is cheap now and
expensive later. `P2` = maintainability/consistency debt. `P3` = polish, naming,
speculative work (do not start without a concrete trigger).

**Size** (`S`/`M`/`L`/`XL`) on each item = implementation effort, not impact:
`S` ≤ half a day, `M` ≈ a day, `L` = multi-day, `XL` = structural (design decision +
migration). Rough planning estimates; the priority class is the impact signal.

---

## What is strong (verified, keep)

- **Layer boundaries are real and lint-enforced.** `src/core` may import only
  `@complyloop/analysis-core/contract/*` + `@complyloop/domain/*`
  (`eslint.config.mjs:30-66`, contract-only regex at :47-51); `packages/db|domain|adapters`
  cannot reach into `src/`, server, app, components, or AI (`eslint.config.mjs:71-107`).
  Grep-verified: **no client component imports server or AI code**.
- **Status derivation is single-sourced** (`contract/requirement-status.ts`); the
  authority classifier has documented precedence `site_level → runtime_only →
heuristic → composition_sensitive → standard` (`check-authority.ts:184-207`) with
  overlap tests. Check-id lists are compile-checked with `satisfies readonly CheckId[]`.
- **Worker and job model are sound.** SKIP LOCKED claim, 30-min lease with recovery,
  3 attempts + exponential backoff, serial per project, per-project advisory lock at
  persist (`assessment-worker.ts:112-137`), webhook idempotency via
  `assessment_jobs.idempotency_key` — never clones/scans in the request path.
- **Hot-path actions migrated to targeted writes.** `withTargetedProjectWrite`
  (`src/server/workspace.ts:352-404`) loads and persists only touched rows and is used
  by remediation dismiss/approve/verify (`actions/remediation.ts`), requirements
  mutations, and `remediation-verify` (which also uses the targeted
  `refreshRequirementStatusesForControls` instead of a full refresh). The job-start
  slice diff (`repo/apply.ts:36-53`) means the worker also persists only changed rows.
- **Encoded stale-write defense exists for requirements.** `upsertRequirements`
  skips rows whose DB `updatedAt` is newer than the writing load
  (`packages/db/src/repo/requirements.ts:16-27,38-52`), applied on both the diff path
  and the targeted path.
- **Action wiring is uniform** (`runActionMessage` + `parseForm`/`parseInput` +
  `PublicError` + `requireOnActive`/`refresh`); zod schemas live next to each
  action/route, and clients parse the same payload shapes from `src/core/boundary.ts`.
  `alerts.ts` is the one documented exception (direct repo write — see Decisions).
- **Evidence is append-only by constitution** (no FKs, insert-only, DB-trigger
  constrained, live-Postgres tests). Report HTML and markdown share one `ReportModel`.
- **CI is strong**: quality (lint/typecheck/unit/coverage/build), `db-integration`
  (real Postgres service → migrate + `test:db`), e2e against a fixture GitHub API,
  docker-image import smoke, bundle-analysis artifact (`.github/workflows/ci.yml`).
- **Component layer is disciplined**: small feature folders (`findings/`, `dashboard/`,
  `requirements/`, `evidence/`), colocated tests on ~40 of 60+ components, shadcn
  `ui/` primitives, no cross-feature copy-paste visible at file level.
- **Engine layer holds up under adversarial sampling.** The 58 AST checks are uniform
  (10 sampled across attributes/media/structure/text — shared parsing centralized in
  `parse.ts`, `heuristic-utils.ts`, `jsx-primitives.ts`, `patterns/multilingual.ts`);
  the authority classifier is single-sourced with a heuristic∩runtime-only
  disjunction test; the engine maps follow one pattern
  (`Record<string, CheckId>` + lookup + `mappedCheckIds()`) and feed the cross-package
  coverage tests; scan orchestration is genuinely shared between the CLI and the app
  (both call `scanProject`/`scanChangedFiles` — `detectChanges` is app-only);
  `domain` is clean types + one port + zero logic; error-to-user mapping is
  centralized (`classifyRuntimeScanError` + `PublicError`, no raw paths/query strings
  leak); the `CheckId` union and catalog `checkId`s both hold at 138; no dead
  production exports found.
- **Runtime engines are lazy** (`await import` of playwright/html-validate; externals in
  `next.config.ts:10-15`), CLI stays browserless AST-only, evidence pages bypass the
  workspace slice (correct: they paginate).

---

## Open

None. Remaining items were P3 polish and are not listed here.

---

## Completed

### P1-2 · Report section composition is written twice — _done 2026-09-05_

`composeEngineeringReport` / `composeAuditReport` in `src/server/report-model.ts`
build one IR; markdown (`report.ts`) and HTML (`report-html/{audit,engineering}.ts`)
are thin renderers. Evidence kinds are labeled in the composer. Colocated tests
live next to `audit.ts` and `engineering.ts`.

### P1-3 · Change detection re-implemented 4× — _done 2026-09-05_

`changedEntities` is exported from `repo/apply.ts` and used by targeted writes,
project-row compares, and org membership diffs. `withProjectWrite` is gone:
finding mutations use `withTargetedProjectWrite`, settings/enqueue use
`withProjectRowWrite`, `markAlertReadAction` uses `withProjectLock`.

### P2-4 · The customer CLI is not a self-contained package — _done 2026-09-05_

CLI source lives in `packages/check/src/`. analysis-core is a workspace
devDependency bundled by `packages/check/scripts/build.mjs`.

### P2-7 · Check-id governance is one-way — _done 2026-09-05_

`CHECK_IDS` is the runtime source of the `CheckId` union. Catalog coverage
asserts every id is reachable. WCAG AA/extra presets derive from the catalog
minus small extra-only / full-only sets validated by `catalogControlIds`.
