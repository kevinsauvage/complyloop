# TODO-SIMPLICITY

Simplicity audit of the Compliance Engineering Platform (ComplyLoop).
Generated 2026-09-07. **No application code was modified** — this file is the plan.

**Method:** read architecture docs + product spec, then walked every major module
(`src/server`, `src/server/actions`, `src/core`, `src/ai`, `packages/db`,
`packages/adapters`, `packages/analysis-core` surface, UI components, config).
For each finding the question asked was: _can we get the same result with less
code, fewer concepts, fewer dependencies, or fewer moving parts?_

**Ground rules respected:** no recommendation below weakens the product's
non-negotiables — evidence append-only, AI never sets statuses, deterministic
verification, human-in-the-loop, RBAC, advisory-lock write serialization,
stale-write protection, accessibility of the app itself.

---

## Scope snapshot

- ~70k LOC (incl. colocated tests) across `packages/{analysis-core,db,adapters,check}` + `src/`.
- Largest units: `packages/adapters/src/rgaa/controls.ts` (1,803 — data, fine),
  `check-registry.ts` (969 — check data, fine), `src/server` ≈ 12.3k LOC,
  `src/server/actions` ≈ 4.9k LOC, `src/core` ≈ 3.7k LOC.
- The complexity hotspots are **not** in the analysis engine (that is the
  product) but in the **write pipeline plumbing** (`Db` read model, payload
  structs, status-refresh dance) and **action error-handling idioms**.

Overall verdict: the architecture is sound and unusually well documented. The
findings below are mostly _incidental_ complexity — duplication, dead generics,
parallel idioms — not conceptual overreach. The exception is the in-memory `Db`
read model, which is heritage from a pre-Postgres era and is the single largest
source of incidental complexity left in the repo.

---

## P0 — Critical

### P0-2 · Remove the dead `result` generic from `withProjectWrite` — **DONE**

- Callbacks now return `ProjectWritePayload | void` (void = nothing to persist).
- `withOrgWrite` still keeps its generic (`createOrgAction` returns the org).

### P0-3 · Standardize server-action error handling on one idiom (throw → runActionMessage)

- **What is complex:** Three coexisting idioms for the same concern:
  1. Throw `PublicError` inside `runActionMessage` (remediation\*, requirements,
     assessment, project-preset, alerts) — clean.
  2. Manual `try/catch` + `actionErrorState` / `publicErrorMessage`
     (`remediation-verify.ts`, `pr.ts`) — duplicates idiom 1 but with hand-rolled
     catch blocks (and returns ad-hoc error states).
  3. `parseFormState` + `formError`/`formSuccess` returning result objects
     (`connect.ts`, `org.ts`) — a third shape, plus manual session checks that
     duplicate `requireSignedIn`.
- **Why it's a problem:** Three ways to do one thing = every new action forces a
  choice, reviewers must re-learn per file, and the result-object idiom
  bifurcates validation (throw-based `parseForm` vs result-based
  `parseFormState`) for no behavioral gain.
- **How to simplify:** Keep idiom 1 only. Delete `parseFormState`,
  `formError`, `formSuccess` (`src/server/boundary.ts`,
  `src/server/action-state.ts`); migrate `connect.ts` and `org.ts` to
  `parseForm` + `requireSignedIn` + `runActionMessage`. Keep
  `remediation-verify.ts`'s special `STILL_FAILING` return, expressed as a
  normal success message.
- **Files:** `src/server/action-state.ts`, `src/server/boundary.ts`,
  `src/server/actions/connect.ts`, `src/server/actions/org.ts`,
  `src/server/actions/pr.ts`, `src/server/actions/remediation-verify.ts`.

### P0-4 · Make the draft-PR path fail loud (silent catches can ship an empty "fix" PR)

- **What is complex:** In `preparePullRequest` (`src/server/pr.ts`), the commit
  step is wrapped in a bare `catch {}` ("idempotent retry") and the rollback
  `git.checkout` in another silent catch. `PullRequestResult.committed` is
  hardcoded `true`, and `body` is returned but never consumed by callers.
- **Why it's a problem:** If the commit fails for any reason _other_ than
  "nothing to commit" (e.g. git error), the branch is pushed anyway and a PR is
  opened that claims the fix but contains **no diff** — a correctness hazard
  born of silent-failure complexity. Two parallel error paths (throw vs.
  degrade-to-message) obscure what actually happened.
- **How to simplify:** After `applyFileEdits`, verify the tree actually differs
  from HEAD (`git status --porcelain` non-empty or `git diff --quiet` failed)
  before committing; fail loud otherwise. Drop the `committed` field (or make it
  honest) and the unused `body` field. One error path: throw `PublicError` with
  the branch state included.
- **Files:** `src/server/pr.ts`, `src/components/create-pr-form.tsx` (consumers),
  `src/server/actions/pr.ts`.

---

## P1 — High

### P1-1 · Retire the in-memory `Db` read-model god-object (incrementally)

- **What is complex:** `Db` (`packages/db/src/types.ts`) is a bundle of 9 arrays
  loaded per request and passed by parameter through dozens of pure helpers
  (`findingById(db, …)`, `orgsForUser(db, …)`, `accessFromStore(db, …)`). To
  keep loads bounded there are **3 loaders** (`loadWorkspaceDb`,
  `loadTargetedProjectWriteDb`, `loadProjectAssessmentDb`), **2 app wrappers**
  (`loadWorkspaceDbForViewer`, `loadWorkspaceContextDbForViewer`), **2 memoized
  getters** (`getWorkspace`, `getWorkspaceContext`), plus flags
  (`evidenceLimit`, `includeRuntime`), plus partial-Db workarounds like
  `{ ...emptyDb(), organizations, memberships }` (`personal-org.ts`).
- **Why it's a problem:** It is the repo's biggest remaining piece of accidental
  complexity: every helper signature carries a god-parameter whose contents
  depend on _which loader_ produced it (a subtle class of "why is this field
  empty" bug). Project-scoped filtering is re-implemented in ≥6 places
  (`cloneProjectRows`, `snapshotProjectSlice`, `findingsForProject`,
  `requirementsForProject`, `evidenceForProject`, `removeProjectScopedRecords`,
  `exportOrgData`, `deleteOrganization`).
- **How to simplify (incremental, low risk per step):**
  1. Replace the `Db`-threading lookup helpers with direct repo queries where
     the caller needs one row (`findingById`, `controlById`,
     `remediationForFinding`, `requireRequirement`) — each becomes a
     `getXById(drizzle, id)` repo call. This deletes most `Db` parameter
     threading in `workspace.ts`, `actions/*`, `assessment-status.ts`.
  2. Collapse loaders to **one** `loadWorkspace(drizzle, { parts })` where
     `parts` selects tenancy / active-project-runtime / evidence-window; keep
     the two React memoized getters as thin presets over it.
  3. Delete `emptyDb()` workarounds as partial loads become explicit `parts`.
  - Keep: per-request `cache()` memoization, the targeted-write loader
    (`loadTargetedProjectWriteDb`) — it is a real hot-path optimization — and
    RBAC evaluation shape.
- **Files:** `packages/db/src/types.ts`, `packages/db/src/workspace-load.ts`,
  `src/server/db.ts`, `src/server/workspace.ts`, `src/server/orgs.ts`,
  `src/server/project-visibility.ts`, `src/server/personal-org.ts`,
  `src/server/actions/*`.

### P1-2 · One helper for "apply rows + refresh requirement statuses" (kills the 4× merge dance)

- **What is complex:** Four interactive actions repeat the same 3-step dance
  with small variations:
  `mergeRefreshIntoPayload(payload, refreshRequirementStatusesForControls(project, findingsWithPayloadOverrides(db.findings, payload.findings), db.requirements, [controlIds], flags))`
  — in `remediation.ts` (dismiss, bulk dismiss), `remediation-verify.ts`
  (markVerified), `requirements.ts` (clear override). Each also hand-merges
  findings/remediations into the payload (`payload.findings = [...(payload.findings ?? []), updated]`).
- **Why it's a problem:** The refresh flags and override-precedence are exactly
  the kind of subtle thing that drifts between copies (the bulk version already
  grew a per-project control-set accumulator the single version lacks). A new
  action will copy one of the four and get it subtly wrong.
- **How to simplify:** Add one action-layer helper, e.g.
  `applyEntityWrite(payload, { findings?, remediations?, refreshControls }, context)`
  that: merges rows, overlays payload overrides onto `db.findings`, runs the
  targeted status refresh, and merges the result. The four call sites become
  one line each. Optionally fold `refreshRequirementStatusesForControls` away
  (see P3-1).
- **Files:** `src/server/actions/shared.ts` (or new `src/server/apply-entity-write.ts`),
  `src/server/actions/remediation.ts`, `src/server/actions/remediation-verify.ts`,
  `src/server/actions/requirements.ts`, `src/server/assessment-status.ts`.

### P1-3 · Compute finding clusters once per request

- **What is complex:** `clusterFindings` is re-run on every render:
  `findings/page.tsx` calls `prioritizeClusters(...)` (full clustering) _and_
  `orderFindingsForList(...)` → `prioritizeFindings(...)` → `clusterFindings(...)`
  again (per status tab); `dashboard/page.tsx` likewise calls both
  `prioritizeFindings` and `prioritizeClusters`.
- **Why it's a problem:** O(n) repeated work per request and two APIs that both
  internally re-cluster — a future change to clustering semantics must be
  verified in both orderings.
- **How to simplify:** Compute clusters once (e.g. `clusterFindings` result
  passed into `prioritizeFindings` and `prioritizeClusters` as an argument, or a
  memoized request-scoped `buildFindingIndex(project)` returning
  `{ clusters, prioritizedOpen }` consumed by both pages). Keep scoring logic as
  is (it is spec'd §16–17).
- **Files:** `src/core/prioritization.ts`, `src/core/root-cause.ts`,
  `src/app/(app)/findings/page.tsx`, `src/app/(app)/dashboard/page.tsx`.

### P1-4 · One "append evidence" helper — delete the literal-spread copies

- **What is complex:** Three functions do the same thing for two sinks:
  `evidenceEntry(payload, …)` (`actions/shared.ts`), `appendEvidence(rows, …)`
  (`project-rows.ts`), plus raw literals `payload.evidence = [...(payload.evidence ?? []), record]`
  (e.g. `ai-fix.ts` `persistPatchCandidate`, `remediation-ai.ts`,
  `remediation.ts` `dismissFindingInPayload`).
- **Why it's a problem:** Same 3-line pattern copied across sinks; a change to
  evidence stamping (e.g. adding a field) must find every copy.
- **How to simplify:** Standardize on the payload helper (`evidenceEntry`) for
  interactive writes and `appendEvidence` for `ProjectRows`, and route the raw
  literals through them. (P0-2 makes this easier since payloads flow out of
  callbacks uniformly.) A single `newEvidenceRecord` remains the underlying
  constructor.
- **Files:** `src/server/actions/shared.ts`, `src/server/project-rows.ts`,
  `src/server/ai-fix.ts`, `src/server/actions/remediation-ai.ts`,
  `src/server/actions/remediation.ts`.

---

## P2 — Medium

### P2-1 · Replace the hand-written patch-candidate (de)serializer with a zod schema

- **What:** `ai-fix.ts` round-trips `PatchCandidate` through evidence
  `detail` JSON via hand-rolled `asRecord` / `parseEdits` /
  `parsePatchCandidateDetail` (~50 lines of manual validation) and
  `patchCandidateDetail` for the write side.
- **Why:** Hand-rolled parsing duplicates the zod boundary conventions used
  everywhere else (`src/core/boundary.ts`); a schema change silently breaks the
  reader.
- **How:** One `patchCandidateDetailSchema` (zod) + `schema.parse` on read;
  write side stays `schema.parse(candidate)`-shaped. ~40 lines deleted, one
  source of truth.
- **Files:** `src/server/ai-fix.ts`, `src/ai/verified-fix.ts`.

### P2-2 · Unify "refresh a remediation suggestion" (3rd copy exists)

- **What:** Setting/updating a `suggested` remediation with a suggestion has
  three implementations: `advanceRemediation` (detected→suggested), and two
  hand-rolled "already suggested → push history + replace" blocks in
  `remediation-ai.ts` and `ai-fix.ts` `persistPatchCandidate` (with different
  note strings and slightly different shapes).
- **Why:** The suggested-refresh invariants (history append, no status change)
  live in copy-paste; the hand-built blocks bypass the transition guard.
- **How:** Add `refreshSuggestion(remediation, suggestion, note)` to
  `src/core/remediation.ts` that handles detected→suggested (via
  `advanceRemediation`) and suggested→suggested (history append) exhaustively.
  All three sites call it.
- **Files:** `src/core/remediation.ts`, `src/server/actions/remediation-ai.ts`,
  `src/server/ai-fix.ts`.

### P2-3 · Fold `status-display.ts` thin getters + `badges.tsx` parallel maps

- **What:** `status-display.ts` (421 lines) exposes 1-line getters
  (`requirementStatusLabel`, `requirementStatusTone`, …) over display records,
  and `badges.tsx` keeps 7 parallel `Record<Enum, …>` maps
  (`REMEDIATION_BADGE`/`_VARIANT`, `SEVERITY_BADGE`/`_VARIANT`, …), several
  hard-coding tailwind colors outside the tone-token system (`approved`,
  `serious`, `human_review`, AI provenance).
- **Why:** Three places to touch when adding a status (display record, badge
  map, variant map); colors outside the token system drift from dark-mode
  contrast rules.
- **How:** Keep the documented "one record per enum" design but drop the thin
  getters (call sites read `.label`/`.tone` directly) and move badge
  className/variant into the display records (one table per enum, tone-token
  only). Move `severityRank` to `src/core/prioritization.ts` (ordering is not
  display).
- **Files:** `src/core/status-display.ts`, `src/components/badges.tsx`,
  `src/core/prioritization.ts`.

### P2-4 · Unify the `dom` / `site` branches in `verifyRemediationAction`

- **What:** `src/server/actions/remediation-verify.ts` duplicates the entire
  `withProjectWrite` body (still-failing vs. verify + refresh + response
  mapping) across the `dom` and `site` switch branches; only the "is it still
  failing" probe and audit flags differ.
- **Why:** ~40 duplicated lines; a fix to one branch (e.g. response shape)
  must be mirrored in the other.
- **How:** Compute `present` + `audit` flags per location kind first, then run
  **one** write block. The exhaustive switch stays for the probe selection.
- **Files:** `src/server/actions/remediation-verify.ts`.

### P2-5 · `switchOrgAction` should not take the org-write lock

- **What:** Switching the active org (`src/server/actions/org.ts`) runs inside
  `withOrgWrite` — an advisory-locked transaction with a full tenancy load —
  although it performs no writes: it only checks membership and finds a project
  to pre-select.
- **Why:** A read masquerading as a write serializes with real org writes and
  costs a load + lock for a cookie update.
- **How:** Use `getWorkspace()` (read) + permission check + cookie writes;
  keep `withOrgWrite` for actual mutations. Same review pass for
  `switchProjectAction`-style flows.
- **Files:** `src/server/actions/org.ts`, `src/server/workspace.ts`.

### P2-6 · Align `connect.ts` with the standard write protocol

- **What:** `connectGitHubRepoAction` / `disconnectGitHubRepoAction` bypass
  `withProjectWrite`/`withOrgWrite` and hand-roll `drizzle.transaction` +
  `loadWorkspaceDb` + repo calls.
- **Why:** Two write protocols to learn and audit; connect path misses the
  shared lock/guard machinery by construction (its justification — no active
  project cookie yet — is not encoded anywhere).
- **How:** Add a `touch: "connect"` scope to `withProjectWrite` (loads tenancy
  - target project, no project lock, persists project + evidence), or extract
    one `withConnectWrite` helper in `workspace-write.ts`; both actions use it.
- **Files:** `src/server/actions/connect.ts`, `src/server/workspace-write.ts`.

### P2-7 · Simplify status-refresh bookkeeping in `assessment-status.ts`

- **What:** `refreshRequirementForControl` maintains two arrays
  (`working` + `touched`) with double `findIndex` bookkeeping in `track()`;
  `applyRequirementStatusRefresh` then re-merges `touched` back into
  `ProjectRows` with a third findIndex pass; `mergeRefreshIntoPayload` builds a
  Map for the same "later id wins" merge.
- **Why:** Four merge utilities for one concept; three index scans per updated
  requirement. The in-memory `working` copy exists only to feed sticky-status
  checks that could read the caller's list.
- **How:** `refreshRequirementStatuses` already receives the caller's
  requirements; make it return `{ requirements (updated/created), evidence }`
  written into a single accumulator keyed by id (`Map<id, Requirement>`).
  `applyRequirementStatusRefresh` and `mergeRefreshIntoPayload` become two thin
  adapters over the same accumulator.
- **Files:** `src/server/assessment-status.ts`, `src/server/assessment.ts`.

### P2-8 · Org callbacks should compute, not mutate (`withOrgWrite` dual model)

- **What:** Org domain functions (`inviteOrgMember`, `removeOrgMember`,
  `changeOrgMemberRole`, `createOrganization`, `deleteOrganization` in
  `src/server/orgs.ts`) mutate the in-memory `db` arrays **and** the wrapper
  persists an explicit payload — two sources of truth inside one transaction.
- **Why:** The mutation is discarded after the transaction; only the returned
  payload persists. Readers inside the callback need the mutation, which makes
  every function "mutate for reading, return for writing" — a subtle contract.
- **How:** Make org functions pure compute-over-read (they already receive the
  loaded slice): either pass a scratch copy (like `ProjectRows`) or have them
  return payload + a local view. Pick one convention; the mutate-and-return
  hybrid goes away.
- **Files:** `src/server/orgs.ts`, `src/server/workspace-write.ts`
  (`withOrgWrite`), `src/server/actions/org.ts`.

### P2-9 · Share the report status/tone system with the HTML renderer

- **What:** The HTML report (`src/server/report-html/shared.ts`, 449 lines)
  embeds a full bespoke stylesheet with its own status/severity color palette
  (`STATUS_CLASS`, `--passed-bg`, …) duplicating `status-display.ts` tones, on
  top of **two** report formats (markdown + HTML) sharing `report-model.ts`.
- **Why:** A status/tone change must be made in three places (tokens, markdown
  labels, HTML CSS); the HTML palette silently diverges from app tokens.
- **How:** Generate the HTML CSS variables from the tone map (or reuse a shared
  constant module). Longer term (product decision, not required for
  correctness): consider whether both export formats are still needed — the
  model layer already makes the second renderer cheap, so this is optional.
- **Files:** `src/server/report-html/shared.ts`, `src/core/status-display.ts`,
  `src/server/report-markdown.ts`.

### P2-10 · Pass the loaded slice instead of three parallel guard maps — **DONE** (with P0-1)

- **What:** `PersistProjectRowsOptions` carried three parallel `updatedAt` maps;
  `captureEntityStaleWriteGuards` built them from scope ids;
  `applyAssessmentPayload` rebuilt them from `ProjectSlice`.
- **What changed:** Options are now `{ loadedSlice? }`; maps are derived inside
  `persistProjectRows`. Workspace writes capture a `ProjectSlice` via
  `captureEntityLoadedSlice`.

---

## P3 — Low

### P3-1 · Delete the `refreshRequirementStatusesForControls` pass-through

Pure forwarder to `refreshRequirementStatuses` with an early return for an empty
array (which the loop already handles). Call sites pass through unchanged.
**Files:** `src/server/assessment-status.ts` + 3 action call sites.

### P3-2 · Drop legacy `FileChange.author` / `commitSubject`

Depth-1 clones cannot attribute changes (documented); only the dashboard still
renders a conditional `change.author ? … : …` branch that can never fire on new
data. Remove the fields and the UI branch.
**Files:** `packages/db/src/types.ts`, `src/server/monitor.ts`,
`src/components/dashboard/dashboard-activity-sections.tsx`.

### P3-3 · Move `materializeAssessmentRun` out of production code

Exported from `src/server/project-rows.ts` but imported only by two test files.
Move to `src/test-fixtures/` (it already exists for action mocks).
**Files:** `src/server/project-rows.ts`, `src/server/assessment*.test.ts`,
`src/test-fixtures/`.

### P3-4 · Rename `org-lifecycle.test.ts`

Tests the current `org.ts` actions but the module name no longer exists —
misleading file lookup.
**Files:** `src/server/actions/org-lifecycle.test.ts` → `org.test.ts`.

### P3-5 · Verify-then-delete `assertE2EHarnessSafe` if dead

Only referenced by its own test file (`e2e-harness.test.ts`); no production
call site found. Either wire it where the harness wants the guard or remove it
and keep `assertE2EFixtureRoot`.
**Files:** `src/server/e2e-harness.ts`.

### P3-6 · Inline single-use query wrappers

`effectiveRequirementsPresetId` (a `??`), some `*Href` wrappers in
`src/core/query.ts` used from exactly one call site. Keep the shared primitives
(`firstParam`, `parseEnumParam`, `buildHref`); inline the one-liners at call
sites where the wrapper adds nothing.
**Files:** `src/core/query.ts` + single consumers.

### P3-7 · Fold `AiActionForm` into `StatefulActionForm`

40-line wrapper that only pins `size="sm"`, a class, and a default variant.
Either delete it (call `StatefulActionForm` directly with those props) or keep
— but stop it from being a second name for the same thing.
**Files:** `src/components/findings/ai-action-form.tsx`,
`src/components/findings/finding-next-step-panel.tsx`.

### P3-8 · Trim `PullRequestResult`

`committed` is a constant `true` and `body` is never consumed (evidence records
`branch`/`prUrl`/`title`). Remove both fields.
**Files:** `src/server/pr.ts`, `src/server/actions/pr.ts`.

### P3-9 · One zod schema for the assessment-job row (schema + type + mapper)

`assessmentJobSchema` in `src/core/boundary.ts` re-declares the `AssessmentJob`
shape that `assessment-jobs.ts` types + `jobFromRow` already define. Derive the
zod schema from the type (or generate the type from the schema) so they cannot
drift. Low urgency — the client poller is the only consumer.
**Files:** `src/core/boundary.ts`, `src/server/assessment-jobs.ts`.

### P3-10 · Pick one user-feedback channel per action result

`StatefulActionForm` renders inline `ActionFeedback` **and** `useActionToast`
fires for the same state (toasts keyed off the pending-edge). Every action
success currently surfaces twice. Choose toast-only (recommended: pages keep
state after `revalidatePath`) or inline-only, and delete the dual path.
**Files:** `src/components/stateful-action-form.tsx`,
`src/hooks/use-action-toast.ts`, `src/components/action-feedback.tsx`.

### P3-11 · `exportOrgDataAction` double-filters

Fetches full evidence/assessments via repo (already project-filtered) and then
`exportOrgData` re-filters by `projectIds` again. Pass the pre-filtered slices
and trust the query, or drop the query-side filter. Cosmetic.
**Files:** `src/server/actions/org.ts`, `src/server/orgs.ts`.
