# ComplyLoop — Global TODO

> Audit of the codebase as of 2026-09-26 (graph built with Graft, flows traced through the code).
> This file replaces `CRITICAL-TODOS.md`: nearly every item there is already fixed in code (see the last P2 item).
> Work top to bottom. Each item stands on its own unless it says otherwise.

---

## P0 — Critical

### [ ] Reconcile assessment results against current data, not the snapshot taken before the scan

**Why:** The worker loads the project's findings and requirements, then spends minutes cloning and scanning, then applies changes computed from that old snapshot. Rows a user changed during the scan are silently skipped by the stale-write guard. Their evidence rows are still inserted, and requirement statuses are still written from the old findings. The audit trail then claims things the database doesn't reflect (for example, "resolved" evidence for a finding that stays open, or `failed` for a finding the user just dismissed).

**Where:** `src/server/assessment/assessment-worker.ts` (`runClaimedAssessmentJob` loads `loadProjectDb` before checkout), `src/server/assessment/assessment.ts` (`runAssessment` scans and reconciles in one pass), `src/server/assessment/assessment-pipeline.ts` (`applyAuthoritativeAssessment`), `packages/db/src/repo/upsert-guard.ts`, `packages/db/src/repo/apply.ts`.

**Change:** Split `runAssessment` into two steps. (1) A pure `scan()` that returns raw findings, the snapshot and engine facts, and never touches DB state. (2) A fast `reconcile()` that runs inside the apply transaction, under the project lock, on freshly loaded rows. Then delete the stale-guard path for assessments (`loadedSlice`, `filterStalePayloadWrites`) instead of keeping two consistency mechanisms. Add a test where a finding is dismissed during a scan and the final state and evidence still agree.

**Impact:** High

### [ ] Tie runtime audit results to the commit that was scanned

**Why:** The source-code (AST) scan runs on the pushed commit. The runtime audit runs on a fixed `project.runtimeBaseUrl` that is usually still serving the previous deploy when the push webhook fires. `mergeRawFindings` then drops composition-sensitive AST findings for pages the runtime audit "covered". A regression that isn't deployed yet disappears, and the requirement can read `passed` until the next push. Runtime-only checks can pass on code that was never scanned.

**Where:** `src/server/github/webhook.ts` (push only), `src/server/assessment/assessment.ts:452-470`, `packages/analysis-core/src/merge-findings.ts` (`filterAstFindingsForAuthority`), `src/server/actions/runtime-audit.ts`.

**Change:**

- Handle GitHub `deployment_status` (state `success`), which Vercel and most hosts emit, and run the runtime audit against that deployment's `environment_url` and SHA.
- Record the audited SHA on the assessment.
- Let runtime findings replace AST findings only when the audited SHA equals the scanned SHA. Otherwise keep the AST findings and treat runtime-only checks as `unable_to_verify`.
- Keep the static URL only as a manual fallback, labeled "not tied to a commit".

**Impact:** High

### [ ] Stop sending client source code to a free-tier default AI model

**Why:** `AI_MODEL` defaults to `poolside/laguna-s-2.1-free`, and patch prompts include full file contents from client repositories (`src/ai/patch.ts`). For agencies handling client code, a free-tier model with unknown data-retention terms is a confidentiality problem. Model output is also parsed by "tolerating fences and surrounding prose", which is fragile.

**Where:** `src/ai/ai-call.ts:29-52,170-200`, `src/ai/patch.ts`, `src/ai/remediation.ts`, `src/server/env.ts`.

**Change:** Remove the default model. AI is enabled only when `AI_MODEL` is explicitly set, to a provider with zero data retention, documented in `.env.example`/README. Switch to AI SDK structured output (`Output.object` with the existing zod schemas), delete the text-parsing fallback, and bound every output field (length and format) before it is persisted.

**Impact:** High

---

## P1 — High

### [ ] Replace the "load the whole project, mutate, diff" write model with targeted writes

**Why:** Every click (dismiss a finding, approve, set an exception) runs `withProjectWrite` or `withFindingWrite`. That loads the project's full history (every finding, remediation, requirement and alert), snapshots it, and deep-diffs it (`equalIgnoringUpdatedAt`) to find the one changed row. Cost grows with project age, and the snapshot-ordering rules ("callers MUST snapshot before invoking the handler") are an easy way to silently drop writes. Read pages have the same problem: the finding detail page loads every finding in its status tab to render one.

**Where:** `src/server/workspace/workspace-write.ts`, `packages/db/src/workspace-load.ts` (`loadProjectRuntime`), `packages/db/src/repo/apply.ts` (`persistProjectRows`, `changedSinceLoaded`), `src/server/workspace/finding-detail-view.ts:101`, every action in `src/server/actions/`.

**Change:** Keep the per-project advisory lock and a single `withProjectTx(projectId, permission, fn)`. Inside it, actions call explicit repo functions (`updateFinding`, `upsertRequirement`, `insertEvidence`, …) for the rows they touch. Requirement refresh loads only the affected controls' open findings. Delete `ProjectWritePayload`, the snapshot/diff machinery, and the `WorkspaceSlice`-as-write-input pattern. Page loaders query only what they render (the neighbor IDs for prev/next, not the whole tab). Do this after the reconcile item above.

**Impact:** High

### [ ] Promote queried JSONB fields to real columns

**Why:** Findings, assessments, requirements and remediations live as JSONB `payload` documents. Their queried fields are either duplicated into columns by hand-synced mappers (`engine`, `severity_rank`) or compared as text (`payload->>'detectedAt' > $1` in `findings.ts:278`, `payload->>'completedAt'` ordering on assessments). Text timestamps sort only by accident, rows with a missing value are silently excluded, and every new filter needs another mapper-synced column.

**Where:** `packages/db/src/schema.ts`, `packages/db/src/repo/findings.ts`, `packages/db/src/repo/assessments.ts`, `packages/db/src/repo/mappers.ts`, `packages/db/src/repo/evidence.ts:119` (unindexed `ilike '%q%'`).

**Change:** One migration (use the `db-migration` skill) that adds typed columns (`timestamptz` for `detected_at`, `updated_at`, `completed_at`; `kind`, `severity`) backfilled from payload, with indexes. Also add a `pg_trgm` GIN index on `evidence.summary`. Make the columns the source of truth for filtering and ordering, and query them with Drizzle operators instead of `sql` JSON paths.

**Impact:** Medium

### [ ] Add a pull-request regression check (the "don't regress" loop)

**Why:** The product's stated differentiator is "fix → verify → don't regress", but only pushes to the default branch are scanned (`parseHandledWebhookEvent` accepts `push` only). Regressions are found only after merge. Meanwhile the whole non-authoritative scan path (`resolveJobAuthoritative`, `authoritative === false` branches) is unreachable dead code.

**Where:** `src/server/github/webhook.ts`, `src/server/assessment/assessment-worker.ts:33-37,133`, `src/server/assessment/assessment.ts:561`, `src/server/github/github.ts`.

**Change:** Handle `pull_request` (`opened` and `synchronize`) and enqueue a non-authoritative job on the head SHA. Compare its raw findings with the project's open findings, and publish a GitHub check run (`checks: write` on the App) listing only the new violations, with links. Persist nothing except a check-run evidence row. If this is deliberately out of scope, delete the non-authoritative code path instead.

**Impact:** High

### [ ] Add a cross-project portfolio overview

**Why:** The spec's target user is an agency with many client projects ("continuously, across every client project"), but every page is scoped to one active project picked from a switcher. The org page shows only a project _count_. An agency lead cannot see which clients are failing, regressing or stale without clicking through each project.

**Where:** `src/app/(app)/org/`, `src/app/(app)/dashboard/`, `src/server/workspace/` (new loader), `packages/db/src/repo/`.

**Change:** Add one org-level table (on `/org` or a new `/projects`) with one row per project: requirement status counts, open violations, unread regression alerts, last assessment time, and job state. Build it from a single grouped SQL query per metric (no per-project runtime loads). Each row links into that project's dashboard.

**Impact:** High

### [ ] Move repository clones out of server actions

**Why:** "Create PR" (`preparePullRequest`) and "Generate patch" (`generatePatchCandidateOnCheckout`) each do a full isomorphic-git clone plus scan inside a Vercel server action, with no `maxDuration`. That's slow, fragile under function time and disk limits, and duplicates what the worker already does. Committing a verified single-file edit doesn't need a clone at all.

**Where:** `src/server/github/pr.ts:126-278`, `src/server/assessment/ai-fix.ts:126-137`, `src/server/actions/pr.ts`, `src/server/actions/ai-fix.ts`, `src/server/assessment/repo-checkout.ts`.

**Change:**

- **PRs:** create the branch, commit and PR through the GitHub Git Data API (`git.createTree`/`createCommit`/`createRef` via Octokit) from the already-verified `candidate.edits`.
- **Patch generation:** fetch only the affected file(s) through the contents API and run the single-file scan in memory. If a full-tree check is genuinely required, enqueue it as a worker job instead.
- Afterwards, `withProjectCheckout` is used only by the worker.

**Impact:** Medium

---

## P2 — Medium

### [ ] Make the worker cheaper and faster to start

**Why:** Every 15-minute backstop runs `npm ci` _before_ the queue-depth gate (about 96 full installs a day while idle), and each manual run pays a cold runner, `npm ci` and Chromium install before scanning starts. That's minutes of latency on the most important button, and Actions minutes that grow with no traffic.

**Where:** `.github/workflows/assessment-worker.yml`, `scripts/queue-depth.ts`, `scripts/assessment-worker-drain.ts`, `src/server/assessment/assessment-scheduler.ts`.

**Change:** Gate the queue before `npm ci`, using a `psql` one-liner or a `curl` to an authenticated queue-depth endpoint. Cache `node_modules` along with the browsers. Have the drain loop until the queue is empty rather than stopping at `limit`. Show the expected start delay in the Pipeline UI.

**Impact:** Medium

### [ ] Add retention for jobs, assessments and snapshots

**Why:** Only `webhook_deliveries` and `rate_limit_buckets` are pruned. `assessment_jobs`, `assessments` and `assessment_snapshots` grow forever. Note that `findings.assessment_id` has `ON DELETE CASCADE`, so naive assessment pruning would delete findings.

**Where:** `src/server/assessment/assessment-scheduler.ts:72-90`, `packages/db/src/schema.ts` (FKs), `src/server/ops-thresholds.ts`.

**Change:**

- Make `findings.assessment_id` `ON DELETE SET NULL`, or keep assessments that findings still reference.
- Prune terminal jobs older than 30 days, and keep the last N assessments and snapshots per project, in batched deletes on the scheduler tick.
- Add table-size signals to `ops:check`.

**Impact:** Medium

### [ ] Localize the product and reports in French

**Why:** The target customers are French agencies delivering RGAA work to French clients, but the UI, finding copy and exported reports are English only (`<html lang="en">`, no i18n). This is a real adoption blocker for the stated audience.

**Where:** `src/app/layout.tsx`, `src/core/display/`, `src/server/reporting/`, `packages/analysis-core/src/catalog/rgaa/guidance.ts`.

**Change:** Adopt `next-intl` with `fr` as the default and `en` as secondary. Start with the exported audit/engineering reports and the finding explanation copy (the text clients actually read), then move on to app chrome.

**Impact:** Medium

### [ ] Remove experimental and prerelease production dependencies

**Why:** Auth runs on `next-auth@5.0.0-beta.32`, and production builds enable `reactCompiler` plus `experimental.turbopackRustReactCompiler`. Both add upgrade-breakage risk for no product gain.

**Where:** `package.json`, `next.config.ts:111-118`, `src/auth.ts`.

**Change:** Drop the experimental Rust compiler flag, and keep `reactCompiler` only if the build and e2e stay green without it being experimental. Either pin next-auth to its latest release and track stable v5, or migrate to Better Auth (GitHub OAuth only is simple to move).

**Impact:** Low

### [ ] Delete dead code and stale docs, and keep them out

**Why:** The code was AI-generated and has drifted. knip finds 21 unused exports and 46 unused exported types, and barrels duplicate modules (`src/core/display.ts` vs `src/core/display/*`, `src/core/filter-params.ts` vs `filter-params/*`). `CRITICAL-TODOS.md` lists about 25 items as open that are already fixed in code, which misleads the next agent.

**Where:** `CRITICAL-TODOS.md`, `src/core/display.ts`, `src/core/filter-params.ts`, knip output, `docs/ai/architecture.md` (update after the P0/P1 changes above).

**Change:**

- Delete `CRITICAL-TODOS.md`.
- Remove the unused exports and the duplicate barrels.
- Add `knip` (with a config that ignores `e2e/fixtures`) to the CI `quality` job.
- Rewrite the write-model and assessment sections of `architecture.md` once the items above land.

**Impact:** Low

---

## Biggest Wins

1. **Reconcile under the lock on fresh rows.** It removes a data-integrity hole and a whole consistency mechanism.
2. **Tie runtime audits to the scanned commit.** Without it, `passed` statuses and hidden regressions can be wrong.
3. **Replace the load-everything write model with targeted writes.** It simplifies every action and removes cost that grows with project age.
4. **Add a PR regression check.** It delivers the product's core "don't regress" promise and gives the dead non-authoritative path a purpose.
5. **Add a portfolio overview.** It makes the product usable for its real customer, an agency with many clients.

## Target State

- An assessment has two steps: a stateless scan, then a short locked reconcile on current rows. Evidence always matches persisted state.
- Every runtime result is tied to a deployment SHA. Runtime findings never override AST findings from a different commit.
- Pull requests get a ComplyLoop check that lists new violations before merge. The default branch keeps the authoritative project state.
- Mutations are plain transactions with a per-project lock and explicit row writes, with no whole-project loads, snapshots or diffs.
- Queried fields are typed, indexed columns. JSONB holds only detail payloads.
- Request handlers never clone repositories. Heavy work runs on the worker, and GitHub writes go through the API.
- AI is opt-in, uses a zero-retention model with structured output, and stays advisory.
- Agency leads see every client project's compliance state on one page, in French.
- Tables have retention, the worker is cheap when idle and quick to start, and CI rejects dead code.
