# TODO — ComplyLoop (global)

Critical review of the codebase against the actual tree (branch `main`, clean at
2026-09-05, `5ca4c0c`). Replaces the deleted `TODO-ARCHITECTURE.md` (removed in
`ed5a33b`); verified in this session: every old P0/P1 item is implemented, most
P2/P3 items landed, and the remaining ones are re-listed below with current line
numbers.

Each item answers, in order: **what is wrong**, **why it matters**, **what to do**.

**Priorities:** `P0` = silently corrupts or falsifies compliance state.
`P1` = structural cost/risk paid on every use, or a cheap fix now that gets
expensive later. `P2` = maintainability/consistency debt. `P3` = polish — do
not start without a trigger.

**Size** (`S`/`M`/`L`/`XL`) = implementation effort, not impact.

---

## Strong (verified — keep)

- Layer boundaries are real and lint-enforced (`eslint.config.mjs`); `src/core`
  imports contract + domain only; packages cannot reach app code.
- Status derivation is single-sourced (`contract/requirement-status.ts`); the
  authority classifier has tested precedence
  (`check-authority.ts`), and `HEURISTIC_RUNTIME_DOWNGRADE` is now shared by
  both runtime adapters.
- Worker/job model: SKIP LOCKED claim, 30-min lease, 3 attempts, serial per
  project, per-project advisory lock at persist, webhook idempotency by
  `idempotency_key` — no clone/scan in the request path.
- Stale-write protection for findings/remediations/requirements
  (`repo/findings.ts`, `repo/remediations.ts`, `repo/requirements.ts` +
  `upsert-guard.ts`) with live-Postgres regression tests.
- Advisory locks taken before the workspace load in both interactive writers;
  org writes take an org-scoped lock (`src/server/workspace.ts:224-229,467`).
- One shared `changedEntities` in `repo/apply.ts`; `withProjectWrite` loads only
  touched rows; report composition is single-sourced (`report-model.ts`) with
  colocated tests for both HTML builders; markdown shares the model.
- Check-id governance: `CHECK_IDS` union and catalog non-null checkIds both at
  138, forward + reverse reachability tests (`catalog-coverage.test.ts:111`),
  compile-checked authority lists; `AnalyzerId`/`AnalyzerContribution` moved
  into `contract/` (contract is self-contained).
- WCAG presets derive from the catalog (`wcag/presets.ts`); table-summary and
  the audio-description checks are unified on shared helpers.
- Tests: 1194 passing unit/integration tests, coverage 94.2 lines / 96.5 funcs /
  80.2 branches / 90.8 stmts, db-integration + e2e + build in CI.

---

## P0 — Critical

### P0-1 · Worker re-assessment silently fails to persist any update to existing findings/requirements — *size S* (fix) / *M* (fix + tests)

**What is wrong.** `assessment-worker.ts:85-91` snapshots the loaded project
slice with `snapshotProjectSlice`, which **copies the arrays but not the
objects** — `loadedSlice` shares object references with the `db` that
`runAssessment` then mutates **in place** (requirement status flip at
`src/server/assessment-status.ts:281-283`, finding field updates at
`src/server/assessment-findings.ts:97-100`, finding resolution at
`:118`). At apply time, `persistProjectSliceDiff` builds the "before" map with
`entityMap` → `structuredClone` **after** the scan mutated those objects, so the
before/after JSON are identical and `changedEntities` returns `[]`. The upsert
is a no-op.

Reproduced empirically (temporary vitest test): with a shared-reference slice,
`changedEntities(entityMap(loadedSlice), after)` returns 0 rows even though the
requirement status changed `failed → passed` before apply.

**Why it matters.** This is the production monitoring path (webhook push /
manual re-assess). Every automated re-assessment **does not persist**:
requirement status transitions (e.g. `failed → passed` when code is fixed),
finding resolution (`open → resolved`), and finding field updates
(`assessmentId`, `location`, `engine`, `fix`). Brand-new rows and evidence
**do** persist, so the DB ends up with evidence ("no longer detected",
"passed") contradicting the rows (finding still `open`, requirement still
`failed`). The compliance loop "merge PR → re-assess → verified" and the
monitoring loop are broken at the persistence layer; the stale-write guards
built in `31e4e26` never trigger because the diff never emits the rows. First
assessment on a fresh project is unaffected (all rows are new), which is why
the demo/dogfood path looks healthy.

**Why tests don't catch it.** `assessment-worker.test.ts` mocks
`applyAssessmentPayload`; `persist-project-slice.integration.test.ts` builds
`before`/`after` from separate object graphs; e2e `core-loop.spec.ts` verifies
via the **targeted** `withProjectWrite` path (no diff), and webhook e2e only
asserts the new alert row. No test runs the real worker flow twice against
pre-existing rows.

**What to do.** Deep-clone inside `snapshotProjectSlice`
(`packages/db/src/repo/apply.ts:86-103`) — `structuredClone` each row when
building the slice — so the "before" map captures the pre-scan state. Then add
a regression test that runs the worker shape end-to-end (load → snapshot →
mutate in place → `persistProjectSliceDiff`) and asserts the mutated rows are
written; also assert the stale-guard still fires for a concurrent human
decision. Alternative (heavier but more robust): re-load the slice inside the
persist transaction instead of trusting the job-start snapshot.

---

## P1 — High

### P1-1 · Duplicate requirement rows are possible — no unique constraint on (project_id, control_id) — *size S*

**What is wrong.** Requirement rows are created with `id: crypto.randomUUID()`
(`src/server/assessment-status.ts:208-215, 245-253`) and `upsertRequirements`
conflicts on `requirements.id` only (`packages/db/src/repo/requirements.ts:46-54`);
`schema.ts:135-155` has no unique index on `(project_id, control_id)`. A
requirement row created in-memory during a long webhook assessment scan (fresh
id) races a targeted human write that also creates a row for the same control —
both loads saw "no row", both persist under the project lock, and two rows with
different ids end up in the table.

**Why it matters.** `requirementForControl` (`assessment-status.ts:173-182`)
returns the first match; the orphan second row double-counts in
`totalRequirements`/`passRate` (audit report), status summaries, and the
Requirements page — silent scope inflation on the compliance artifact.

**What to do.** Add a unique index on `requirements (project_id, control_id)`
(migration `0001`), and either make the upsert conflict-target the composite
index or derive deterministic requirement ids (`${projectId}:${controlId}`).
Add a live-Postgres test: two interleaved creates for the same control end with
one row.

### P1-2 · Personal-org provisioning still performs writes on every signed-in page render — *size S*

**What is wrong.** `getWorkspace` → `ensurePersonalOrgProvisioned`
(`src/server/workspace.ts:120-147,160-162`) runs on **every** signed-in GET.
It now uses a lighter query than before, but `claimMembershipsForLogin`
(`packages/db/src/repo/orgs.ts:78-98`) still executes `upsertMembership`
writes when a matching login row exists — a write-adjacent side effect (and a
full extra round-trip: orgs + memberships + claim) on the read path of every
render, on top of the real workspace load that follows.

**Why it matters.** Every page render pays an extra query set and a possible
write; side effects on GET complicate caching/observability and make
read-path failures non-idempotent.

**What to do.** Short-circuit with a cheap "personal org already exists and is
claimed" check (one indexed read) before any write, and/or move the claim to
the first authenticated *write*; or cache the result server-side per user.
If the ordering guarantee matters (membership claim must happen before the
viewer loads orgs), at least gate the write on `claimMembershipsForLogin`
returning fast when nothing to do — today the SELECT always runs.

### P1-3 · The write path's riskiest code stays outside the default unit gate — *size M*

**What is wrong.** `vitest.config.mts:46-89` still excludes
`src/server/workspace.ts`, all per-entity `packages/db/src/repo/*` files,
`workspace-load.ts`, `postgres-queries.ts`, `client.ts`, `schema.ts`, and
`report.ts`. The opt-in `test:db` suite (CI `db-integration`) is the only net
for this code.

**Why it matters.** A broken `workspace.ts` or loader passes `npm run test`
locally; P0-1 above is exactly the class of bug this gap hides — the diff
mechanics were "covered" only by tests that never exercised the aliasing.

**What to do.** Pull the pure logic into the gate (e.g. the slice snapshot +
diff composition), and/or add a CI guard that PRs touching
`packages/db/src/repo/**` or `src/server/workspace.ts` must run `test:db`.
Revisit the vitest exclude list after P0-1's regression test exists.

---

## P2 — Medium

### P2-1 · Regression alerts re-minted per push per control — *size S*

**What is wrong.** `collectRegressionAlerts` (`src/server/assessment-worker.ts:30-74`)
creates a **fresh** `crypto.randomUUID()` alert for each regressed control on
each webhook assessment. N pushes for the same unfixed regression = N alert
rows; `read` state only applies to the newest row, and the alert list grows
linearly with pushes.

**Why it matters.** Alert noise and unbounded growth for a condition that is
already "regressed" — the dashboard alert card floods.

**What to do.** Decide the intended contract (each assessment = a separate
event, or latest-wins). If latest-wins: upsert `compliance_regression` alerts
keyed by `(project_id, control_id)` reusing the existing alert id when an
unread alert already exists, or close the previous alert when the requirement
recovers. Needs a live-Postgres test for the chosen semantics.

### P2-2 · Evidence table has no lifecycle — grows forever — *size M*

**What is wrong.** `evidence` is append-only by design (DB trigger), but there
is no retention or compaction anywhere: every assessment writes
`assessment_completed`, `monitoring_changes_detected`, per-finding records,
`requirement_status_changed`, job records… Bounded only by the explicit
`evidence` export for reports (which loads **all** rows for the project —
`src/app/(app)/evidence/export/route.ts:17-20` via `listAllEvidenceForProject`).

**Why it matters.** The page paginates (`evidence` page uses windowed queries),
but the export and the audit report's evidence trail read unbounded; over
months of webhook re-assessments the table and exports grow without limit.

**What to do.** Add a documented retention policy (e.g. prune
`assessment_completed`/noise rows older than N months, keep decision records
permanently — the audit trail), an `evidence_kind`-aware archive job, and a
cap/note on the export endpoint. At minimum, document the current unbounded
growth in `docs/deploy.md` and alert on table size.

### P2-3 · Every workspace load fetches the full assessment history — *size S*

**What is wrong.** `loadWorkspaceDb` → `loadProjectRuntime` →
`listAssessmentsForProject` (`packages/db/src/workspace-load.ts:46-55`,
`packages/db/src/repo/assessments.ts:19-29`) selects **every** assessment row
(full JSONB payload incl. `changesSincePrevious`, `engines`, `summary`) for the
active project — with no LIMIT — on every page render, and the targeted write
loader does the same (`workspace-load.ts:231-234`). The app consumes only the
latest assessment (`latestAssessmentFor(...)` in settings/dashboard/workspace
context) and a "has any assessment" boolean (`findings/page.tsx:105`).

**Why it matters.** Every webhook push appends an assessment row; over months
this is an unbounded read on the hot path of every request, including every
targeted write.

**What to do.** Add a bounded latest-assessment loader
(`ORDER BY payload->>'completedAt' DESC LIMIT 1`, mirroring
`getLatestAssessmentSnapshot`), plus a cheap `hasAnyAssessment` existence
query; keep the full list only on surfaces that actually render history (if
any). Tie the retention story to P2-2 (assessments + snapshots also grow
unbounded with webhook re-assessments).

### P2-4 · Redundant double advisory-lock acquisition in `runProjectWriteTransaction` — *size S*

**What is wrong.** The project lock is acquired twice:
`src/server/workspace.ts:224-229` (cookie `preferredProjectId`, **before** the
load — the P1-1 fix) and again at `:260` (`workspace.project.id`, **after**
the load). When the cookie is stale/absent the pre-lock takes the wrong key (or
none) and the post-load lock is the only real serialization — but it happens
after the load, so load→mutate is not atomic in that case.

**Why it matters.** The double acquisition is confusing and the fallback path
reintroduces a small load-before-lock window (two writers with no cookie load,
then serialize commits → last-write-wins on the same rows the stale-guards are
supposed to prevent).

**What to do.** Lock once: move the load inside the lock scope using the
pre-resolved project id (resolve active project id from the session/cookie
up-front, then lock it, then load). Keep the `:260` lock only if the resolved
project can differ from the cookie value — and document why.

### P2-5 · Runtime engine error containment is inconsistent — *size S*

**What is wrong.** `collectCustomViolations`
(`packages/analysis-core/src/runtime/custom-checks/index.ts:62-119`) runs ~20
probes bare — one throwing `page.evaluate` fails the entire audit. Contrast:
html-validate failures are caught and treated as non-fatal
(`runtime/scan.ts`), axe failures kill the scan, and individual probes disagree
internally (`forced-colors.ts:13` wraps, `text-spacing-runtime.ts` doesn't).

**Why it matters.** A single flaky probe (e.g. a page that freezes
`matchMedia` emulation) silently aborts the rest of the runtime pass — the
flakiest, most environment-dependent part of the product has no resilience
contract.

**What to do.** Define one contract per engine class: wrap each custom probe in
a per-probe `try/catch` (record probe failure in the audit result, continue the
rest), as already done for html-validate. Document it in
`docs/ai/architecture.md`.

---

## P3 — Low (do not start without a trigger)

- **P3-1 · `foldAccents`/`matchesMultilingual` byte-copied into 4 `page.evaluate` sites.**
  Canonical home is `patterns/multilingual.ts:10-16`, but identical inline
  copies exist at `runtime/applicability.ts:60-66`,
  `runtime/custom-checks/error-prevention.ts:27-33`,
  `runtime/custom-checks/captcha-alternative.ts:13-19`, and
  `runtime/custom-checks/accessible-auth-enhanced.ts:13-19`. *(size S)*
  Fix: prefer the `fn.toString()`-injection pattern already used by
  `html-validate-runtime.ts:187-191` (or a shared string constant) when a
  fifth copy lands; otherwise document the copies as deliberate.
- **P3-2 · html-validate rule set maintained in two files with no equality test.**
  `runtime/html-validate-runtime.ts:27-39` (`RENDERED_RULES`) and
  `runtime/html-validate-map.ts:20-28+` (`HTML_VALIDATE_TO_CHECK`) list the
  same 7 rules; adding a rule edits both, and the invariant "every rendered
  rule maps to a check id" is asserted only in comments. *(size S)* Fix:
  one-line test asserting `Object.keys(RENDERED_RULES)` equals the mapping
  keys, and that each maps to a known `CheckId`.
- **P3-3 · DOM-finding construction duplicated ~3×.** `snippetOf`/`selectorOf`
  (with the same `197…` truncation) exist at `runtime/findings.ts:72-80`,
  `runtime/custom-checks/index.ts:33-41`, and inline in
  `runtime/html-validate-runtime.ts:109,160-161`. *(size S)* Fix: one
  `rawFindingFromDom` helper (merge/dedupe is already centralized; the
  per-engine translation into `RawFinding` isn't).
- **P3-5 · `markAlertReadAction` still loads the full workspace to touch one alert row.**
  `src/server/actions/alerts.ts:28` now uses `withProjectLock` (good, no
  advisory-lock gap), but it calls `getWorkspace()` first — a full tenancy +
  runtime load — to fetch a single alert id. Fetch only the rows RBAC needs
  (one org/project read) inside the lock. *(size S)*
- **P3-6 · Draft PR flow gap: no e2e for the PR check-run success path end-to-end.**
  `webhook.spec.ts` covers push regression + PR *event → job → Check Run* via
  the fixture API, but there is no e2e for the full
  "AI/source fix → draft PR → merge → webhook re-assess → `verified`" loop
  (only unit tests on `verified-fix.ts` / `remediation-verify.ts`). Add one
  once playwright fixture coverage for PR merge events exists. *(size M)*
- **P3-7 · Coverage-gate caveats live in `vitest.config.mts`.**
  Keep that exclude list honest when P1-3 changes it.
- **P3-8 · `assertRateLimit` re-reads the row after the keyed lock.**
  `src/server/rate-limit.ts:26-56` reads the bucket inside the advisory lock —
  correct, but the insert branch sets `count: 1` on conflict, silently
  resetting an in-flight concurrent increment; with the keyed lock this can't
  race today, but if the lock is ever removed the window resets on contention.
  Add a comment pinning the lock as the correctness argument. *(size S)*
- **P3-9 · `complyloop-check` CLI has no `--help`/exit-code documentation.**
  `packages/check/src/check.ts` exits `2` for a bad path, `1` for violations,
  `0` otherwise — undocumented and untested. Add a `--help` flag and tests for
  the three exit paths (`check.test.ts` covers the scan, not the CLI
  entrypoints). *(size S)*
- **P3-10 · No worker container in docker-compose.** The stack ships `app` +
  `migrate`; `npm run worker` must be run by hand (`docs/deploy.md` says so),
  so a fresh `docker compose up` has monitoring enabled but nobody draining
  jobs. *(size S)* Fix: optional `worker` service in compose (same image,
  `npm run worker`, `profiles: ["app"]`), documented as the default for
  single-node deploys.

---

## Completed since `a1dda66` (the previous architecture-debt doc)

P0-1 stale-write protection; P1-1 locks-before-load + org lock; P1-2 shared
report model + colocated HTML tests; P1-3 single `changedEntities` + targeted
writes; P2-1 truthful targeted `Db` (evidence + assessments now loaded); P2-3
docs checklist for check ids; P2-4 CLI moved under `packages/check/`; P2-6
contract self-contained (`AnalyzerId` etc. moved in); P2-7 reverse reachability
test + WCAG presets derived from catalog; P3-2 `aiCall` helper; P3-3 report
HTML tests; P3-4 docs drift (`AGENTS.md` now points at `TODO.md`); P3-6 domain contract-only lint; P3-7
`markAlertReadAction` via `withProjectLock`; P3-8 unified `isComplexDataTable`;
P3-11 shared `HEURISTIC_RUNTIME_DOWNGRADE`; P3-13 `makeVideoDescriptionCheck`.

## Definition of done (remaining P0/P1)

1. **P0-1:** `snapshotProjectSlice` deep-clones; live/regression test proves a
   second automated assessment persists status flips and finding resolution;
   stale-guard test still green; evidence and rows agree after re-assessment.
2. **P1-1:** unique index on `requirements (project_id, control_id)` + conflict
   handling; live-Postgres duplicate-create test.
3. **P1-2:** no writes on signed-in GET; provisioning short-circuits with a
   cheap read.
4. **P1-3:** write-path pure logic in the unit gate or a CI path guard; the
   local `npm run test` cannot silently pass a broken write path.
5. Docs updated in lockstep (stale docs are a defect in this repo).