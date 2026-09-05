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

## P0 — Critical

### P0-1 · Human decisions on findings/remediations can be silently reverted by a stale webhook assessment (successor of the old P0-2) — _size L_

**What is wrong.** The worker loads the project slice **before** the scan and outside
its persist transaction (`src/server/assessment-worker.ts:80-91,112-137`). When the
assessment commits, `applyAssessmentPayload` unconditionally upserts any finding the
scan mutated relative to that _stale_ load. `upsertFindings` is a full-row overwrite
with no version check (`packages/db/src/repo/findings.ts:15-26`; same for
`remediations.ts`), and `Finding` has **no `updatedAt` field at all** — only
`detectedAt` (`contract/finding-types.ts:161-184`) — so the requirements stale-guard
mechanism (`requirements.ts:16-27`) cannot be reused as-is. Concretely: user dismisses
finding F while a push-triggered assessment is mid-scan; the scan re-detects the same
violation (still present in the code), updates F in place (assessment.ts matching loop
mutates `existing` fields), and the apply writes F as `open` over the dismissal. The
dismissal evidence remains, but the row is open again, and requirement status —
independently guarded — may already say `passed`, leaving an open finding under a
passed requirement until the next scan.

**Why it matters.** This is the production pattern (continuous monitoring + UI on the
same project). A human compliance decision is silently discarded, and the workspace
renders contradictory compliance state. Evidence is append-only so nothing is destroyed,
but the presented state is wrong and a reviewer can act on it.

**What should change.** Give findings (and remediations, which share the failure) the
same stale-write protection requirements have: add `updatedAt` to the `Finding` /
`Remediation` payloads, bump it on every write (mappers + actions), and have
`upsertFindings` / `upsertRemediations` accept `loadedUpdatedAtById` and skip rows whose
DB copy is newer — mirroring `requirements.ts:16-52`. The worker then passes its
job-start values. No schema migration needed (`payload` is JSONB). Alternative if a
payload field feels heavy: a dedicated `updated_at` column on `findings`/`remediations`.
Also consider having the worker **re-load the slice inside the persist transaction
before diffing** (cheap: one indexed read per table) instead of trusting a snapshot
taken minutes earlier.

**Files.** `src/server/assessment-worker.ts:80-137`, `packages/db/src/repo/findings.ts`,
`packages/db/src/repo/remediations.ts`, `packages/db/src/repo/apply.ts:36-53,110-134`,
`packages/analysis-core/src/contract/finding-types.ts:161-184`,
`packages/db/src/repo/requirements.ts:16-52` (the pattern to mirror).

**Definition of done.** A live-Postgres regression test: worker apply with a stale slice
racing a concurrent `withTargetedProjectWrite` dismissal of the same finding — the
dismissal survives and the finding row is not overwritten. Requirements guard logic is
exercised by the same test.

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

### P2-4 · The customer CLI is not a self-contained package — _size M_

**What is wrong.** `packages/check/` contains only `bin.js` + `testdata/`; the actual
CLI source lives at `src/cli/check.ts` and is bundled by
`scripts/build-check.mjs:11-42` with esbuild aliases `"@" → src` and
`"@complyloop/analysis-core" → packages/analysis-core/src` — the publishable artifact's
build depends on the app repo's layout, and the externals list must be kept in sync with
`packages/check/package.json` by hand (documented at `build-check.mjs:24-30`).
`AGENTS.md` describes the CLI as living in `packages/check/`.

**Why it matters.** Any app-side refactor (moving `src/cli`, renaming aliased modules)
silently breaks the published package; the doc map points at the wrong home.

**What should change.** Fine for today (documented, documented fallback to tsx source).
When publish automation or a second consumer appears: move `cli/` under
`packages/check/src/` and give the package its own analysis-core dependency (or accept
bundling from source with a CI smoke — `check-pack.smoke.test.ts` exists). Update
`AGENTS.md`'s "Where code lives" line meanwhile.

**Files.** `packages/check/bin.js`, `src/cli/check.ts`, `scripts/build-check.mjs`; `AGENTS.md`.

### P2-5 · The riskiest procedural code is outside the default unit gate — only the opt-in Postgres job covers it — _size M_

**What is wrong.** The coverage gate excludes `src/server/workspace.ts`, every
`packages/db/src/repo/*` file, `schema.ts`, `client.ts`, `workspace-load.ts`,
`postgres-queries.ts`, and `report.ts` (`vitest.config.mts:50-77`) — the write path.
The integration suite (`persist-project-slice.integration.test.ts`,
`workspace.integration.test.ts`, constraints, evidence-append-only, alerts-upsert) is
the only net and _is_ wired into CI's `db-integration` job with a real Postgres
(`ci.yml:50-76`) — so coverage exists, but it's opt-in per suite and was previously
tracked as a gap (old P1-7; the repo/apply + mappers + write-lock files are now in the
gate — good progress).

**Why it matters.** A broken `workspace.ts` or `repo/apply.ts` passes `npm run test`
locally; only the `test:db` script or CI catches it. Contributors who don't run the DB
suite locally ship write-path regressions.

**What should change.** Lift the pure logic out of the excluded files into the gate
(e.g. `changedEntities`, snapshot/diff composition, scoping filters — pure functions
with unit tests), and/or add a CI guard that PRs touching `packages/db/src/repo/**`,
`workspace*.ts`, or `repo/apply.ts` must run `test:db` (path filter on the workflow).

**Files.** `vitest.config.mts:35-78`, `.github/workflows/ci.yml:50-76`,
`packages/db/src/repo/apply.ts`, `src/server/workspace.ts`.

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

---

## P3 — Low (do not start without a trigger)

- **P3-1 · `frameworkAdapters` registry is half-realized.** _(size S)_ `wcag` registers
  `controls: []` and no `guidanceFor`; `guidanceFor` returns the first adapter with
  guidance (`packages/adapters/src/registry.ts:24-36,56-63`). Fine for one real
  framework — keep. Do **not** build the "Adding a framework" ceremony
  (`docs/ai/architecture.md:233-237`) further until a second framework exists.
- **P3-2 · AI gateway shell duplicated ×3.** _(size S)_ `src/ai/{explainer,remediation,fix-propose}.ts`
  repeat the same available-check + `generateObject` + try/catch + `aiWarn` + null shell
  (verified in `explainer.ts:46-84` and `remediation.ts:1-10,35-36`). `verified-fix.ts`
  is **not** a fourth copy — it is a patch-application pipeline that receives
  `propose()` by injection (`src/ai/verified-fix.ts:38-43`), which is the better
  pattern. Prompts legitimately differ; extract a ~20-line `aiCall(schema,
buildPrompt)` helper when a fourth call site appears.
- **P3-3 · `report-html/audit.ts` + `engineering.ts` have no colocated tests.** _(size S)_
  They're inside the coverage gate, so untested LOC drag thresholds; tracked with P1-2's
  shared-IR work.
- **P3-4 · Docs drift on coverage excludes.** _(size S)_ `docs/ai/architecture.md:247` says the
  gate excludes `write-lock` and `repo/**`; `vitest.config.mts:50-77` actually keeps
  `repo/apply.ts`, `repo/mappers.ts`, `write-lock.ts`, `postgres-evidence.ts` **in** the
  gate (only the individual `repo/*.ts` files listed are out). Update the doc. (Stale
  docs are a defect in this repo.)
- **P3-5 · Repeated pushes re-mint regression alerts.** _(size M)_ `collectRegressionAlerts`
  (`assessment-worker.ts:30-74`) creates a fresh UUID alert per regressed control per
  assessment — N pushes for the same unfixed regression = N alert rows. Verify this is
  intended (it may be — each assessment is a separate event); if not, dedupe by
  (controlId, projectId) latest-wins.
- **P3-6 · "domain imports only the contract" is documented but not lint-enforced.** _(size S)_
  The package rule (`eslint.config.mjs:71-107`) blocks app/server/adapters/components/
  AI and `../src`, but `packages/domain` may still import
  `@complyloop/analysis-core/anything`. Add the same contract-only regex used for
  `src/core` (`:47-51`) for `packages/domain` — one rule, currently pure convention.
- **P3-7 · `markAlertReadAction` is the lone direct-repo write.** _(size S)_ It bypasses the
  write wrappers (own `getDrizzle` transaction, no lock) and loads the **full**
  workspace to touch one alert row (`actions/alerts.ts`). Functionally safe
  (idempotent `onConflictDoUpdate`; the worker never writes the same alert id) — keep
  the direct-repo style, but fetch only what RBAC needs, and document it as the
  canonical targeted-repo exception.
- **P3-8 · Divergent "complex table" definitions.** _(size S)_ `checks/table-summary.ts:22-36`
  defines a private `spanExceedsOne` (only `colSpan`/`colspan`, `parseInt` on string
  values, `/\d+/` on JSX expressions) and injects it into `isComplexDataTable`
  (`:47`), re-implementing the built-in default at
  `checks/heuristic-utils.ts:200-213` (all four span attrs, `stringValueOf` only). The
  same table can be "complex" for `table-summary` and not for `layout-table-markup`.
  Unify on one helper in `heuristic-utils.ts`.
- **P3-9 · html-validate rule set maintained in two files with no equality test.** _(size S)_
  `runtime/html-validate-map.ts:20-28` and `runtime/html-validate-runtime.ts:26-34`
  list the identical 7-rule set; adding/removing a rendered rule edits both, and
  `html-validate-map.ts:12-13` asserts an invariant ("every rule must map to a check
  id") no test checks. Add a one-line test asserting
  `Object.keys(RENDERED_RULES) == Object.keys(HTML_VALIDATE_TO_CHECK)`.
- **P3-10 · Runtime engine error containment is inconsistent.** _(size S)_ Custom probes run bare
  (one throwing `page.evaluate` fails the whole audit — `runtime/custom-checks/index.ts:75-128`),
  html-validate failures are caught and treated as non-fatal (`scan.ts:271-276`), axe
  failures kill the scan, and individual probes disagree internally
  (`forced-colors.ts:13` wraps, `text-spacing-runtime.ts:6-68` doesn't). Define (and
  document) one resilience contract per engine class: probes should be per-probe
  caught, like html-validate.
- **P3-11 · Heuristic-downgrade policy is duplicated across the two runtime adapters.** _(size S)_
  "Runtime hits for heuristic ids become warnings" is implemented twice:
  `runtime/findings.ts:92-100` (axe) and `runtime/custom-checks/index.ts:49-55`
  (Playwright). It feeds `deriveRequirementStatus`; a one-sided change silently alters
  requirement outcomes for only one engine. Extract one shared helper.
- **P3-12 · `foldAccents`/`matchesMultilingual` byte-copied into page.evaluate ×4.** _(size S)_
  `patterns/multilingual.ts:10-16` is the canonical home, but identical inline copies
  exist at `runtime/applicability.ts:60-66`, `runtime/custom-checks/error-prevention.ts:27-33`,
  `runtime/custom-checks/captcha-alternative.ts:13-19`, and
  `runtime/custom-checks/accessible-auth-enhanced.ts:13-19`. Unlike the documented
  `*-math.ts` split this is undocumented; the `fn.toString()` reuse precedent exists at
  `html-validate-runtime.ts:187-191`. Favor the `toString`-injection pattern when a
  fourth copy lands.
- **P3-13 · `audio-description-track` ≈ `audio-description-or-alt` (~90% identical).** _(size S)_
  Same `<video>` visit pass, same `DESCRIPTION_KINDS`, same finding shape; only the
  transcript-adjacency rule and reason differ (`checks/audio-description-track.ts` vs
  `checks/audio-description-or-alt.ts`). The criterion split is intentional, the code
  isn't — one parameterized helper (track kinds + transcript acceptance + reason).
- **P3-14 · DOM-finding construction duplicated ×3.** _(size S)_ `snippetOf`/`selectorOf`
  (incl. the same `197…` truncation) exist at `runtime/findings.ts:72-80` and
  `runtime/custom-checks/index.ts:33-41`; `html-validate-runtime.ts:296-303` builds a
  third `dom` location inline. The merge/dedupe layer is centralized; the per-engine
  translation into `RawFinding` is not. Extract one `rawFindingFromDom` helper.

---

## "Could this be simpler?" — direct answers

1. **In-memory workspace + diff-persist — worth it?** Partly. The _read_ side (one
   consistent per-request workspace, memoized) is a genuine simplification and should
   stay. The _write_ side should converge on **targeted repo writes + stale guards**
   (P0-1, P1-3); the whole-slice stringify-diff is machinery that fights back (can't
   delete, order-sensitive, 4 copies) and is only still needed by four bounded actions.
   Do **not** build more machinery on top — no canonical-hash layer, no event log.
2. **One analysis-core package (contract + AST + runtime engines)?** Yes for MVP —
   the lazy `await import` of runtime engines already decouples publish cost. Note the
   real cost of a future split: `contract/` currently leaks into the engine graph via
   `../types.ts` (P2-6), so a contract-only package would need those types moved
   first. Split only when an outside consumer appears.
3. **`src/core` vs `packages/domain`?** Keep the lint-enforced split; `domain` stays
   types + ports. **The old "display maps belong next to UI" advice (old P2-1) is now
   wrong**: `labels.ts`, `format-datetime.ts`, `status-tone.ts` are imported by server
   report code (`report.ts:8-12`, `report-html/shared.ts:3`) _and_ client components;
   `src/core` is the only layer both sides may import. Moving them would create a
   server→components boundary violation. Keep them where they are.
4. **Two report builders?** Keep both outputs, but one shared section composer
   (P1-2). Writing the same sections twice is exactly the "extra machinery" that
   costs every change.
5. **Adapter registry with a half-empty WCAG adapter?** Keep as-is (P3-1). WCAG
   reusing the RGAA catalog is simpler than a second catalog — the abstraction earns
   its keep the day a genuinely separate framework arrives.
6. **CLI in `src/cli`, bundled from app source?** Deliberate and documented
   (P2-4); it buys one source of truth for scan logic. Revisit only when publish
   automation needs it.

## Decisions to keep (not debt)

- JSONB domain payloads + a few indexed columns — proportionate for one client project;
  the `payload` JSONB also means adding `updatedAt` to findings (P0-1) needs no migration.
- Evidence append-only without FKs — protects the audit trail by constitution.
- Catalog seeded from adapters on deploy, never rewritten per action.
- Worker: durable jobs, lease recovery, 3 attempts, serial per project, ephemeral clones.
- JSX-only scoped re-scan on re-assessment (cheap monitoring, documented limitation).
- AI never sets statuses; `aiWarn`/error-ref pattern on failures.
- Runtime engines lazy; html-validate runtime-only (the CLI stays browserless AST-only).
- `markAlertReadAction`'s direct-repo write — targeted, idempotent, and the worker never
  touches the same alert id (P3-7 documents it).
- Display maps in `src/core` — shared presentation vocabulary for server reports _and_
  client components (see answer 3).

## Definition of done (remaining P0/P1)

1. **P0-1:** findings/remediations carry `updatedAt`, upserts take `loadedUpdatedAtById`
   and skip newer rows; live-Postgres regression test proves a concurrent dismissal
   survives a stale worker apply; requirement guard stays.
2. **P1-1:** project lock acquired before the load in both interactive writers; org
   writes take an org-scoped lock with the same guard; integration tests assert
   serialized load→write visibility.
3. **P1-2:** one shared report section composer used by both formats; `audit.ts` /
   `engineering.ts` have colocated tests.
4. **P1-3:** single `changedEntities` helper shared by all four sites; remaining
   `withProjectWrite` users migrated or the diff retired; `withOrgWrite` reuses the
   helper.
5. Docs updated in lockstep when any of the above lands (stale docs are a defect).

## Completed

Carried forward from the deleted document (each was implemented and verified in its
session; details preserved from the 2026-09-05 record) plus new completions verified
this session. Item IDs are the originals.

- **P0-1 · Alert rows cannot be updated through the slice-write model.** `insertAlerts`
  is a true conflict-upsert; `markAlertRead` reuses it; live-Postgres regression test
  (`packages/db/src/alerts-upsert.test.ts`).
- **P1-1 (old) · Hot-path actions persist targeted rows.** `withTargetedProjectWrite`
  (`workspace.ts:352-404`) + scoped loader (`workspace-load.ts:221-262`) — used by
  remediation dismiss/approve/verify, requirements mutations, and remediation-verify
  (targeted refresh). Remaining work moved to **P1-3** (change-detection consolidation,
  retire the remaining whole-slice users).
- **P1-2 (old) · Same request loaded the workspace 2–3 times.** Enqueue records
  evidence inside one write; the worker loads the project slice once.
- **P1-3 (old) · Persistence styles undocumented.** "Persistence ownership rule" now in
  `docs/ai/architecture.md` (slice = upserts + evidence inserts; structural entities via
  repo modules).
- **P1-4 (old) · Job status/trigger/shape triplicated.** Single-sourced in
  `packages/domain/src/assessment-jobs.ts`, feeding DB CHECK constraints, server
  constants, and client zod enums; generated constraint SQL byte-identical.
- **P1-5 (old) · Engines statically entangled.** playwright/html-validate load lazily;
  `scripts/build-check.mjs` documents externals.
- **P1-7 (old) · Persistence coverage.** **COMPLETED (verified this session)**:
  `repo/apply.ts`, `repo/mappers.ts`, `write-lock.ts` are in the unit gate;
  live-Postgres integration suite (`persist-project-slice.integration.test.ts`,
  `workspace.integration.test.ts`, constraints, evidence-append-only, alerts-upsert)
  runs in CI's `db-integration` job against a real Postgres service
  (`.github/workflows/ci.yml:50-76`). Remaining: P2-5.
- **P2-2 (old) · RawFinding/Finding provenance drift.** Compile-time assignability
  canary in `contract/finding-raw-assignability.test.ts`.
- **P2-4 (old) · Dead code and stale doc references.** `evidenceRecordsToInsert`
  removed; AGENTS.md doc map fixed.
- **P2-5 (old) · Worker rewrote the whole project slice.** **COMPLETED as of `3f10a71`
  (verified this session)**: `applyAssessmentPayload` diffs against the job-start
  `loadedSlice` (`repo/apply.ts:36-53`; worker passes it at `assessment-worker.ts:117-129`).
- **P3-2 (old) · `JSON.stringify` row comparison key-order invariant.** Documented at
  both diff sites, pinned by `packages/db/src/repo/mappers.test.ts`.
- **P3-4 (old) · `postgres-queries.ts` naming drift.** Docs corrected (it is Drizzle).
- **P3-6 (old) · Two deliberate-violation fixtures.** Both `Bad.tsx` files carry
  comments; do not dedupe.
