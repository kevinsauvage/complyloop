# Assessment Flow Audit — Simplify, Improve, Strengthen

Audit of the actual implementation (not docs, not generic principles). Traced with Graft from `runAssessmentAction` / webhook → queue → claim → checkout → `runAssessment` → apply → UI, plus the remediation/verify/AI paths that surround it.

> Central question: **what is the simplest assessment system that can reliably produce the same trustworthy result?**

All file references are repo-relative. Line numbers are from the audited revision.

---

## P0 — Critical

### [x] P0-1 (implemented) — Heartbeat lease renewal breaks `complete`/`fail` guards: scans >5 min never complete and get re-run

**Why:**
Any assessment whose scan lasts longer than one heartbeat interval silently fails to reach a terminal job state. The worker then runs the full scan again (duplicate assessment records, duplicate evidence, wasted browser/clone work), and the job eventually goes through lease-recovery instead of a clean complete.

**Where:**
`src/server/assessment/assessment-worker.ts` (heartbeat L60–89, `completeAssessmentJob(job)` L209, `failAssessmentJob(job, error)` L217), `src/server/assessment/assessment-jobs.ts` (`completeAssessmentJob` L341–368, `failAssessmentJob` L370–409).

**Current flow:**
`claimNextAssessmentJob` sets `startedAt` + `leaseExpiresAt` on the job row. `runClaimedAssessmentJob` keeps a **local** `expectedLease` variable, renewed every 5 min (`ASSESSMENT_JOB_HEARTBEAT_MS`) via `refreshAssessmentJobLease`. But `settleRunningAssessmentJob` calls `completeAssessmentJob(job)` / `failAssessmentJob(job, error)` with the **original claimed job object**. Both functions guard the write with `eq(assessmentJobs.leaseExpiresAt, job.leaseExpiresAt)` — the stale-claim value. After ≥1 heartbeat renewal the DB value no longer matches, the UPDATE affects 0 rows, a "stale lease" warning is logged, and the job stays `running` until the lease expires and recovery requeues it.

**Problem:**
The lease value used for the completion guard is never threaded back from the heartbeat. Short scans (<5 min) work; long scans (large clone + Playwright — exactly the production case the GH worker exists for) always double-run. The re-run persists a second `Assessment` row + second `assessment_completed` evidence for the same commit.

**Proposed simplification:**
Thread the current lease through: have `runClaimedAssessmentJob` return the latest `expectedLease`/`startedAt` and pass `{ ...job, leaseExpiresAt: expectedLease }` to `completeAssessmentJob` / `failAssessmentJob`. Alternatively, guard completion on `(id, startedAt)` only and drop the lease equality (the status=`running` check plus serial-per-project claim already prevents the races the lease guard was added for — verify this before choosing).

**Why this is safe:**
Claim, serial-per-project exclusion, cancellation, and recovery semantics are unchanged. Only the stale-write guard input becomes the actually-current lease instead of the claim-time lease.

**Impact:** Very High

**Complexity:** Small (one threading change + regression test: claim → renew lease → complete → assert `succeeded`).

**Evidence:**
`assessment-worker.ts:60-89` (local `expectedLease` renewed in heartbeat, never written back to `job`); `:209` `await completeAssessmentJob(job)`; `:217` `await failAssessmentJob(job, error)`; `assessment-jobs.ts:353-359` and `:394-400` (`eq(assessmentJobs.leaseExpiresAt, job.leaseExpiresAt …)` + `eq(assessmentJobs.startedAt, job.startedAt …)`).

---

### [x] P0-2 (implemented) — AI network calls run inside the project write lock + DB transaction

**Why:**
Every AI explanation / AI remediation click holds the per-project Postgres advisory lock **and an open transaction** for the duration of an LLM call (seconds to timeout). During that window all other writes for the project (including assessment applies and other users' actions) block behind the lock, and the idle transaction risks statement/idle-in-transaction timeouts and connection-pool exhaustion.

**Where:**
`src/server/actions/remediation-ai.ts` (`generateAiExplanationAction` L19–46, `generateAiRemediationAction` L48–128), `src/server/actions/define-action.ts` (`runFindingAction` L24–37 → `withFindingWrite`), `src/server/workspace/workspace-write.ts` (`withFindingWrite` L146–200: lock L163 → `await fn(…)` L195 → persist L198).

**Current flow:**
`runFindingAction` → `withFindingWrite` acquires `project-write:{id}` advisory lock inside `drizzle.transaction`, loads rows, then invokes the handler — and the AI handlers `await generateAiExplanation` / `await generateAiRemediation` (network) **inside that handler** before returning the payload.

**Problem:**
Network I/O inside a lock + transaction. The codebase already knows the correct pattern: `updateRuntimeAuditAction` does the DNS check **outside** the lock ("DNS check outside the write lock so a slow lookup does not block writers", `runtime-audit.ts:48-53`), and `verifyRemediationAction` scans **outside** the lock then re-validates inside (`remediation-verify.ts:149-264`). The AI actions are the exception.

**Proposed simplification:**
Call the AI **before** entering the write: load preview (finding + remediation + control) lock-free, run `aiCall`, then enter `withFindingWrite` and re-validate (finding still open, remediation still pre-approval — same TOCTOU pattern `verifyRemediationAction` already uses) before persisting the explanation/suggestion. No new abstraction; copy the verify-action shape.

**Why this is safe:**
Persistence, permission checks, stale-write guards, and evidence behavior are unchanged. The only behavioral change is that a concurrent edit between the AI call and the write now fails fast with "changed since scan" instead of silently winning — strictly safer.

**Impact:** Very High (lock-holding network calls are a production outage shape under concurrency)

**Complexity:** Small–Medium (restructure two actions + tests).

**Evidence:**
`workspace-write.ts:163` (lock) → `:195` (`await fn`) → `:198` (persist) — all inside `drizzle.transaction`; `remediation-ai.ts:33` and `:77` (`await generateAiExplanation` / `generateAiRemediation` inside the write callback); contrast `runtime-audit.ts:48-53` and `remediation-verify.ts:231-264` (correct outside/inside split).

---

### [x] P0-3 (implemented) — Cancel-during-apply race persists results despite "cancel saves nothing"

**Why:**
The documented cancel contract ("A cancel that lands mid-run discards the results: nothing is persisted", `assessment-worker.ts:111-113`) is not enforced atomically. A cancel landing **during** `applyAuthoritativeAssessment` still persists the full assessment; the job then stays `cancelled` while its results are live — the exact state the contract says cannot exist.

**Where:**
`src/server/assessment/assessment-worker.ts` (cancel check L114 before apply; apply L115–125; complete L209), `src/server/assessment/assessment-pipeline.ts` (`applyAuthoritativeAssessment` L186–242 — no lease/cancel guard inside the transaction).

**Current flow:**
`cancelledRemotely` is checked once before apply. `applyAuthoritativeAssessment` takes the advisory lock and writes assessment + findings + requirements + evidence + `assessment_job/completed` evidence with no re-check. `complete`/`fail` have lease guards that no-op after cancel, so the worker reports `cancelled` — while the apply it just performed is durable.

**Problem:**
Check-then-act across a minutes-long apply. Outcomes: (a) user told "cancelled / saves nothing" while a new assessment + status flips are live; (b) `assessment_job/completed` evidence references a `cancelled` job.

**Proposed simplification:**
Re-check cancellation **inside** the apply transaction (after acquiring the advisory lock, `SELECT status FROM assessment_jobs WHERE id = …` — abort the tx when not `running`), or pass the claim-time `(startedAt, leaseExpiresAt)` into the apply and add the same lease-equality guard the complete/fail paths use. One `SELECT`, no new table/column.

**Why this is safe:**
Authoritative applies, alerts, evidence, and locks are unchanged. The only new behavior is that a genuinely-cancelled apply rolls back instead of persisting — which is the documented contract.

**Impact:** High (incorrect terminal state: cancelled job with live results)

**Complexity:** Small.

**Evidence:**
`assessment-worker.ts:111-125` (comment promises discard; check is pre-apply only); `assessment-pipeline.ts:186-242` (transaction has advisory lock + alert read but no job-status re-check); `assessment-jobs.ts:341-368` (complete/fail *do* guard on lease — apply is the unguarded sibling).

---

### [x] P0-4 (implemented) — Draft-PR auto-verify marks `verified` on absence, not on proof of fix

**Why:**
`verifyDraftPrRemediation` advances `approved → implemented → verified` whenever a finding **resolves** (is absent) in a run whose scope merely *included the file*. Absence after a scoped re-scan is weak proof: snippet-identity mismatch (formatting drift, line-ending change, Prettier), registry/check changes, or merge-authority filtering can all resolve a finding without any fix being applied — and the scope guard cannot distinguish "fixed" from "no longer matched".

**Where:**
`src/server/assessment/assessment.ts` (`verifyDraftPrRemediation` L135–215, invoked L435–443).

**Current flow:**
On reconcile-resolve of a source finding with an `approved` + `create_draft_pull_request` remediation: skip only if `sourcesUnchanged` or the file is outside `scopedFileSet`; otherwise double-advance to `verified` + write `remediation_implemented` + `remediation_verified` evidence.

**Problem:**
Verification is the product's trust anchor ("verified only via deterministic re-check"). This path verifies on *non-detection*, and the "re-scan scope proof" proves the file was scanned, not that the fix content is present. A reformat that changes the snippet both resolves the old finding (snippet mismatch → new finding minted alongside, or resolve if the new scan emits nothing for that check) and auto-verifies the remediation for a fix that was never confirmed.

**Proposed simplification:**
Require positive proof before auto-verify: after a resolve, confirm the finding's `fix` can no longer be located **and** the post-image content is present — e.g. re-run `locateViolationInProject(rootPath, finding)` (already exists, `assessment-findings.ts:114-134`) and only auto-verify when the violation instance is genuinely gone *while the file still exists and was scanned*; if the file's content no longer contains the old snippet at all (rewrite/rename), emit `implemented` (fix plausible, needs human confirm) instead of `verified`, with evidence saying why. Keep the existing scope guard as a pre-filter.

**Why this is safe:**
Draft-PR merge → reassess → verify loop still works for real fixes. False verifications become `implemented + evidence` (human closes the loop) instead of `verified`. No status-law change; the `advanceRemediation` machine is untouched.

**Impact:** Very High (incorrect verification is the top product risk)

**Complexity:** Medium (needs a `locateViolationInProject` re-check + two tests: reformat-without-fix must not verify; real fix must).

**Evidence:**
`assessment.ts:153-180` (scope-only guard), `:182-192` (double `advanceRemediation` to `verified`), `:193-214` (evidence claims "Verified by deterministic reassessment"); `assessment-findings.ts:49-81` (`sameInstance` raw snippet equality — the mismatch source).

---

## P1 — High

### [x] P1-1 (implemented) — Matched findings rewrite `assessmentId` every run, defeating the no-op upsert optimization

**Why:**
Every assessment rewrites **every open finding row** even when nothing changed, churning `updatedAt` on the whole findings table per run, defeating `changedSinceLoaded`, inflating write volume (N upserts per push for N open findings), and making `updatedAt` useless as a "last real change" signal for the stale-write guards.

**Where:**
`src/server/assessment/assessment-findings.ts` (`reconcileControlFindings` L294–306: `existing.assessmentId = assessmentId` on every match; same L270–281 for re-detected), `packages/db/src/repo/apply.ts` (`changedSinceLoaded` L159–170 compares full objects ignoring only `updatedAt`).

**Current flow:**
Raw → match open finding → mutate `assessmentId`/`fix`/`location`/analyzer fields in place → return full `rows.findings` → `applyAssessmentPayload` → `changedSinceLoaded` sees `assessmentId` differ → upserts the row → `stampedNow` bumps `updatedAt`.

**Problem:**
`Finding.assessmentId` conflates two things: "assessment that created this finding" and "assessment that last saw it". The latter changes every run by construction, so the change-detection that was carefully built (`changedSinceLoaded`, `equalIgnoringUpdatedAt`) can never no-op on findings.

**Proposed simplification:**
Split the semantics: keep `assessmentId` as creation assessment (write-once), and either (a) drop "last seen" tracking entirely (resolves already prove liveness; latest assessment per project is queryable), or (b) track it as a non-persisted / separately-updated `lastSeenAssessmentId` excluded from the change comparator. Option (a) is preferred — one field, write-once, zero churn. Check UI/API consumers of `finding.assessmentId` first (`findings` indexes on `(projectId, assessmentId)` exist — confirm they serve a real query before removing).

**Why this is safe:**
Finding identity, matching, resolution, dismissal, and status derivation never read `assessmentId` (they use `controlId`/`checkId`/location). Evidence rows already carry per-run `assessmentId` for audit trail.

**Impact:** High (write amplification on every assessment; stale-guard signal quality)

**Complexity:** Medium (schema payload change is JSONB — no migration; touch reconcile + mapper + index review + tests).

**Evidence:**
`assessment-findings.ts:297` (`existing.assessmentId = assessmentId`), `:273` (re-detected path); `apply.ts:159-170` (`changedSinceLoaded`/`equalIgnoringUpdatedAt` — `assessmentId` is compared); `schema.ts:197-199` (`findings_project_assessment_idx` — verify consumer before dropping).

---

### [x] P1-2 (implemented) — Remove the Vercel self-fetch degraded fallback; it reintroduces the failure mode the queue was built to escape

**Why:**
Three drain paths (GH dispatch → self-fetch → 15-min schedule, plus inline dev drain) for one queue. The middle path runs the scan on Vercel serverless — the exact environment whose 300s ceiling and `@sparticuz/chromium` divergence motivated the durable queue + GH executor. Keeping it means every dispatch outage silently produces the worst-quality scans (timeouts → stranded `running` rows → lease recovery), instead of cleanly waiting for the schedule backstop minutes later.

**Where:**
`src/server/assessment/assessment-job-inline.ts` (`scheduleAssessmentDrain` L96–103, `triggerWorkerSelfFetch` L106–129), `src/app/api/github/webhook/route.ts` (comment L117–123 documents the self-fetch chain).

**Current flow:**
`scheduleAssessmentDrain`: inline (dev/e2e) → `dispatchAssessmentWorker()` → `triggerWorkerSelfFetch()` (POST own `/api/internal/jobs/run?limit=1` via `AUTH_URL`, failures swallowed as warnings).

**Problem:**
Unnecessary branch with its own secrets/config surface (`AUTH_URL`, self-fetch rate-limit bucket, `assessment_opportunistic_drain_failed` warnings) that buys at most minutes of latency over the 15-min schedule while risking timeout-corrupted runs.

**Proposed simplification:**
`scheduleAssessmentDrain` becomes: inline when `shouldDrainAssessmentJobsInline()`, else dispatch + return. Delete `triggerWorkerSelfFetch`. Keep the GH 15-min schedule as the sole backstop (it already covers failed dispatches, killed tasks, expired leases). If dispatch latency ever matters, shorten the schedule — one knob, not a second executor.

**Why this is safe:**
No job is ever lost: failed dispatch leaves the job `queued`, and the schedule + lease recovery drains it. The Vercel route stays for schedulers that call it directly; only the *opportunistic self-call* disappears.

**Impact:** High (removes a whole executor path + its config/secrets/logs)

**Complexity:** Small (delete ~30 lines + docs; keep route + tests for direct callers).

**Evidence:**
`assessment-job-inline.ts:74-103` (docstring admits "degraded path … kept only … until the GH executor is proven"); `:106-129` (self-fetch with swallowed failures); `actions/assessment.ts:110-113` (comment: direct scans "timed out the dashboard function … and left stranded running rows" — the fallback reintroduces this).

---

### [x] P1-3 (implemented) — Site-level verify runs a full runtime scan inside a Server Action (no queue, lease, or timeout)

**Why:**
"Verify fix" on a `site` finding calls `scanRuntime` (full multi-route browser audit) synchronously inside the user-facing Server Action request. On Vercel this races the function ceiling; on failure modes (preview down, 0 pages) it burns a browser launch to produce an error string. It is the only place besides the queue that runs the heavy browser stack interactively.

**Where:**
`src/server/actions/remediation-verify.ts` (site branch L193–223: `await scanRuntime({…})` inside the action, before `withFindingWrite`).

**Current flow:**
Action → preview loads → `scanRuntime` over all `runtimeRoutes` → `sameInstance` compare → `withFindingWrite` persist verdict.

**Problem:**
Heavyweight work (browser launch, N page navigations, link checks) with request-scoped lifetime, no retry, no lease, no progress. The assessment pipeline already runs this exact scan durably; the verify path duplicates it ad hoc.

**Proposed simplification:**
Scope the re-check to the finding's own pages (`finding.location.pages` — typically 1–2 URLs) instead of the full route set, with a tight timeout; **or** route site-verify through the assessment job queue (enqueue a scoped verify job, poll like the dashboard pipeline). Minimum: cap routes to the finding's pages + add timeout + keep the distinct error messages (they're good UX: `PREVIEW_UNREACHABLE_MESSAGE` / `NO_PAGES_SCANNED_MESSAGE` / `SITE_CHECKS_NOT_RUN_MESSAGE`).

**Why this is safe:**
Verdict logic (`sameInstance` + `markVerified` + scoped status refresh) is untouched; only the scan input is narrowed to the pages the verdict actually reads.

**Impact:** High (latency, timeouts, browser cost on every site verify)

**Complexity:** Small (narrow input) to Medium (queue routing).

**Evidence:**
`remediation-verify.ts:195-198` (`scanRuntime` with full project routes inside action); contrast `assessment.ts:362-378` (same scan, durably queued with lease + heartbeat); `finding-types.ts:53-58` (`SiteLocation.pages` — the verdict only needs these).

---

### [x] P1-4 (implemented) — Non-draft-PR remediations can never auto-verify: resolved findings leave remediations stuck at `approved`

**Why:**
`verifyDraftPrRemediation` returns early unless `remediation.approvalAction === "create_draft_pull_request"`. Every other approval path (bulk approve of runtime guidance, manual approve + direct push to default branch, approve + external fix) resolves the finding on reassessment but leaves the remediation at `approved`/`implemented` forever — the loop never closes without manual bookkeeping, and requirement/finding say "fixed" while remediation says "approved".

**Where:**
`src/server/assessment/assessment.ts` L146 (`approvalAction` gate), `src/core/remediation-lifecycle.ts` (linear `detected → suggested → approved → implemented → verified`), `src/server/actions/remediation.ts` (`approveRemediationInPayload` — check whether it sets `approvalAction` for non-PR approvals).

**Current flow:**
Finding resolved by reassessment → `onFindingResolved` → only draft-PR approvals advance; all others keep their status. There is no other writer that advances `approved → implemented → verified` off a reassessment.

**Problem:**
Two-tier verification: draft-PR fixes get automatic closure, everything else silently stalls. Combined with P0-4, the fix must generalize carefully (positive proof, not absence).

**Proposed simplification:**
Generalize auto-verify to any `approved`/`implemented` remediation whose finding resolves **with positive proof** (see P0-4's `locateViolationInProject` re-check): advance to `verified` with evidence noting the proof method; keep the `create_draft_pull_request` fast path as-is. Do this in the same change as P0-4 — one proof helper, two callers.

**Why this is safe:**
Status machine unchanged; sticky human decisions and requirement derivation untouched. Remediations that resolve without proof stay where they are (fail closed, as today for non-PR paths).

**Impact:** High (closes the loop for all non-PR fix flows)

**Complexity:** Medium (shared with P0-4).

**Evidence:**
`assessment.ts:146` (early return on `approvalAction`); `:182-192` (the only reassessment-driven advance in the codebase — grep `advanceRemediation` writers: lifecycle, remediation actions, verify action, assessment).

---

### [x] P1-5 (implemented) — Source finding identity uses raw snippet equality: any reformat churns findings and orphans remediation state

**Why:**
`sameInstance` matches source findings by exact `snippet` string equality. A Prettier run, line-ending change, or unrelated edit that shifts the snippet text resolves the old finding and mints a new one (new id → new remediation row at `detected`, prior approval/evidence orphaned to the resolved row, `finding` detected/resolved evidence pair per churned finding). One format commit can reset the remediation state of an entire project.

**Where:**
`src/server/assessment/assessment-findings.ts` (`sameInstance` L49–81, snippet branch L58–60), `packages/analysis-core/src/runtime/dom-location.ts` (`normalizeSnippetKey` — normalization exists for DOM, not for source identity).

**Current flow:**
Snippet equality when both sides carry snippets, else line fallback. Reconcile runs per control per assessment; churned matches become resolve + create (+2 evidence rows + new remediation row each).

**Problem:**
Identity should survive formatting; it currently survives nothing but byte-identical text. The runtime side already learned this (selector-first identity + `normalizeSnippetKey`); the source side didn't.

**Proposed simplification:**
Normalize source snippets before identity comparison (trim/collapse whitespace at minimum — reuse/extend `normalizeSnippetKey`), keeping the line fallback. Do **not** switch to span/offset identity (drifts worse). Add a test: Prettier-reformatted fixture must match, genuinely-changed code must not.

**Why this is safe:**
Matching, resolution, dismissal re-open, and auto-verify scope logic all flow through `sameInstance` — one function, total coverage. Normalization only *reduces* false churn; it cannot merge two genuinely different violations that share a file+check but differ in normalized content… (verify: two identical normalized snippets on different lines fall back to line comparison today only when a snippet is missing — with normalization both present and equal → match. Same behavior as today for byte-identical duplicates; acceptable and strictly better than today.)

**Impact:** High (remediation-state survival across real-world commits)

**Complexity:** Small (one comparator + tests).

**Evidence:**
`assessment-findings.ts:58-60` (raw `left.snippet === right.snippet`); `:63-71` (DOM side uses selector-first — the asymmetry); `dom-location.ts` (`normalizeSnippetKey` precedent).

---

### [x] P1-6 (implemented) — `sourcesUnchanged` fast path can never fire without a `git` binary (all Vercel-fallback scans pay full cost)

**Why:**
The skip-scan optimization requires `readRepoHead` (shells out to `git rev-parse`) on both sides — but `repo-checkout.ts` documents "no `git` CLI — serverless runtimes don't ship one". On any runtime without git, `head` is `undefined`, `sourcesUnchanged` is false by construction, and every run pays: full SHA-256 re-hash of the tree (`captureSnapshot`), full AST scan, and (via P1-1) full finding rewrites.

**Where:**
`src/server/assessment/monitor.ts` (`readRepoHead` L20–29 via `execFileSync("git",…)`), `src/server/assessment/assessment.ts` (`sourcesUnchanged` L269–273 requires both heads defined), `src/server/assessment/repo-checkout.ts` L9–11 (no-git-CLI comment).

**Current flow:**
`readRepoHead` → catch → `undefined` → `detectChanges` falls to `captureSnapshot` (reads + hashes every file) → `sourcesUnchanged=false` → full `scanProject`.

**Problem:**
The optimization's precondition (git CLI) contradicts the platform constraint (no git CLI) on exactly the path that needs it most. isomorphic-git (already a dependency, used for clone) can read HEAD without a binary.

**Proposed simplification:**
Resolve HEAD via isomorphic-git (`git.resolveRef({ fs, dir, ref: "HEAD" })`) with the CLI as fallback, not the other way round. One function change in `monitor.ts`; the `sourcesUnchanged` logic, snapshot format, and scan paths are untouched. Bonus: `detectChanges` already short-circuits on `gitHead` equality — with a working HEAD reader the whole snapshot re-hash is skipped too.

**Why this is safe:**
Pure read-path change; HEAD value semantics identical (40-hex commit or undefined). All downstream logic (snapshotKey, scoped scan, resolve scope) unchanged.

**Impact:** High on Vercel path (skip redundant full scans/hashes); neutral on GH worker (git present, behavior identical)

**Complexity:** Small.

**Evidence:**
`monitor.ts:20-29` (`execFileSync("git", …)` + swallow); `assessment.ts:269-273` (`previous?.snapshot?.gitHead !== undefined && head !== undefined && …`); `repo-checkout.ts:9-11` ("no `git` CLI — serverless runtimes don't ship one").

---

## P2 — Medium

### [ ] P2-1 — Collapse the five-file drain orchestration (runner + inline + dispatch + route glue) into one scheduler module

**Why:**
Queue → run spans `assessment-runner.ts` (batch loop + teardown), `assessment-job-inline.ts` (drain + schedule + self-fetch), `assessment-job-dispatch.ts` (dispatch), `assessment-worker.ts` (claim→run→settle), and `api/internal/jobs/run/route.ts` (batch parsing). A new developer must read five files to answer "how does a job run". After P1-2 (delete self-fetch), runner + inline are thin wrappers around each other.

**Where:**
`src/server/assessment/assessment-runner.ts`, `assessment-job-inline.ts`, `assessment-job-dispatch.ts`, `assessment-worker.ts`, `src/app/api/internal/jobs/run/route.ts`, `scripts/assessment-worker-drain.ts`, `scripts/build-worker.mjs`.

**Current flow:**
Route parses `limit`/`concurrency` → `runAssessmentJobBatch` (prune + sequential/pool) → `processNextAssessmentJob` (claim) → `settleRunningAssessmentJob` → `runClaimedAssessmentJob`. Inline path: `scheduleAssessmentDrain` → `drainAssessmentJobsInline` → `drainAssessmentJobQueue` (dynamic import of runner!) → `runAssessmentJobBatch`. The dynamic import exists only to keep trigger sites from statically reaching the scan stack.

**Problem:**
Two batch loops (`runAssessmentJobBatch` vs `drainAssessmentJobQueue` wrapper counting by kind), two drain entry points, dynamic import dance, three default limits (20 inline / 10 route / 10 GH workflow), and a bespoke esbuild worker bundle — for claim → run → settle.

**Proposed simplification:**
One `assessment-scheduler.ts`: `scheduleAssessmentDrain()` (inline-or-dispatch decision), `drainQueue({limit, concurrency})` (single batch loop returning counts), re-exported worker-result types. Keep `assessment-worker.ts` (claim→run→settle) and `assessment-jobs.ts` (SQL) as-is — they have real cohesion. Unify the limit default in one constant consumed by the route, inline path, and workflow docs. Keep the dynamic-import boundary but document it once. Evaluate deleting `build-worker.mjs` (run the drain via `tsx` like `db:migrate` does — one fewer build artifact).

**Why this is safe:**
No queue, claim, lease, retry, or scan semantics change. Pure module-boundary move + dead-path deletion (after P1-2).

**Impact:** Medium (est. −2 files, ~150 lines, one default, one build script)

**Complexity:** Medium.

**Evidence:**
`assessment-job-inline.ts:29-46` (`drainAssessmentJobQueue` wraps `runAssessmentJobBatch` to recount by kind); `:96-103` (three-branch scheduler); `assessment-runner.ts:50-89` (second loop with pool); route `:27-60` (separate limit/concurrency schemas); workflow `:33-36` (third copy of defaults).

---

### [ ] P2-2 — Give jobs real stage progress instead of derived checkoutMs + 3s status polling

**Why:**
Today the UI knows only `queued`/`running` (+ job history). Long scans are a black box: `checkoutMs` is *derived* (`total − scan − apply`, `assessment-worker.ts:136-145`), in-scan splits live only in evidence/logs after completion, and a killed function leaves nothing but "the last progress line names the stall" (`assessment.ts:245-249`). Users refresh a Pipeline section that cannot answer "what is it doing".

**Where:**
`src/server/assessment/assessment-worker.ts` (timing L136–145), `src/server/assessment/assessment.ts` (`timed()` L244–255, `stageMs` L490), `src/components/dashboard/dashboard-pipeline-section.tsx` + `assessment-job-status-live` (polling UI), `src/app/api/projects/[projectId]/assessment-jobs/route.ts` (poll endpoint).

**Current flow:**
`console.info([progress] …)` markers → Vercel/GH logs. `stageMs` persisted post-hoc on `assessment_completed` evidence. UI polls job rows every 3s.

**Problem:**
Two progress systems (logs vs job status) with no shared representation; derived timings instead of measured ones (checkout hooks were avoided "to avoid hooks inside the checkout helper" — a hook parameter is cheap); no stage survives a crash.

**Proposed simplification:**
Add a lightweight progress update: `job.payload.stage` (`checkout` | `changedetection` | `ast` | `runtime` | `reconcile` | `apply`) + `stageStartedAt`, written fire-and-forget at each `timed()` boundary (best-effort, never fails the run — same posture as heartbeats). Measure checkout directly with a hook parameter on `withProjectCheckout` instead of deriving it. UI renders the stage string; logs keep the markers. Do **not** build an event system / websocket / separate progress table.

**Why this is safe:**
Payload-only, best-effort writes; claim/lease/complete logic untouched; stale payload writes are harmless (status column remains the source of truth).

**Impact:** Medium (real UX progress; attributable production slowness)

**Complexity:** Medium (payload schema + ~6 write sites + UI string).

**Evidence:**
`assessment-worker.ts:92-96` (comment explaining why checkout is derived, not measured); `:141` (`checkoutMs: Math.max(totalMs − scanMs − applyMs, 0)`); `assessment.ts:246-249` (crash leaves only log lines); `dashboard-pipeline-section.tsx` (polls job rows only).

---

### [ ] P2-3 — `reconcileControlFindings` re-filters all findings per control (O(C×F)×2); index once

**Why:**
Per assessment run, per control: two full-array `.filter` passes over all findings (`openFindings`, `dismissedFindings`), plus `rawFindings.filter(checkId)` per control in `assessment.ts:426-428` (O(C×R)). The status-refresh module already solved this exact problem with `openFindingsByControlId` ("O(controls × findings) → O(findings + controls)", `assessment-status.ts:349-357`). Reconcile is the hotter loop (it also mutates + writes evidence) and still does the naive thing.

**Where:**
`src/server/assessment/assessment-findings.ts` L244–255, `src/server/assessment/assessment.ts` L419–431 (`rawForControl` filter per control).

**Proposed simplification:**
Build `openByControl`, `dismissedByControl`, and `rawByCheckId` maps once per run (same shape as the status module's map) and pass them into `reconcileControlFindings`. Mechanical change; keep the per-control function signature otherwise.

**Why this is safe:**
Pure in-memory iteration-order change; matching/resolution/evidence semantics untouched. (Note: today's `matchPool` ordering and `rows.findings[rows.findings.length − 1]` created-row pickup must be preserved — keep per-control processing order.)

**Impact:** Medium (scales with controls × findings; ~100 controls today)

**Complexity:** Small.

**Evidence:**
`assessment-findings.ts:244-255` (two `.filter` per control); `assessment.ts:426-428` (third per-control filter); `assessment-status.ts:349-357` (in-repo precedent for the indexed version).

---

### [ ] P2-4 — The checkout tree is walked 4–5× per run under two different file scopes

**Why:**
Per assessment: quota walk(s) (`assertCheckoutWithinQuota`, twice when a ref is given — pre-fetch + post), `captureSnapshot` hash walk, `listSourceFiles` inside the scan, and per-file reads in the scan + suggestion builder. Worse, the walks disagree on scope: snapshot enumerates `"script"` files, the AST scan enumerates `"jsx"` files (`monitor.ts:33` vs `scan.ts:53`), and quota walks everything except `.git`. Three enumerations, three extension policies, one tree.

**Where:**
`src/server/assessment/repo-checkout.ts` (`assertCheckoutWithinQuota` L43–86, called L234 + L262), `src/server/assessment/monitor.ts` (`captureSnapshot` L31–38), `packages/analysis-core/src/scan.ts` (`scanProject` L52–62), `packages/analysis-core/src/source-files.ts` (two scope flags).

**Proposed simplification:**
(a) Unify on one `listSourceFiles` scope for snapshot + scan (snapshot hashes a superset the scan never reads — align them and document why if the superset is intentional for change detection); (b) fold the quota check into the snapshot walk (bytes/files counted while hashing — one walk instead of two/three). Keep `buildSuggestion`'s `fileTextCache` (already correct).

**Why this is safe:**
Change-detection semantics preserved (same hashes, same paths); quota enforced at the same thresholds, just during an existing walk. Scan input unchanged.

**Impact:** Medium (I/O + hashing on every run, multiplied on large repos)

**Complexity:** Medium (touches checkout/snapshot contract — snapshot format must stay backward-compatible for `detectChanges` diffing).

**Evidence:**
`repo-checkout.ts:234` + `:262` (double quota walk for ref checkouts); `monitor.ts:33` (`listSourceFiles(rootPath, "script")`); `scan.ts:53` (`listSourceFiles(rootPath, "jsx")`).

---

### [ ] P2-5 — Remediation `history[]` duplicates evidence rows; derive the history view instead of storing both

**Why:**
Every remediation transition writes **two** records: a `history` entry appended to the remediation payload *and* an evidence row (`remediation_approved/_implemented/_verified`, plus `ai_remediation_suggested`). They carry the same `(status, at, note)` triple in different shapes, both persisted, both migrated forever. Evidence is already the append-only audit trail and is already queried per finding (`evidence_finding_at_idx`).

**Where:**
`packages/analysis-core/src/contract/entities.ts` (`RemediationHistoryEntry` L111–115, `Remediation.history`), `src/core/remediation-lifecycle.ts` (`appendRemediationHistory`), `src/server/assessment/remediation-evidence.ts`, finding-history UI (`remediation-history.tsx`).

**Current flow:**
`advanceRemediation` appends history **and** every caller separately appends evidence with the same note (e.g. `assessment.ts:206-214`, `remediation.ts` approve path, `remediation-verify.ts`).

**Problem:**
Dual-write of the same fact; the two can diverge (a transition that forgets evidence, or evidence without history — e.g. AI explanation writes neither consistently). Readers must know which source to trust per event type.

**Proposed simplification:**
Keep `Remediation.status` + `suggestion` as the persisted state; render history UI from finding-scoped evidence (kinds `remediation_*` + `ai_remediation_suggested` already carry notes in `detail`). Stop appending to `history[]` for new transitions (keep the field for old rows, ignore in UI). **Do not** delete the column (JSONB payload — just stop writing it) and do **not** merge Finding/Remediation tables — the remediation state machine (`remediation-lifecycle.ts`) is meaningful domain, only the duplicated *log* goes.

**Why this is safe:**
Evidence rows already exist for every transition written through the current code paths; the finding page already loads finding evidence. Status/approval/verify logic reads `status`, never `history` (verify this — grep `history` readers before cutting).

**Impact:** Medium (one dual-write removed; smaller remediation payloads rewritten on every upsert)

**Complexity:** Medium (UI history component re-point + backfill-free coexistence).

**Evidence:**
`entities.ts:117-130` (Remediation shape); `remediation-lifecycle.ts:49-63`; `remediation-evidence.ts` (parallel record); `schema.ts:263-271` (finding-scoped evidence index already supports the query).

---

### [ ] P2-6 — AI suggestions/explanations go stale silently when findings are re-scanned

**Why:**
AI outputs are persisted onto the finding/remediation rows with no link to the scan that produced them. When reassessment updates `location`/`fix` (match path L299–305) or resolves + re-creates the finding (P1-5 churn), the stored AI suggestion still describes the old snippet — and nothing marks it stale. Engineers can approve a suggestion for code that no longer exists.

**Where:**
`src/server/actions/remediation-ai.ts` (suggestion persisted L100–109, explanation pushed L41–42), `src/server/assessment/assessment-findings.ts` (match path refreshes `location`/`fix` L296–305 without touching `suggestion`/`explanations`), `packages/analysis-core/src/contract/finding-types.ts` (`RemediationSuggestion` has `generatedAt`, no scan/commit ref).

**Proposed simplification:**
Stamp AI artifacts with the producing context (`assessmentId` + `snapshot.gitHead` already available at call time) and surface "suggestion predates latest scan" in the UI when the finding's `assessmentId`/location moved on; refresh-or-discard on re-detect (re-detected path L268–292 is the natural invalidation point — drop AI artifacts there with evidence, since the code changed under them). Also cap `explanations[]` growth (e.g. keep latest AI + deterministic baseline) — today every click appends forever and each append rewrites the whole finding row (bumps `updatedAt`, fights the stale guard).

**Why this is safe:**
No AI, status, or verification logic changes. Stale suggestions become visible instead of silently wrong; approval still requires the same human step.

**Impact:** Medium (prevents approvals against outdated code)

**Complexity:** Small–Medium.

**Evidence:**
`remediation-ai.ts:100-123` (persist with no scan ref); `assessment-findings.ts:294-306` (location/fix refreshed, suggestion untouched); `finding-types.ts:171-179` (no provenance-of-scan fields).

---

### [ ] P2-7 — `STRUCTURAL_CHECK_IDS` is a hardcoded parallel list duplicating registry metadata

**Why:**
`assessment.ts:62-66` hardcodes `heading-order / list-structure / duplicate-id` with a comment explaining *why* they force full scans — while `check-authority.ts` already exposes `isCompositionSensitiveCheck` over the single `CHECK_REGISTRY`, and `merge-findings.ts` already consumes it for the same concept. Adding a composition-sensitive check means updating two lists in two packages (the exact failure mode the registry refactor eliminated — see `check-authority.ts:9-13`).

**Where:**
`src/server/assessment/assessment.ts` L56–66 + L318–325 (`forceFullScan`), `packages/analysis-core/src/check-authority.ts` (`isCompositionSensitiveCheck`), `packages/analysis-core/src/merge-findings.ts` (existing consumer).

**Proposed simplification:**
Replace the set literal with `scoped.some(c => c.checkId && isCompositionSensitiveCheck(c.checkId))`. If the force-full-scan set intentionally differs from merge-authority's set, encode the distinction *in the registry* (e.g. `crossFile: boolean`) rather than a second list.

**Why this is safe:**
Behavior identical today (verify the three ids are exactly the composition-sensitive set — test enforces it going forward).

**Impact:** Medium (kills a silent-drift list)

**Complexity:** Small.

**Evidence:**
`assessment.ts:56-66` ("…must scan the full tree" hardcoded set); `check-authority.ts:25-26` + `merge-findings.ts:29-40` (same concept, registry-driven).

---

### [ ] P2-8 — Double DB loads around every finding write (preview loads + locked reload)

**Why:**
`verifyRemediationAction` performs `getWorkspace()` + `requireFinding` + `requireRemediationForFinding` (3 reads, one a full tenancy load) *before* `withFindingWrite`, which then re-loads everything under the lock (`getFindingById` + `loadProjectWriteDb`). The pre-lock loads exist only to compute `present` from preview data — but they load far more than the scan needs (full workspace for a control lookup + one finding).

**Where:**
`src/server/actions/remediation-verify.ts` L158–165 → L233–264, `src/server/workspace/workspace-write.ts` L159–186.

**Proposed simplification:**
Replace the `getWorkspace()` preview with the same light reads the lock path uses (`getFindingById` + control lookup; project comes from the finding's `projectId`), keeping the in-lock re-validation (the TOCTOU check is correct and stays). Saves one tenancy load per verify click; same for other `runFindingAction`+preview patterns if they exist (grep `getWorkspace()` in actions).

**Why this is safe:**
Permission check still runs inside the lock on live rows (`requireOnFindingProject`, `workspace-write.ts:186`); the verdict still re-validates live state before writing.

**Impact:** Medium (read amplification on interactive path; pattern fix)

**Complexity:** Small.

**Evidence:**
`remediation-verify.ts:158-165` (tenancy + finding + remediation loads) vs `:233-247` (re-load + re-validate inside lock — the loads at :158-165 are provably redundant for correctness).

---

### [ ] P2-9 — Axe crash fails the whole scan while every other engine failure is contained

**Why:**
Engine containment is inconsistent: throwing custom probes are recorded on `probeFailures` and the pass continues; html-validate failures are non-fatal; but "an axe crash still fails the scan" (architecture doc). One flaky page (axe OOM/timeout on a large DOM) fails the job → 3 retries of full scans → terminal failure evidence — for a defect in *one sub-engine on one page*.

**Where:**
`packages/analysis-core/src/runtime/scan.ts` (orchestration; `classifyRuntimeScanError` in `scan-error.ts`), `docs/ai/architecture.md` L141–143 (documents the inconsistency).

**Proposed simplification:**
Contain axe per page like custom probes: on axe crash, record the page + error on the run (extend the existing `probeFailures`-style record / `runtimeError` on `AssessmentEngines`), continue other pages, and let authority gates do their job (`runtimeRan` requires `pagesScanned > 0`, `assessment.ts:375-378` — a total axe outage still yields `runtimeRan=false` → `unable_to_verify`, never false `passed`). Only fail the job when *zero* pages produce results across all engines.

**Why this is safe:**
Status law already handles partial runtime data faithfully (authority gates degrade to `unable_to_verify`). Failing closed on total outage is preserved; partial outages become visible-but-degraded instead of job-fatal.

**Impact:** Medium (fewer spurious job failures/retries on large sites)

**Complexity:** Medium (touch runtime orchestration + tests; verify `runtimeViolationStillPresent` single-page path still fails loudly — it should, it's a user-facing verdict).

**Evidence:**
`architecture.md:141-143` ("a throwing custom probe … continues. html-validate failures are non-fatal. An axe crash still fails the scan."); `assessment.ts:375-378` (`runtimeRan` gate already fail-safe); `runtime/scan.ts` + `scan-error.ts` (per-page error classification exists — reuse it).

---

### [ ] P2-10 — Manual double-submit can double-enqueue (active-job check races the enqueue, on a separate connection)

**Why:**
`runAssessmentAction` checks `activeAssessmentJobForProject` then `enqueueAssessmentJob` — but the check runs on its own `getDrizzle()` connection (`assessment-jobs.ts:432-453`), outside the `withProjectWrite` transaction/lock that wraps the enqueue. Two simultaneous clicks can both see "no active job" and enqueue twice. Harmless today (serial claim runs both scans back-to-back) but wasteful and confusing ("already running" copy exists precisely to prevent this).

**Where:**
`src/server/actions/assessment.ts` L69–92, `src/server/assessment/assessment-jobs.ts` L432–453.

**Proposed simplification:**
Either (a) perform the active check inside the same transaction (pass `tx` — requires threading the tx object into the job module, contradicting its `getDrizzle()` style), or (b) keep the check as UX polish and enforce singularity at the claim layer (already serial — the real cost is a wasted queued scan; cheap fix: on enqueue with trigger `manual`, coalesce like webhook jobs do — refresh an existing queued manual job instead of inserting). Option (b) reuses the proven coalescing code path.

**Why this is safe:**
Claim/lease/retry untouched. Manual UX unchanged except the race window collapses to at most one redundant queued row, same as webhook behavior today.

**Impact:** Medium (prevents stacked full scans on double-click/retry)

**Complexity:** Small.

**Evidence:**
`actions/assessment.ts:73` (`await activeAssessmentJobForProject` inside `withProjectWrite` callback — but that function opens its own connection, `assessment-jobs.ts:433`); `assessment-jobs.ts:155-210` (webhook coalescing precedent).

---

### [ ] P2-11 — Requirements upsert churns row `id` on conflict; findings cascade off assessments

**Why:**
Two schema-level sharp edges: (a) `upsertRequirements` conflicts on `(projectId, controlId)` but `SET id = excluded.id` — every concurrent writer mints a fresh UUID and *replaces* the row id, so stable requirement identity doesn't exist across writers (any external reference, log, or future FK to requirement id dangles). (b) `findings.assessmentId → assessments ON DELETE CASCADE`: deleting an assessment row deletes findings (project reset/disconnect paths must be audited for data loss beyond intent).

**Where:**
`packages/db/src/repo/requirements.ts` L33–68 (conflict target + `id: sql\`excluded.id\``), `packages/db/src/schema.ts` L181–206 (findings FK cascade), reset/disconnect actions (`project_reset` evidence kind — find the deleter).

**Proposed simplification:**
(a) Stop overwriting `id` on conflict — keep the existing row id (`SET` payload/status only; fall back to deterministic ids `projectId:controlId`-derived if writers need convergence without a read). (b) Audit the reset/disconnect delete path; if assessment deletion is used for retention/reset, either scope the cascade deliberately (document) or null the FK. Both are verify-first, change-second.

**Why this is safe:**
Requirement identity is `(project, control)` everywhere in code (unique index already enforces it); id stability only *adds* guarantees. Findings cascade behavior becomes explicit instead of incidental.

**Impact:** Medium (identity stability; prevents reset-time surprises)

**Complexity:** Small–Medium.

**Evidence:**
`requirements.ts:55-67` (comment explains convergence, but `id: sql\`excluded.id\`` also swaps identity); `schema.ts:189-191` (`assessment_id … references … onDelete: cascade`).

---

### [ ] P2-12 — Assessment `summary` is persisted derived state with an unverified second reader

**Why:**
`Assessment.summary` (counts by requirement status at completion) duplicates what `dashboard-status-counts` presumably computes live. If both exist, they can disagree the moment a human edits a requirement post-assessment — and there is no documented rule for which the UI trusts.

**Where:**
`packages/analysis-core/src/contract/entities.ts` L56, `src/server/assessment/assessment.ts` L455–457 (computed from `requirementsInScope` at completion), `src/components/dashboard/dashboard-status-counts*`.

**Proposed simplification:**
Verify the single consumer of `assessment.summary` (likely the completion evidence / report input). If reports need point-in-time counts, keep it *as an explicit snapshot for reports* and make the dashboard use live counts; document the rule in one line at the entity. If no consumer needs the snapshot, stop persisting it (derive on read).

**Why this is safe:**
Read-path-only change; assessment completion and requirement derivation untouched.

**Impact:** Low–Medium (kills a "which number is right" class of bug)

**Complexity:** Small (verify + document; possibly delete a field from the JSONB payload — backward compatible).

**Evidence:**
`entities.ts:46-60` (summary on the record); `assessment.ts:479-493` (summary also embedded in `assessment_completed` evidence detail — two persisted copies already).

---

## P3 — Low

### [ ] P3-1 — Three definitions of the job contract (contract const, core zod schema, zod-free guard)

**Why:**
`packages/analysis-core/.../assessment-jobs.ts` (status/trigger consts), `src/core/assessment-jobs.ts` (zod payload schema + inferred types), `src/core/assessment-job-guard.ts` (zod-free client copy). The status single-source comment is honored, but the *payload* shape lives in two places (zod + guard) with no test pinning them together.

**Where:** The three files above.

**Proposed simplification:**
Keep the split (server zod vs client-safe guard is justified), but add one cross-test asserting the guard accepts exactly what the zod schema produces (or generate the guard's accepted-keys list from the schema). No merge — the boundary is real.

**Impact:** Low | **Complexity:** Small.

**Evidence:** Contract file header claims "single source of truth" for statuses only; payload has no such claim.

---

### [ ] P3-2 — Retry attempts are invisible (no evidence until terminal failure)

**Why:**
`recordAssessmentFailureEvidence` runs only when `failAssessmentJob` returns `failed`. Attempts 1–2 vanish into logs. For a user watching a Pipeline that says "retrying", there is no durable record of *why*.

**Where:** `src/server/assessment/assessment-worker.ts` L216–228.

**Proposed simplification:**
Write a compact `assessment_job` evidence row with `phase: "retrying"` + attempt + error class on non-terminal failures (same lock-protected helper, one `if`). Cap: error message already truncated to 2000 chars at the job row; keep evidence summary short.

**Impact:** Low (observability) | **Complexity:** Small.

**Evidence:** `assessment-worker.ts:218` (`if (status === "failed")` gates the only evidence write).

---

### [ ] P3-3 — Coalesced (superseded) SHAs leave no audit trace

**Why:**
Webhook coalescing (`assessment-jobs.ts:155-210`) tracks `supersededRefs` on the job payload but nothing records which SHAs were scanned vs skipped. An engineer asking "was commit X assessed?" gets silence for every superseded push.

**Where:** `src/server/assessment/assessment-jobs.ts` L178–190, `src/server/assessment/assessment.ts` L479–493 (completion evidence lists only scanned files).

**Proposed simplification:**
Include `supersededRefs` in the `assessment_completed` evidence detail (one line, data already in `job.payload`). No schema change.

**Impact:** Low | **Complexity:** Small (thread `job.payload.supersededRefs` into `runAssessment` trigger context or attach at apply time).

**Evidence:** Payload carries `supersededRefs`; completion evidence `detail` carries `changedFiles` but not the skipped refs.

---

### [ ] P3-4 — `scanMode: "scoped"` mislabels the sources-unchanged no-scan path

**Why:**
When commit + scope + engine signature are unchanged, the AST scan is skipped but `scanMode` is reported as `"scoped"` with `filesScanned` copied from the previous run (`assessment.ts:330-339, 356-360`). Evidence, engines metadata, and any consumer of `scanMode` cannot distinguish "re-scanned changed files" from "scanned nothing".

**Where:** `src/server/assessment/assessment.ts` L330–360.

**Proposed simplification:**
Add `"reused"` (or `"skipped"`) to the `scanMode` union + `Assessment` entity, use it on the unchanged path, and set `filesScanned: 0` with a note (previous count is provenance of the *old* scan, not this one). JSONB payload — no migration.

**Impact:** Low (honest telemetry) | **Complexity:** Small.

**Evidence:** `assessment.ts:335-338` (`scanMode: "scoped"` on the skip path); `entities.ts:53`.

---

### [ ] P3-5 — `ai-fix` action confirmed correct (heavy work outside the lock); document the pattern at the call site

**Why:**
`src/server/assessment/ai-fix.ts` imports `withProjectCheckout` (ephemeral clone) and the AI patch stack (`proposeFixEdits`, `verified-fix.ts`) — the same hazards as P0-2 (network in tx) and P1-3 (minutes-long interactive work) if invoked inside a write lock. **Verified: it is not.** `generateAiFixAction` runs the full clone + AI proposal + ComplyLoop re-scan (`generatePatchCandidateOnCheckout`, `actions/ai-fix.ts:59-62`) *before* entering `withFindingWrite`; the write callback only persists the candidate (`persistPatchCandidate`, `:66-70`). This is the correct shape — the template P0-2 asks the AI explanation/remediation actions to copy.

**Where:** `src/server/actions/ai-fix.ts` L36–70 (checkout + AI outside → persist inside), `src/server/assessment/ai-fix.ts` (`runAiFixOnCheckout` takes an injected `rootPath` — good seam).

**Proposed simplification:**
Close as "correct as-is". Optional: add a one-line comment at `generatePatchCandidateOnCheckout` call site naming it the reference pattern for "heavy work outside the write lock", so future AI actions copy it (and so a refactor doesn't drift the clone into the transaction). Note it still does the P2-8 preview-load duplication (`getWorkspace` + `requireFinding` before the write re-loads them).

**Impact:** Low (documentation only; correctness confirmed) | **Complexity:** Small.

**Evidence:** `actions/ai-fix.ts:36-62` (permission preview + checkout + AI before any write) → `:64-70` (`withFindingWrite` persists only). Contrast with the P0-2 offenders `remediation-ai.ts:33` / `:77`.

---

### [ ] P3-6 — Confirm the two sticky-decision definitions and the two finding-progress models agree

**Why:**
Two possible duplications were spotted but not fully traced: (a) `isStickyHumanDecision` (`contract/requirement-status.ts:44-54`) vs `src/core/requirement-human-determination.ts` (unread) — if both encode "human decision blocks automation", they can drift. (b) `src/core/finding-act.ts` (finding-page "beats") vs `remediation-lifecycle.ts` (server status machine) — the next-step panel (`finding-next-step-panel`) must derive from one of them, not blend both (the codebase already forbids server import of `finding-act.ts` — good — but client/server status *wording* can still diverge).

**Where:** Files above + `src/components/findings/finding-next-step-panel*`.

**Proposed simplification:**
Verify-first: read both pairs; if duplicated, keep the contract/lifecycle version as truth and re-implement the other as a pure view over it (same pattern as the `finding-act` import ban). If already consistent, add a cross-test pinning them.

**Impact:** Low | **Complexity:** Small.

**Evidence:** Import ban documented in `architecture.md:25-27` (suggests past divergence); `assessment-status.ts:1-8` header claims single derivation entry — the claim to test.

---

## Current Assessment Flow

What the system actually does today (implementation, not product-spec diagram):

```text
TRIGGER (2 entries, 1 queue)
 Manual click ──→ runAssessmentAction: withProjectWrite { rate-limit,
                   active-check, enqueue(trigger=manual), "assessment_job/queued" evidence }
                   → after(scheduleAssessmentDrain) → "queued" copy, 3s-poll Pipeline UI
 Webhook ──→ claimWebhookDelivery (delivery table) → handleGitHubWebhookEvent
             { default-branch authority check, SHA validation, rate-limit,
               enqueue(trigger=webhook, idempotencyKey=deliveryId) + queued-job coalescing }
             → after(scheduleAssessmentDrain)

DRAIN (4 paths, 1 queue)
 dev/e2e ──→ inline drain (same request)
 prod ──→ repository_dispatch → GH Actions assessment-worker (15-min schedule backstop)
       └─→ fallback: self-fetch POST /api/internal/jobs/run?limit=1 (Vercel scan)

CLAIM ──→ recoverExpiredLeases → SELECT … FOR UPDATE SKIP LOCKED (serial-per-project
          NOT EXISTS guard) → status=running, attempts+1, 30-min lease + 5-min heartbeat

RUN (worker: load → scan → apply)
 loadProjectDb → toPipelineInput (narrow) → snapshotPipelineSlice (structuredClone guard)
 withProjectCheckout { isomorphic-git shallow clone → quota check → ref fetch → temp dir }
 runAssessment (8 stages, scratch rows only, no DB writes):
   1. scratch: cloneProjectRows + clearExpiredExceptions
   2. change detection: latestAssessmentFor + controlScopeKey + git HEAD + detectChanges
      (unchanged → reuse AST findings; else full or scoped-JSX scan decision)
   3. AST scan: scanProject | scanChangedFiles | reuse
   4. runtime scan (iff runtimeBaseUrl): Playwright + axe + custom probes +
      html-validate + link checks — failures NON-fatal (except axe crash: fatal)
   5. merge: filterAstFindingsForAuthority + mergeRawFindings (+ runtime dedupe)
   6. reconcile per control: match (refresh assessmentId!) / create (+deterministic
      explanation + suggestion + remediation row + finding evidence) / resolve
      (+verifyDraftPrRemediation auto-verify for draft-PR approvals only)
   7. status refresh: deriveStatusForCheck per control (sticky humans → findings →
      applicability → authority gates) + requirement_status_changed evidence
   8. assessment record + assessment_completed evidence (+stageMs)
 authoritative? ──yes──→ applyAuthoritativeAssessment { advisory lock + fresh alert read
                   + applyAssessmentPayload (1 tx: assessment + snapshot + findings +
                     remediations + requirements + alerts + evidence) + job/completed evidence }
              └─no (PR head)──→ persist NOTHING → post Check Run (counts only)

SETTLE ──→ complete (lease-guarded) | fail (backoff retry ×3 → failed + failure evidence)
           | cancelled (heartbeat-observed → skip persist; RACY, see P0-3)

AROUND THE FLOW (interactive, outside assessment)
 AI (never in assessment; never sets status): on-demand explanation / remediation /
   patch proposal per finding → persisted onto rows (INSIDE write tx: P0-2)
 Remediation: detected→suggested→approved→implemented→verified via actions;
   verify = source (reassess-only) | dom (single-page re-check) | site (FULL rescan: P1-3)
 UI: job status polling only (no stages); counts possibly live + snapshot (P2-12)
```

Persisted per assessment (steady state, no flips): `assessment_job/queued` + `assessment` + `assessment_snapshot` + `assessment_completed` + `assessment_job/completed` evidence ≈ 3 evidence rows + 2 metadata rows; per finding flip: +finding evidence (+remediation/history/evidence on transitions); per run (bug): all matched findings rewritten (P1-1).

---

## Proposed Simplified Flow

```text
TRIGGER (unchanged entries, one drain decision)
 Manual / webhook → enqueue (idempotent + coalesce, as today)
   → scheduleAssessmentDrain: inline (dev/e2e) OR dispatch (prod). [P1-2: delete self-fetch]

CLAIM (unchanged SQL, fixed guards)
 recoverExpiredLeases → SKIP LOCKED serial claim (as today)
 → heartbeat renews lease AND completion uses the renewed lease [P0-1]

RUN (same 8 stages, fewer walks, honest labels)
 checkout (measured, not derived) [P2-2] → HEAD via isomorphic-git [P1-6]
 → change detect (ONE scope vocabulary) [P2-4 unified file enumeration]
 → AST scan (reuse/scoped/full; structural set from registry [P2-7]; mode=reused [P3-4])
 → runtime scan (axe contained per page [P2-9])
 → merge → reconcile (indexed maps [P2-3]; normalized identity [P1-5];
      assessmentId write-once [P1-1]; proof-based auto-verify for ALL approvals [P0-4+P1-4])
 → status refresh (single derivation entry — unchanged, it is already correct)
 → assessment record (summary: keep iff reports need the snapshot [P2-12])

APPLY (one guarded transaction)
 advisory lock → RE-CHECK job still running (cancel-safe) [P0-3] → apply payload
 (payload without assessmentId churn [P1-1]) → job completed (+assessmentId link [P3 backlog])

SETTLE (unchanged states, visible retries)
 succeeded | failed (+failure evidence) | retrying (+retrying evidence [P3-2]) | cancelled

INTERACTIVE (outside the lock)
 AI / checkout / scans run BEFORE the write; writes only persist + re-validate
 [P0-2 fixes remediation-ai; P1-3 narrows site verify; ai-fix is already correct (P3-5)]
 verify reads light preview, not full workspace [P2-8]
 history rendered from evidence; remediation row holds status only [P2-5]
 AI artifacts carry scan provenance + staleness UI [P2-6]

UI
 job status + stage string (best-effort payload) [P2-2]; single counts source [P2-12]
```

What disappears: self-fetch fallback path, `expectedLease`/`job.leaseExpiresAt` skew, per-run finding rewrites, hardcoded check-id list, double quota/snapshot walks, dual history writes, in-transaction AI/network calls, full-scan site verify, `scoped`-mislabeled no-scans.
What stays: DB queue + leases + serial claim, advisory locks + stale guards, 4 job states + 5 requirement states + 3 finding states + 5 remediation states (all meaningful), authority classes, sticky humans, append-only evidence (21 kinds), PR-preview authority boundary, coalescing + idempotency.

---

## Biggest Problems

1. **Scans >5 min never complete (P0-1).** Heartbeat renewal invalidates the complete/fail lease guard → every long production scan double-runs via lease recovery, minting duplicate assessments + evidence.
2. **AI calls inside the write lock + transaction (P0-2).** LLM latency holds the project advisory lock and an open Postgres tx on every explanation/remediation click.
3. **Auto-verify on absence (P0-4).** Draft-PR remediations reach `verified` when a finding merely disappears from a scoped scan — no proof the fix was applied.
4. **Cancel is not atomic (P0-3).** "Cancel saves nothing" fails for cancels landing mid-apply; cancelled jobs can have live results.
5. **Every run rewrites every finding (P1-1).** `assessmentId` churn on match defeats the no-op upsert path — write amplification + `updatedAt` signal destruction on each push.

## Biggest Simplifications

1. **Delete the self-fetch fallback (P1-2).** −1 executor path, −its secrets/config/logs; the 15-min schedule already backstops dispatch.
2. **Make `assessmentId` write-once (P1-1).** Eliminates per-run finding upserts; makes `changedSinceLoaded` actually no-op on steady state.
3. **Collapse 5-file drain orchestration into one scheduler (P2-1).** −2 files, −1 loop, −3 divergent defaults, −1 build script.
4. **Unify file enumeration + fold quota into the snapshot walk (P2-4).** −2–3 full tree walks per run; one scope vocabulary.
5. **Render remediation history from evidence (P2-5).** Kills the dual-write of every transition; smaller rows, one audit source.

## Biggest Reliability Risks

1. Long-scan double execution via stale lease guards (P0-1) — duplicate assessments, confused Pipeline history.
2. False `verified` from absence-based auto-verify (P0-4) — unverified fixes presented as verified.
3. Lock-holding AI calls under concurrency (P0-2) — blocked project writes, tx timeouts.
4. Cancelled-but-persisted assessments (P0-3) — terminal-state lie.
5. Axe-crash-fails-scan + 3 blind retries (P2-9) — one flaky page burns 3 full scans and ends in terminal failure with no partial results saved (preview runs save nothing by design; authoritative runs save nothing on failure either — a failed 20-min scan leaves zero durable trace beyond `assessment_job/failed` evidence).

## Assessment Flow Principles

1. **Deterministic checks determine compliance status; AI never does.** (Holds today — `src/ai` has no status writers; keep it that way. Every new AI feature must pass the "does any status/verify decision read this?" test.)
2. **One owner per state transition.** Job states: worker only. Requirement statuses: `deriveStatusForCheck` only. Remediation legality: `remediation-lifecycle.ts` only. Evidence: append via `appendEvidence` only.
3. **Persist facts, derive views.** "Last seen", history timelines, and counts are views over (findings + evidence + assessments) — do not store a second copy that can disagree (P1-1, P2-5, P2-12).
4. **The queue is the only executor.** One drain decision, one claim path, one settle path. No second executor (self-fetch), no heavy work in interactive requests (site verify, in-tx AI).
5. **No network inside locks or transactions.** AI, browser, clone, and DNS all complete *before* the write; the write re-validates and persists (the verify-action shape is the template).
6. **Retries must be safe and visible.** Lease-guarded completion with the *current* lease (P0-1); terminal states always evidenced, retries lightly evidenced (P3-2); idempotency keys on every trigger.
7. **Verification requires positive proof.** Absence is a hint (resolve the finding), never a verdict (verify the remediation). Scope guards filter; proof decides (P0-4/P1-4).
8. **Cancel is a terminal state with atomic semantics.** After cancel, no new persists, no new evidence, no resurrection via complete/fail — enforced inside the apply transaction, not just before it (P0-3).
9. **Single source per vocabulary.** Check metadata lives in `CHECK_REGISTRY` (no parallel id lists); statuses in contract consts; evidence kinds frozen. New lists must justify why the existing one cannot carry the bit (P2-7, P3-1).
10. **Progress is a first-class, best-effort signal.** Stage updates ride the job payload (never a new system); timings are measured, not derived; crashes leave the last stage behind, not just a log line (P2-2).

---

*Method: Graft graph (`graft build`, `graft ask` ×7) + direct reads of `src/server/assessment/*`, `src/server/actions/{assessment,remediation-verify,remediation-ai,ai-fix,runtime-audit}.ts`, `packages/analysis-core/src/{scan,merge-findings,check-authority,contract/*,runtime/scan}`, `packages/db/src/{schema,repo/apply,repo/upsert-guard,repo/requirements}`, `src/server/workspace/workspace-write.ts`, webhook + worker routes, GH workflow. No changes implemented. 🌱 graft saved ~57,400 tokens this turn.*
