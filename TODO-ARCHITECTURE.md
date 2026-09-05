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
  constrained, live-Postgres tests). Reports `audit.ts`/`engineering.ts` are the only
  untested HTML surface (tracked P3-3).
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

## P1 — High

### P1-2 · Report section composition is written twice (markdown + HTML) — _size L_

**What is wrong.** `src/server/report.ts` (295 LOC, engineering + audit markdown) and
`src/server/report-html/` (`shared.ts` 430 LOC — mostly CSS — plus `audit.ts`,
`engineering.ts`, `requirements-section.ts`) compose the **same sections** (header,
summary counts, requirement table, finding cards, evidence trail) in two formats.
Only `ReportInput` + `countRequirementsByStatus` are shared; clustering, scoping, and
section layout are re-implemented per format. `audit.ts`/`engineering.ts` have **no
colocated tests** (only `shared.test.ts`).

**Why it matters.** Any report change — a new evidence kind, a status label, a scope
rule — must be made twice. The outputs drift exactly where compliance reviewers read
them. Reports are the product's external compliance artifact; this is the highest-drift,
lowest-test surface in `src/server`.

**What should change.** One structured section model built once (a `ReportModel` of
header/summary/finding-cards/requirement-table/evidence-trail), with markdown and HTML
as thin renderers — the IR already exists in embryo (`ReportInput`). At minimum, lift
the section-composition logic into `report-html/shared.ts` and add colocated tests for
`audit.ts` and `engineering.ts` (they're in the coverage gate, so untested LOC drag
thresholds today).

**Files.** `src/server/report.ts`, `src/server/report-html/{shared,audit,engineering,requirements-section}.ts`.

**Definition of done.** A new evidence kind renders in both formats through one
composer; `audit.ts`/`engineering.ts` have component tests.

### P1-3 · Change detection is re-implemented 4×; the whole-slice diff model is still the default for non-hot actions — _size L_

**What is wrong.** The canonical-order `JSON.stringify` comparison appears in
`repo/apply.ts:61-76` (`changedEntities`), `src/server/workspace.ts:202-227`
(`withProjectWrite` whole-slice snapshots + project-row compare), `:299-345` (targeted
payload collection), and `:431-460` (`withOrgWrite`) — four implementations of the same
clone/stringify-diff idea, each with its own shape. Meanwhile `withProjectWrite` (full
slice load + `structuredClone` + stringify) is still used by `actions/pr.ts:101`,
`actions/ai-fix.ts:71`, `actions/remediation-ai.ts:43,77`, and
`actions/assessment.ts:23` (enqueue), and `markAlertReadAction` is a fifth, lockless
direct-repo style.

**Why it matters.** The stringify-diff is the most fragile piece of persistence (depends
on canonical mapper key order — pinned only by `repo/mappers.test.ts`); four copies mean
a fix lands in one and not the others. Keeping two interactive write models
(slice-diff vs targeted) means every future action picks a style by momentum, not by
load.

**What should change.** Extract **one** `changedEntities(before, after)` helper (the
`apply.ts` one is the natural home; export it) and use it everywhere, deleting the
workspace-local copies. Then migrate the remaining `withProjectWrite` users to targeted
or direct-transaction scopes where the mutation is bounded (assessment enqueue touches
one job row + rate limit + evidence; PR approval touches one remediation). Once no
caller needs the whole-slice diff, retire `withProjectWrite`'s stringify machinery. Do
**not** build a canonical-hash layer on top — one shared helper is the simplest
correct endpoint.

**Files.** `packages/db/src/repo/apply.ts:61-76`, `src/server/workspace.ts:202-227,260-345,431-460`,
`src/server/actions/{pr.ts,ai-fix.ts,remediation-ai.ts,assessment.ts,alerts.ts}`.

---

## P2 — Medium

### P2-7 · Check-id governance is one-way; a reverse coverage gap and a rotting test copy

**What is wrong.** Enforcement is unidirectional: `satisfies readonly CheckId[]` verifies
each manual list is _within_ the union; `catalog-coverage.test.ts:70-86` checks
catalog→(engines∪site-level). Nothing checks the reverse — that **every** union member
is reachable from the catalog (a check id in the union but in no catalog control is
silently dead across the product). In adapters, `wcag/presets.ts:19-80`
(`preset-wcag-aa`) hand-lists ~140 `ctl-*` strings with no `satisfies` binding to the
catalog (unlike `preset-wcag-full` at `:12`) — a typo silently drops a control from
every WCAG-AA assessment.

**Why it matters.** Silent-drift failure modes in the product's core vocabulary: an id
that exists but is unreachable, or a preset that omits a control, changes assessment
scope with no error.

**What changed (2026-09-05, partial).** `check-authority.test.ts`'s hardcoded
`RUNTIME_ONLY` re-list (40 of 57 ids) was replaced with a loop over the source
`RUNTIME_ONLY_CHECK_IDS` — the copy can no longer rot, and the test now guards
`keepOpenWhenRuntimeScanSkipped` for the full set. **Still open:** the reverse canary
(the `CheckId` union is a type, not a runtime value, so it needs either a
type-level/catalog-`as const` equality assertion or a codegen step) and the WCAG-AA
preset derivation/typing.

**What should change (remaining).** Type `FrameworkPreset.controlIds` as
`readonly CheckId[]` (or add `satisfies`) in `adapters` and derive the WCAG-AA list from
the catalog like the full preset does. Add a reverse reachability guard once the union
is enumerable (type-level equality test or forcing `rgaaControls` to `as const`).

**Files.** `packages/analysis-core/src/types.ts:5-143`, `packages/analysis-core/src/check-authority.test.ts`,
`packages/adapters/src/wcag/presets.ts:12,19-80`, `packages/adapters/src/types.ts:14`,
`packages/adapters/src/rgaa/catalog-coverage.test.ts:70-86`.
