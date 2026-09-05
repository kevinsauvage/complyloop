# TODO — Architecture

Critical review of the current architecture **against the actual code** (not the docs).
Generated: 2026-09-05. Items completed were removed from the active list and are
recorded in [Completed](#completed-2026-09-05) so the work is auditable.
Remaining item IDs are unchanged from the original document.

## How to read this

Each item answers three questions in order:

1. **Could this be simpler?**
2. **Is this abstraction actually justified?**
3. **Is this responsibility in the right place?**

Priorities: `P0` = will corrupt/deny writes or falsify compliance evidence the moment
multi-user or multi-action patterns hit it. `P1` = structural cost/risk paid on every
request or action today. `P2` = maintainability/consistency debt. `P3` = polish,
naming, speculative work (do not start without a concrete trigger).

## What is strong (verified, keep)

- **Layer boundaries hold and are lint-enforced.** `src/core` imports only
  `@complyloop/analysis-core/contract/*` and `@complyloop/domain/*`
  (`eslint.config.mjs` `no-restricted-imports`); `packages/db|domain|adapters`
  import nothing from `src/`; `domain` imports only the contract. The dependency
  direction `contract → domain → {db, adapters, app}` in `docs/ai/architecture.md` is
  real, not aspirational.
- **Status derivation is single-sourced** (`contract/requirement-status.ts`) and the
  authority classifier is centralized with documented precedence
  (`check-authority.ts`); id lists are compile-checked with `satisfies readonly CheckId[]`.
- **The check harness is uniform.** ~58 AST checks share `parse.ts` primitives +
  `registry.ts`; the `runtime/custom-checks/*-math.ts` files are shared math, **not**
  copy-paste duplicates (verified by diff). The three rule→check-id maps
  (`jsx-a11y-map`, `axe-map`, `html-validate-map`) follow one pattern.
- **Action wiring is uniform** (`runActionMessage` + `parseForm`/`parseInput` +
  `withProjectWrite` + `refresh`, `PublicError` for user-facing failures, error-ref for
  the rest, `action-state.ts`). Evidence is append-only and constitutionally protected
  (no FKs, insert-only, constraints test). The worker (SKIP LOCKED claim, lease
  recovery, 3 attempts, serial per project) and webhook idempotency via
  `assessment_jobs.idempotency_key` are sound.
- **`src/core` is well-tested** and the coverage gate is meaningful for the
  in-memory surface it covers.

---

## P1 — High

### P1-1 · Every write loads, clones, and string-compares the whole project slice

**What is wrong.** `withProjectWrite` loads all requirements + findings + remediations +
alerts for the project (`packages/db/src/workspace-load.ts:37-73`), clones slices
(`structuredClone`), and diffs with `JSON.stringify` (`repo/apply.ts:46-58`,
`workspace.ts:204`). An “approve remediation” action pays O(project rows) in memory +
IO. The string-compare diff depends on canonical key order in the mappers — a mapper
that ever emits a derived/extra field causes phantom upserts of the whole row.

**Why it matters.** This is the first scaling ceiling (multi-tenant, projects with tens
of thousands of findings), and the diff mechanism is the most fragile part of the
persistence layer. At MVP scale it is _fine_ — the issue is that the docs present it as
the write model of record, so it will be extended, not replaced.

**What should change.** Hot-path actions (dismiss, approve, verify, exception set)
should persist **targeted rows** (the `repo/` layer already exists:
`update finding/remediation where id`, insert evidence, refresh only the affected
controls' requirements). Keep the slice model only for assessment apply (the worker
already bypasses the diff — `applyAssessmentPayload` persists everything atomically).
If the diff must stay, replace `JSON.stringify` with a canonical hash (the mapper
key-order invariant is now pinned by `packages/db/src/repo/mappers.test.ts`).

**Files.** `src/server/workspace.ts`, `packages/db/src/repo/apply.ts`,
`packages/db/src/workspace-load.ts`, `src/server/assessment-status.ts`.

### P1-6 · Reports are built twice: markdown and HTML, no shared section model

**What is wrong.** `src/server/report.ts` (engineering + audit markdown, 296 LOC) and
`src/server/report-html/` (`shared.ts` 430 LOC + `audit.ts` + `engineering.ts` +
`requirements-section.ts`) render the **same two report types** in different formats.
Only `reportInputForProject` + `countRequirementsByStatus` are shared; section layout,
clustering, and evidence rendering are written twice. `audit.ts`/`engineering.ts` have
no colocated tests (documented in `docs/ai/architecture.md`).

**Why it matters.** Any report change (a new evidence kind, a status label) must be made
twice; the two outputs will drift exactly where compliance reviewers read them.

**What should change.** Introduce one structured `ReportModel` (header/summary blocks,
finding cards, requirement table, evidence trail) built once in a shared module, then
two small renderers. At minimum, move the shared section logic into `report-html/shared.ts`
and add tests for both HTML builders.

**Files.** `src/server/report.ts`, `src/server/report-html/*`.

## P2 — Medium

### P2-1 · `src/core` mixes genuine product logic with presentation maps

**What is wrong.** `labels.ts`, `status-tone.ts`, `evidence-tone.ts`,
`badge-descriptions.ts`, `format-datetime.ts`, `runtime-coverage.ts` are pure display
mappings used only by components, while `rbac.ts`, `finding-act.ts`,
`finding-list-filter.ts`, `root-cause.ts`, `remediation.ts` are real product logic.
`packages/domain` is types + one port; the “product domain rules” live in `src/core`
by convention.

**Why it matters.** Two “core-ish” homes invite new helpers to land wherever is closest;
the display maps earn their framework-agnostic label only by accident.

**What should change.** Move display-only maps next to their consumers (keep them pure

- tested); keep `src/core` for decision logic. Do **not** merge `src/core` into
  `packages/domain` without a second consumer — the lint-enforced boundary is cheap and
  working.

**Files.** `src/core/labels.ts`, `status-tone.ts`, `evidence-tone.ts`,
`badge-descriptions.ts`, `format-datetime.ts`, `runtime-coverage.ts`.

### P2-3 · Personal-org provisioning runs on the read path of every page

**What is wrong.** `ensurePersonalOrgProvisioned` (`workspace.ts:98-121`) runs for every
signed-in request inside `getWorkspace`, doing a full workspace load + membership claim

- possible transaction, then `loadWorkspaceDbForViewer` loads again. (This is the
  remaining part of the old P1-2 after the action/worker double-loads were removed.)

**Why it matters.** Write-adjacent side effects on GET renders; doubles the load cost of
every page.

**What should change.** Provision on first authenticated write/action, or gate with a
cheap “already provisioned” flag/cookie.

**Files.** `src/server/workspace.ts`.

### P2-5 · Worker rewrites the whole project slice on every assessment

**What is wrong.** `applyAssessmentPayload` upserts **all** findings/remediations/
requirements for the project on every webhook-triggered assessment
(`assessment-worker.ts`, `repo/apply.ts:28-38`) — O(project) writes per push.

**Why it matters.** Cost, not correctness (one transaction, serial per project). A
webhook-heavy project pays full-table writes on every push.

**What should change.** The diff machinery already exists — compare the fresh in-memory
Db against the previously loaded slice and persist only changed rows (reuse
`persistProjectSliceDiff` semantics, with assessments/evidence appended).

**Files.** `src/server/assessment-worker.ts`, `packages/db/src/repo/apply.ts`.

---

## P3 — Low (do not start without a trigger)

### P3-1 · `frameworkAdapters` registry abstraction is half-realized

`wcag` registers `controls: []` and no guidance; `guidanceFor` returns the first adapter
with guidance (`registry.ts:24-36,56-63`). Fine for one real framework — keep as-is;
do **not** build the “Adding a framework” ceremony (`architecture.md`) any further
until a second framework actually exists.

### P3-5 · AI gateway plumbing copied 4×

`explainer.ts`, `remediation.ts`, `fix-propose.ts`, `verified-fix.ts` repeat the same
credential check + `generateObject` + try/catch + `aiWarn` shell. Prompts legitimately
differ; extract a ~20-line `aiCall(schema, buildPrompt)` helper and keep prompts
per-feature.

---

## “Could this be simpler?” — direct answers

1. **Is the in-memory DB + snapshot/diff persistence worth it?**
   Partly. The _read_ side (one consistent per-request workspace) is a genuine
   simplification. The _write_ side (diff every action, string-compare rows, can't
   delete, no concurrency) is machinery that fights back — and the repo/ layer it
   diffs against already exists. **Simpler route:** keep the workspace read model;
   persist hot-path actions with targeted repo calls + version check; delete the
   diff/persist machinery once P1-1 is done. This is the single biggest simplification
   available and it removes P0-2 and P1-1 at once — do not build more abstraction on
   top of the diff model.
2. **One analysis-core package?** Yes for the MVP (contract + engines together made
   the monorepo cheap). The coupling is real but reversible; runtime engines now load
   lazily (`await import`), so publishing/installing stays cheap until an outside
   consumer exists.
3. **src/core vs packages/domain?** The split has a crisp, lint-enforced rule; keep
   it. But right-size the layer (P2-1) — a “framework-agnostic” label on display maps
   is ceremony, not architecture.
4. **Two report builders?** No single answer: keep both outputs (users download both),
   but one IR + two renderers (P1-6). Writing the same sections twice is the kind of
   “extra machinery” that costs every change.
5. **Two persistence styles?** Evidence reads bypassing the workspace is correct (pages
   paginate; the workspace slice is bounded at 100 evidences). The ownership split is
   now documented (`architecture.md` "Persistence ownership rule") and every
   slice-persisted table upserts by id, including alerts.

---

## Completed (2026-09-05)

Removed from the active list; each was implemented and verified (`npm run typecheck`,
`npm run lint`, `npm run test` — 1158 passed, and `build:core|domain|db|check` + CLI
smoke all green).

- **P0-1 · Alert rows cannot be updated through the slice-write model.**
  `insertAlerts` is now a true conflict-upsert (same pattern as findings/remediations/
  requirements), `markAlertRead` reuses it, and a live-Postgres regression test
  (`packages/db/src/alerts-upsert.test.ts`) proves re-inserting a same-id alert updates
  the row instead of throwing a duplicate-key error.
  Files: `packages/db/src/repo/alerts.ts`, `packages/db/src/alerts-upsert.test.ts`.
- **P1-2 · Same request loads the workspace 2–3 times.**
  (a) `runAssessmentAction` now enqueues + records evidence inside one
  `withProjectWrite` (one load, rate limit included) — tests updated.
  (b) `runClaimedAssessmentJob` loads the project slice once; the redundant inner
  `loadProjectDb` was removed (the checkout never touches the DB; FK cascade covers
  mid-run deletion).
  Files: `src/server/actions/assessment.ts`, `src/server/assessment-worker.ts`,
  `src/server/actions/remediation.test.ts`.
  Remaining: personal-org provisioning on the read path — now tracked as P2-3.
- **P1-3 · Persistence styles undocumented/inconsistent.**
  The ownership rule is documented in `docs/ai/architecture.md` (“Persistence
  ownership rule”): slice model = upserts (findings/remediations/requirements/alerts)
  - evidence inserts, no deletions; structural entities via their repo modules.
    Files: `docs/ai/architecture.md`.
- **P1-4 (+P3-3) · Job status/trigger/shape triplicated.**
  `ASSESSMENT_JOB_STATUSES` / `ASSESSMENT_JOB_TRIGGERS` now live in
  `packages/domain/src/assessment-jobs.ts` (new) and feed the DB CHECK constraints
  (`schema.ts` via `sqlIn`), the server queue types/constants, and the client zod
  schema (`src/core/boundary.ts`). Generated constraint SQL is byte-identical — no
  migration needed.
  Files: `packages/domain/src/assessment-jobs.ts`, `packages/domain/src/index.ts`,
  `packages/db/src/schema.ts`, `src/server/assessment-jobs.ts`, `src/core/boundary.ts`.
- **P1-5 · All engines statically entangled in analysis-core.**
  `runtime/scan.ts` imports playwright as type-only and launches via
  `await import("playwright")`; `html-validate-runtime.ts` loads `HtmlValidate`
  lazily (promise-cached validator; the pure function is now async, tests updated);
  `scripts/build-check.mjs` documents why the CLI's externals mirror analysis-core's
  AST deps.
  Files: `packages/analysis-core/src/runtime/scan.ts`,
  `packages/analysis-core/src/runtime/html-validate-runtime.ts`,
  `packages/analysis-core/src/runtime/html-validate-runtime.test.ts`,
  `scripts/build-check.mjs`.
- **P2-2 · RawFinding / Finding provenance-surface drift risk.**
  New compile-time canary `packages/analysis-core/src/contract/finding-raw-assignability.test.ts`:
  a persisted `Finding` must stay constructible from every `RawFinding` field plus
  persistence-only fields (source and dom variants).
- **P2-4 · Dead code and stale doc references.**
  Removed unused `evidenceRecordsToInsert` (and its test block in `store.test.ts`);
  `AGENTS.md` doc map now points at `TODO-ARCHITECTURE.md` instead of the deleted
  `TODO.md` (the remaining `TODO.md` references lived in `docs/analysis-strategy.md`,
  which a concurrent refactor removed in the same session).
  Files: `packages/db/src/postgres-evidence.ts`, `packages/db/src/store.test.ts`,
  `AGENTS.md`.
- **P3-2 · `JSON.stringify` row comparison depends on canonical key order.**
  Invariant documented at both diff sites (`repo/apply.ts`, `workspace.ts`) and
  pinned by `packages/db/src/repo/mappers.test.ts` (exact key order per mapper,
  snapshot excluded from the assessment payload).
- **P3-4 · Naming drift: `postgres-queries.ts` is Drizzle, not raw SQL.**
  `docs/ai/architecture.md` Reads bullet now says “query Postgres directly through
  Drizzle”.
- **P3-6 · Two deliberate-violation fixtures.**
  Both `Bad.tsx` files now carry comments explaining they are intentionally separate
  (CLI smoke vs Playwright harness) and must not be deduped.

## Decisions to keep (not debt)

- JSONB domain payloads + a few indexed columns — proportionate for one client project;
  reevaluate only if query/filter volume outgrows the workspace model.
- Evidence append-only without FKs — protects the audit trail by constitution.
- Catalog seeded from adapters on deploy, not rewritten per action.
- Worker: durable jobs, lease recovery, 3 attempts, serial per project, ephemeral clones.
- JSX-only scoped rescan on re-assessment (cheap monitoring, documented limitation).
- AI never sets statuses — keep, and keep the `aiWarn`/error-ref pattern on failures.

## Definition of done (remaining)

1. P0-2: concurrent-write integration test exists and passes; requirement refresh no
   longer re-persists stale rows.
2. P1-1: dismiss/approve/verify actions persist targeted rows; diff machinery retired
   or gated behind the assessment path.
3. P1-7: `repo/apply.ts` + `workspace.ts` write path covered by the live-Postgres
   integration suite.
4. Docs updated in lockstep when any of the above lands (stale docs are a defect).
