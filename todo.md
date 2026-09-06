# ComplyLoop — Final TODO

> **Status (2026-09-06): all six items implemented** in the working tree
> (uncommitted). P0 #1 (branch-aware
> assessment/verification), P1 #2 (runtime-verify fail-closed), P2 #3
> (non-DOM fail-closed), P2 #4 (zone-qualified export times), P3 #5
> (job-status parser simplification) and P3 #6 (docs) are implemented. The
> original findings and validation criteria are retained below as the audit
> record.

Audit date: 2026-09-06 · Baseline: `npm run typecheck` clean, `npm run lint` 1 pre-existing test warning, `npm run test` **1216 passed / 15 skipped**, CI green (quality + db-integration + e2e jobs).

## Verdict

**Project health: strong.** The architecture is genuinely disciplined: single-sourced status derivation (`contract/requirement-status.ts`), a single authority classifier (`check-authority.ts`) with lint-enforced module boundaries, durable jobs with `FOR UPDATE SKIP LOCKED` + lease recovery + per-project serialization, append-only evidence with a DB trigger, AES-256-GCM token storage, per-key Postgres rate limits, SSRF guards on every runtime navigation, and a stale-write guard (updatedAt-based `filterNotStale`) that makes the worker's load-before-lock benign. Most findings from the 2026-09-05/06 bug-hunt were already fixed in source: runtime dedupe keys on selector+snippet, link-check decode guarded, `isLayoutTable` un-inverted, media-keyboard restore branches fixed, webhook queue false-idle fixed in SQL, findings/remediations stale-write protection landed in `31e4e26`, markdown report escaping fixed, check-id test lists iterate source, WCAG preset ids bound via `catalogControlIds`.

**Biggest risk: one compliance-integrity hole in the assessment/verification loop** (P0 below): assessment results are never tied to the branch that was scanned, so a scan of a PR head or any pushed branch can resolve findings, flip requirement statuses, and **auto-verify an approved draft-PR remediation that was never merged**. The rest of the open work is small; nothing else blocks shipping.

**Core product loop:** complete and functional end to end (connect → assess → finding → explain → remediate → verify → evidence → monitor). The loop works for one client project; tenancy is multi-org. The P0 is the one place the loop can claim compliance on insufficient evidence.

---

## P0 — Blocking

### 1. Assessment results are branch-unaware: a scan of any branch can resolve findings, flip requirement statuses, and auto-verify a never-merged remediation

- **Problem:** `runAssessment` and `reconcileControlFindings` operate on the project's shared finding/remediation store with **no concept of which git ref was scanned**. The webhook enqueues assessments for any branch: `checkoutRef` returns `payload.after` for push events (all branches, no default-branch filter) and the PR head sha for `pull_request` events (`src/server/webhook.ts:71-80`). The worker checks out `job.payload.ref` and runs a full assessment against it (`src/server/assessment-worker.ts:106-176`), which then resolves open findings no longer detected on that ref (`src/server/assessment-findings.ts:106-130`). For findings whose remediation is `approved` with `approvalAction === "create_draft_pull_request"` (set when the draft PR is *created* — `src/server/actions/pr.ts:111`), resolution triggers `verifyDraftPrRemediation` (`src/server/assessment.ts:40-86`), which auto-advances `approved → implemented → verified` and writes `remediation_verified` evidence claiming "Verified by deterministic reassessment" — **with no check that the PR was merged, or that the scanned ref is the project's default branch**. There is no `isMerged`/merge-state lookup anywhere in the codebase (verified by grep).
- **Why it matters:** This is a verification loophole — exactly the "verification that can incorrectly mark something compliant" case. A `pull_request` synchronize/opened event (or any push to a branch containing the fix) scans the PR head, does not detect the violation, resolves the finding, auto-verifies the remediation, and flips the requirement to `passed` — while `main` still fails. The append-only evidence permanently records a false "verified by deterministic reassessment", and the requirement status flip-flops on the next `main` push (finding re-created under a new id). An audit export taken in that window claims compliance the codebase does not have.
- **Action:** (1) In `handleGitHubWebhookEvent`, only enqueue `push` events whose `payload.ref` is `refs/heads/{project.github.defaultBranch}` (the check-run purpose of PR-head scans is legitimate — keep PR events enqueuing). (2) Thread the scanned ref into `runAssessment` (e.g. `assessment.ref` or an option) and gate both finding resolution and `verifyDraftPrRemediation` on `ref === project.github.defaultBranch`; PR-head scans may assess and post check-runs but must not mutate the persisted project store (compute the check conclusion from a scratch view of the raw findings without persisting resolution/verification).
- **Files:** `src/server/webhook.ts:71-80`, `src/server/assessment-worker.ts:106-176`, `src/server/assessment.ts:40-86,120-135`, `src/server/assessment-findings.ts:106-130`, `src/server/actions/pr.ts:101-121`, `src/server/assessment-jobs.ts:14-19` (payload already carries `ref`).
- **Validate:** unit test — a `pull_request`/feature-branch assessment where the violation is absent must NOT resolve the finding nor advance an approved remediation; a default-branch assessment must still auto-verify. Existing tests that must not change: `assessment.test.ts:120-147` (local-tree verify), `assessment-worker.test.ts` (check-run posting).

---

## P1 — High Priority

### 2. Runtime re-verification can confirm on a page that never actually rendered the content

- **Problem:** `verifyRemediationAction` for DOM findings calls `runtimeViolationStillPresent` (`src/server/actions/remediation-verify.ts:60-103`), which calls `scanner([url])` directly (`packages/analysis-core/src/runtime/scan.ts:505-525`). A navigation *exception* propagates (fail-closed), but a page that **loads and 404s, redirects to a login wall, or renders an error shell** still yields an axe run with zero matching nodes → `returns false` → remediation advanced to `verified` with evidence "Runtime re-audit found no remaining violation on the page". The batch audit path guards this with `pagesScanned > 0` and a setup-level `scanRuntime` error result; the single-finding verify path has no equivalent guard.
- **Why it matters:** A human clicks "Verify", the preview URL is down or changed, and the platform records *verified* backed by a page that never showed the fixed content. Same class of insufficient-evidence compliance claim as P0 #1, smaller blast radius (human-initiated).
- **Action:** In `runtimeViolationStillPresent`, require the page to have loaded as a real document of the expected URL (e.g. check `page.url()` after settle + a non-error status / `document.documentElement` has content) and return `true` ("still failing") on any unreachable/error page instead of `false`; or route through `scanRuntime` and treat `error !== undefined` / `pagesScanned === 0` as "present, cannot verify".
- **Files:** `packages/analysis-core/src/runtime/scan.ts:505-525`, `src/server/actions/remediation-verify.ts:60-103`.
- **Validate:** test `runtimeViolationStillPresent` with a scanner stub that (a) throws — must throw/fail-closed, (b) returns a 404 shell page with no violations — must return `true`, (c) returns the real violation gone — must return `false`.

---

## P2 — Medium Priority

### 3. `runtimeViolationStillPresent` returns `false` for non-DOM locations and can under-verify

- **Problem:** `if (finding.location.kind !== "dom") return false;` (`scan.ts:507`) means the verify action's DOM path would report "verified" for a site-level or source location even though no runtime re-check ever ran. The action pre-checks `previewRemediation.status === "implemented"` but not the location kind before calling it.
- **Why it matters:** A status/UX regression could silently "verify" a finding with no audit (the `implemented` → `verified` transition was intended to require evidence). Low likelihood today (the finding page drives DOM findings through this path), but the function's contract invites it.
- **Action:** Change the DOM-location guard to a `PublicError` ("runtime verification requires a DOM finding") rather than `return false`, and keep the action fail-closed if `scanRuntime` reports an error.
- **Files:** `packages/analysis-core/src/runtime/scan.ts:505-525`, `src/server/actions/remediation-verify.ts:51-103`.
- **Validate:** unit test asserting the throw for `kind: "source"` / `kind: "site"`.

### 4. Audit/markdown exports render local time without a zone

- **Problem:** `formatDateTime` renders `toLocaleString("en-GB", …)` with neither a zone nor an offset (`src/core/format-datetime.ts`), used in markdown/HTML reports and HTML export pages; evidence stores UTC ISO with `Z`. In a compliance artifact, the same instant can be read back in a different timezone.
- **Why it matters:** Audit trail timestamps are the product's core evidence; ambiguous local time weakens the export as a defensible record.
- **Action:** Append the zone abbreviation or offset (e.g. `… en-GB … +02:00`) in the export/report paths (`formatDateTime` is also used in UI, where zone display is optional — add an option or a separate export-time helper).
- **Files:** `src/core/format-datetime.ts`, `src/server/report-markdown.ts` (header/evidence/requirements), `src/server/report-html/evidence-section.ts`.
- **Validate:** unit test asserting the rendered string contains the offset for a known ISO input.

---

## P3 — Low Priority

### 5. `assessment-jobs.ts` re-aliases the domain constants and rolls custom parsers

- **Problem:** `const JOB_STATUSES = ASSESSMENT_JOB_STATUSES;` / `JOB_TRIGGERS` (`src/server/assessment-jobs.ts:54-56`) add a pointless indirection; `parseJobStatus`/`parseJobTrigger` (`:58-70`) hand-roll lookups that a `Set`/guard would express in 3 lines.
- **Why it matters:** Trivial readability/DRY; the single-sourcing goal (shared `@complyloop/domain/assessment-jobs`) is already met — the aliases just add noise.
- **Action:** Use the imported constants directly; keep the parsers (they convert DB rows to the domain type) but implement with `Set.has` no-ops on the empty payload.
- **Files:** `src/server/assessment-jobs.ts:54-70`.
- **Validate:** `npm run test` (assessment-jobs tests cover parse round-trips).

### 6. Docs drift: architecture.md understates the stale-write guard

- **Problem:** `docs/ai/architecture.md:57` says "Requirement upserts skip rows whose DB `updatedAt` is newer than the loaded snapshot" — since `31e4e26` the same guard also protects findings and remediations (`repo/findings.ts:26-40`, `repo/upsert-guard.ts`), and worker load-before-lock is now benign because of it.
- **Why it matters:** The doc is the maintenance contract; an agent reading it would re-introduce the finding/remediation guard gap.
- **Action:** One-line update: "Requirement/finding/remediation upserts skip rows whose DB `updatedAt` is newer than the loaded slice (`repo/upsert-guard.ts`)."
- **Files:** `docs/ai/architecture.md` ("Persistence" section).
- **Validate:** no test — doc-only.

---

## Simplification / Deletion Opportunities

- **None large remain — verified.** The heavy clean-up (three write models → scoped `withProjectWrite` + `persistTargetedProjectWrite`, report IR shared by both renderers, contract self-containment, lazy runtime engines, dead `evidenceRecordsToInsert` removal) has already landed. The remaining "duplication" I checked and deliberately do **not** recommend touching:

  - **`report-markdown.ts` vs `report-html/*`** — two renderers of one `ReportModel`, both now colocated-tested (`report.test.ts`, `report-html/audit.test.ts`, `engineering.test.ts`), with different escaping needs (fenced code vs HTML). Shared section-*model* exists; sharing the section-*renderers* across two output formats would be the over-abstraction.
  - **`src/core` display maps (labels, status-tone, format-datetime)** — previously flagged for relocation; retracted because server report code legitimately imports them (`report-model.ts`, `report-html/shared.ts`). `src/core` is the only layer both server and client may legally import.
  - **`proposeFixEdits` not routing through `aiCall`** — it has its own availability gate + `aiWarn` + `PublicError`, which is a *different contract* than `aiCall`'s return-null-on-failure; forcing the shared helper would lose the distinct UX error.
  - **`fix-propose` schema/prompt duplication** — consecutive AI modules necessarily carry their own Zod schemas; a shared schema factory would be speculative abstraction.
  - **58 AST checks in one registry, AST+runtime in one package** — splitting `analysis-core` further is justified only when an outside consumer of `contract/` appears (the `contract/` subdir is already self-contained and enforced by a canary test).
  - **`e2e/fixtures/sample-app/Bad.tsx` vs `packages/check/testdata/Bad.tsx`** — deliberately separate violation fixtures for different harnesses; deduping would couple e2e to the CLI package.

## Explicitly Rejected / Not Worth Doing

- **Second framework adapter / per-framework packages** — explicitly out of product scope; the framework-agnostic core + adapters already exists. Rejected per spec.
- **Moving jobs off Postgres to a queue broker (Redis/SQS)** — the `FOR UPDATE SKIP LOCKED` claim + lease recovery + per-project serialization is correct and has tests; a broker adds an operational dependency with no current problem.
- **Row-level branch/ref tracking on findings (multi-branch compliance per project)** — the correct fix for P0 #1 is *default-branch scoping of results*, not modeling multi-branch compliance state; the latter is a product feature, not a bug fix.
- **Splitting the worker into a separate package/deployable** — the worker is a script over the same codebase; a separate deployable adds packaging complexity with no isolation benefit at this scale.
- **Replacing the in-memory `Db` slice + diffs with direct per-entity persistence everywhere** — the slice model is what makes the one-load-per-job worker and the stale-write guard possible; targeted writes already cover hot paths.
- **Autoscaling / worker-pool tuning / queue throughput** — no evidence of a queue bottleneck; the rate limits and 100-row claim window are sane for the agency scale.
- **Coverage-gate tightening (raising 94% line threshold or un-excluding `workspace.ts`/`repo/*`)** — the risky persistence is covered by the live-Postgres suite (`test:db`) which runs in CI; forcing it into the default unit gate adds mocking burden without protecting a new invariant.
- **`heading-order` flat accumulator rewrite** — the "skip detection" is per-file and intentionally coarse; `h2→h4→h2` does not misreport (down-jumps are legal). Cosmetic.
- **`autoplay-media` static-true narrowing** — already fixed by `booleanAttributeValue(...) !== true`; handles `{false}`.
- **Escaping every user string in markdown reports** — already handled: `inline()` collapses newlines and `codeBlockLines` renders 4-space-indented blocks, so fences can't break structure.
- **Tenant/org UI polish, empty states, loading skeletons** — feature work, not production blockers; the auth surfaces (RBAC, membership-org workspace load, per-project permission checks on every action incl. webhook-scoped jobs) verified clean.

---

## Recommendation

> **If I were shipping this project, I would fix 2 items before production** (P0 #1 — branch-aware assessment/verification; P1 #2 — runtime verify fail-closed), **and 2 items afterward** (P2 #3 fail-closed DOM-location verify, P2 #4 timezone-qualified export timestamps). **I would ignore everything else** — the remaining P3s are optional polish, and the rejected list is deliberate. The codebase is close to genuinely production-ready: the compliance loop is complete, the invariants (append-only evidence, automated-vs-human determination, verified-only-via-recheck) are structurally enforced, and the test suite (1216 green + a real-Postgres integration job in CI) protects the business invariants rather than chasing coverage.