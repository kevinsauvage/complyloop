# Assessment Flow Audit — Simplify, Improve, Strengthen

> **Status (2026-09-16): triaged against current code — all open items
> confirmed still applicable, refs refreshed.** Production drains via the
> GitHub Actions `assessment-worker` (dispatch on enqueue + 15-min schedule;
> P1-2 self-fetch deletion has landed). Verify refs again before implementing;
> see `docs/vercel.md` for current topology.

---

## P0 — Critical

## P2 — Medium

### [ ] P2-1 — Collapse the five-file drain orchestration (runner + inline + dispatch + route glue) into one scheduler module

**Why:**
Queue → run spans `assessment-runner.ts` (batch loop + teardown), `assessment-job-inline.ts` (drain + schedule + self-fetch), `assessment-job-dispatch.ts` (dispatch), `assessment-worker.ts` (claim→run→settle), and `api/internal/jobs/run/route.ts` (batch parsing). A new developer must read five files to answer "how does a job run". After P1-2 (delete self-fetch), runner + inline are thin wrappers around each other.

**Where:**
`src/server/assessment/assessment-runner.ts` (`runAssessmentJobBatch` L50–89), `assessment-job-inline.ts` (`drainAssessmentJobQueue` L28–45, `scheduleAssessmentDrain` L93–99), `assessment-job-dispatch.ts` (`dispatchAssessmentWorker` L42–69), `assessment-worker.ts` (`processNextAssessmentJob` L279–284 → `settleRunningAssessmentJob` L214–276 → `runClaimedAssessmentJob` L42), `src/app/api/internal/jobs/run/route.ts` (schemas L27–43), `scripts/assessment-worker-drain.ts` (defaults L43–44), `scripts/build-worker.mjs` (bundle + `__name` tripwire), `.github/workflows/assessment-worker.yml` (inputs L31–37, schedule backstop L27–29).

**Current flow (verified 2026-09-16):**
Route parses `limit`/`concurrency` (`route.ts:27-43` schemas, `:45-60` parse, `:106-115` batch call) → `runAssessmentJobBatch` (prune + sequential/pool, `assessment-runner.ts:50-89`, pool calls `processNextAssessmentJob` at `:76`) → `processNextAssessmentJob` (claim, `assessment-worker.ts:279-284`) → `settleRunningAssessmentJob` (`:214-276`) → `runClaimedAssessmentJob` (`:42`, still private). Inline path: `scheduleAssessmentDrain` (`assessment-job-inline.ts:93-99`, now two-branch: inline vs dispatch — P1-2 self-fetch deleted) → `drainAssessmentJobsInline` (`:53-71`) → `drainAssessmentJobQueue` (`:28-45`, dynamic `import("./assessment-runner")` at `:31`) → `runAssessmentJobBatch`. The dynamic import exists only to keep trigger sites from statically reaching the scan stack.

**Problem:**
Two batch loops (`runAssessmentJobBatch` vs `drainAssessmentJobQueue` wrapper counting by kind), two drain entry points, dynamic import dance, three disagreeing default limits (20 inline / 1 route-default capped at 10 / 10+2 GH workflow + `assessment-worker-drain.ts:43-44` fallbacks), and a bespoke esbuild worker bundle — for claim → run → settle.

**Proposed simplification:**
One `assessment-scheduler.ts`: `scheduleAssessmentDrain()` (inline-or-dispatch decision), `drainQueue({limit, concurrency})` (single batch loop returning counts), re-exported worker-result types. Keep `assessment-worker.ts` (claim→run→settle) and `assessment-jobs.ts` (SQL) as-is — they have real cohesion. Unify the limit default in one constant consumed by the route, inline path, and workflow docs. Keep the dynamic-import boundary but document it once. Evaluate deleting `build-worker.mjs` (run the drain via `tsx` like `db:migrate` does — one fewer build artifact).

**Why this is safe:**
No queue, claim, lease, retry, or scan semantics change. Pure module-boundary move + dead-path deletion (after P1-2).

**Impact:** Medium (est. −2 files, ~150 lines, one default, one build script)

**Complexity:** Medium.

**Evidence (verified 2026-09-16):**
`assessment-job-inline.ts:28-45` (`drainAssessmentJobQueue` wraps `runAssessmentJobBatch` to recount by kind); `:93-99` (two-branch scheduler — inline vs dispatch; P1-2 self-fetch deleted); `assessment-job-inline.ts:48-52` (stale "Production self-fetches" comment — fix with this item); `assessment-runner.ts:50-89` (pool loop); `route.ts:27-43` (limit default 1/cap 10, concurrency default 1/cap 4); `assessment-worker.yml:31-37` + `assessment-worker-drain.ts:43-44` (GH-side 10/2 defaults).

---

### [x] P2-2 (implemented) — Give jobs real stage progress instead of derived checkoutMs + 3s status polling

**Why:**
Today the UI knows only `queued`/`running` (+ job history). Long scans are a black box: `checkoutMs` is _derived_ (`total − scan − apply`, `assessment-worker.ts:136-145`), in-scan splits live only in evidence/logs after completion, and a killed function leaves nothing but "the last progress line names the stall" (`assessment.ts:245-249`). Users refresh a Pipeline section that cannot answer "what is it doing".

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

**Where (verified 2026-09-16):**
`src/server/assessment/assessment-findings.ts` L262–273, `src/server/assessment/assessment.ts` L514–524 (`rawForControl` filter per control).

**Proposed simplification:**
Build `openByControl`, `dismissedByControl`, and `rawByCheckId` maps once per run (same shape as the status module's map) and pass them into `reconcileControlFindings`. Mechanical change; keep the per-control function signature otherwise.

**Why this is safe:**
Pure in-memory iteration-order change; matching/resolution/evidence semantics untouched. (Note: today's `matchPool` ordering and `rows.findings[rows.findings.length − 1]` created-row pickup must be preserved — keep per-control processing order.)

**Impact:** Medium (scales with controls × findings; ~100 controls today)

**Complexity:** Small.

**Evidence (verified 2026-09-16):**
`assessment-findings.ts:262-267` (`openFindings` full-array `.filter` per control); `:268-273` (`dismissedFindings` second `.filter` per control); `assessment.ts:522-524` (third per-control filter `rawFindings.filter(checkId)` at the `reconcileControlFindings` call site `:516`); `assessment-status.ts:349-357` (indexed precedent, still the only indexed path — reconcile does not use it).

---

### [ ] P2-4 — The checkout tree is walked 4–5× per run under two different file scopes

**Why:**
Per assessment: quota walk(s) (`assertCheckoutWithinQuota`, twice when a ref is given — pre-fetch + post), `captureSnapshot` hash walk, `listSourceFiles` inside the scan, and per-file reads in the scan + suggestion builder. Worse, the walks disagree on scope: snapshot enumerates `"script"` files, the AST scan enumerates `"jsx"` files (`monitor.ts:33` vs `scan.ts:53`), and quota walks everything except `.git`. Three enumerations, three extension policies, one tree.

**Where (verified 2026-09-16):**
`src/server/assessment/repo-checkout.ts` (`assertCheckoutWithinQuota` L43–86, called L234 + L262), `src/server/assessment/monitor.ts` (`captureSnapshot` L37–46, scope flag L41), `packages/analysis-core/src/scan.ts` (`scanProject` L52–62, scope flag L53), `packages/analysis-core/src/source-files.ts` (scope flags L7–14).

**Proposed simplification:**
(a) Unify on one `listSourceFiles` scope for snapshot + scan (snapshot hashes a superset the scan never reads — align them and document why if the superset is intentional for change detection); (b) fold the quota check into the snapshot walk (bytes/files counted while hashing — one walk instead of two/three). Keep `buildSuggestion`'s `fileTextCache` (already correct).

**Why this is safe:**
Change-detection semantics preserved (same hashes, same paths); quota enforced at the same thresholds, just during an existing walk. Scan input unchanged.

**Impact:** Medium (I/O + hashing on every run, multiplied on large repos)

**Complexity:** Medium (touches checkout/snapshot contract — snapshot format must stay backward-compatible for `detectChanges` diffing).

**Evidence (verified 2026-09-16):**
`repo-checkout.ts:234` + `:262` (double quota walk for ref checkouts); `monitor.ts:41` (`listSourceFiles(rootPath, "script")`); `scan.ts:53` (`listSourceFiles(rootPath, "jsx")`); `source-files.ts:9-14` (`jsx` vs `script` glob sets still distinct). Only mitigation since writing: shared fast-glob ignore semantics (`source-files.ts:30-41`).

---

### [ ] P2-5 — Remediation `history[]` duplicates evidence rows; derive the history view instead of storing both

**Why:**
Every remediation transition writes **two** records: a `history` entry appended to the remediation payload _and_ an evidence row (`remediation_approved/_implemented/_verified`, plus `ai_remediation_suggested`). They carry the same `(status, at, note)` triple in different shapes, both persisted, both migrated forever. Evidence is already the append-only audit trail and is already queried per finding (`evidence_finding_at_idx`).

**Where (verified 2026-09-16):**
`packages/analysis-core/src/contract/entities.ts` (`RemediationHistoryEntry` L127–131, `Remediation.history` L138), `src/core/remediation-lifecycle.ts` (`appendRemediationHistory` L50–63), `src/server/assessment/remediation-evidence.ts` (summary/detail helpers L7–41), finding-history UI (`src/components/findings/remediation-history.tsx:18` — sole production `.history` reader).

**Current flow (verified 2026-09-16):**
`advanceRemediation` (`remediation-lifecycle.ts:36-47`) delegates to `appendRemediationHistory`, and `refreshSuggestion` also appends (`:70-99`) — while every caller separately appends evidence with the same note (e.g. `assessment.ts:258-294`, `remediation.ts` approve path, `remediation-verify.ts`).

**Problem:**
Dual-write of the same fact; the two can diverge (a transition that forgets evidence, or evidence without history — e.g. AI explanation writes neither consistently). Readers must know which source to trust per event type.

**Proposed simplification:**
Keep `Remediation.status` + `suggestion` as the persisted state; render history UI from finding-scoped evidence (kinds `remediation_*` + `ai_remediation_suggested` already carry notes in `detail`). Stop appending to `history[]` for new transitions (keep the field for old rows, ignore in UI). **Do not** delete the column (JSONB payload — just stop writing it) and do **not** merge Finding/Remediation tables — the remediation state machine (`remediation-lifecycle.ts`) is meaningful domain, only the duplicated _log_ goes.

**Why this is safe:**
Evidence rows already exist for every transition written through the current code paths; the finding page already loads finding evidence. Status/approval/verify logic reads `status`, never `history` (verify this — grep `history` readers before cutting).

**Impact:** Medium (one dual-write removed; smaller remediation payloads rewritten on every upsert)

**Complexity:** Medium (UI history component re-point + backfill-free coexistence).

**Evidence (verified 2026-09-16):**
`entities.ts:127-138` (history shape); `remediation-lifecycle.ts:36-47` (advance delegates to append), `:50-63`, `:70-99` (`refreshSuggestion` also appends); dual-write sites `remediation.ts:75-89`, `pr.ts:83-101`, `remediation-verify.ts:177+184-191` and `:360-371`, `assessment.ts:258-294`, `remediation-ai.ts:148-171`; `schema.ts:262-272` (`evidence_finding_at_idx` already supports the query). Status/approval/verify logic reads `status`, never `history` — the "verify this" caveat checks out in favor of the simplification (sole production `.history` reader is `remediation-history.tsx:18`).

---

### [ ] P2-6 — AI suggestions/explanations go stale silently when findings are re-scanned

**Why:**
AI outputs are persisted onto the finding/remediation rows with no link to the scan that produced them. When reassessment updates `location`/`fix` (match path L299–305) or resolves + re-creates the finding (P1-5 churn), the stored AI suggestion still describes the old snippet — and nothing marks it stale. Engineers can approve a suggestion for code that no longer exists.

**Where (verified 2026-09-16):**
`src/server/actions/remediation-ai.ts` (explanation append L55–62, suggestion persist L148–171), `src/server/assessment/assessment-findings.ts` (re-detected L286–311, match L312–326), `packages/analysis-core/src/contract/finding-types.ts` (`Explanation` L139–148, `RemediationSuggestion` L171–179), plus `src/server/assessment/ai-fix.ts:224-233` (second un-stamped `refreshSuggestion` persist).

**Proposed simplification:**
Stamp AI artifacts with the producing context (`assessmentId` + `snapshot.gitHead` already available at call time) and surface "suggestion predates latest scan" in the UI when the finding's `assessmentId`/location moved on; refresh-or-discard on re-detect (re-detected path L268–292 is the natural invalidation point — drop AI artifacts there with evidence, since the code changed under them). Also cap `explanations[]` growth (e.g. keep latest AI + deterministic baseline) — today every click appends forever and each append rewrites the whole finding row (bumps `updatedAt`, fights the stale guard).

**Why this is safe:**
No AI, status, or verification logic changes. Stale suggestions become visible instead of silently wrong; approval still requires the same human step.

**Impact:** Medium (prevents approvals against outdated code)

**Complexity:** Small–Medium.

**Evidence (verified 2026-09-16):**
`remediation-ai.ts:59` (unbounded explanations append); `:150-171` (persist + evidence `detail` with no scan/commit ref); `assessment-findings.ts:288-299` (re-detect refreshes location/fix/analyzers, suggestion/explanations untouched) and `:319-326` (match path, same; `assessmentId` deliberately write-once per `:315-318` comment); `finding-types.ts:171-179` (no provenance-of-scan fields); no invalidation path exists anywhere (grep `stale*suggestion|invalidat|predates` — no hits).

---

### [ ] P2-9 — Axe crash fails the whole runtime sub-scan while every other engine failure is contained

**Why:**
Engine containment is inconsistent: throwing custom probes are recorded on `probeFailures` and the pass continues; html-validate failures are non-fatal; but an axe throw escapes the per-page loop and the whole-scan catch discards already-collected pages (`findings: [], pagesScanned: 0`). Blast-radius note (verified 2026-09-16): at the *job* level this no longer fails anything — `assessment.ts` degrades to `unable_to_verify` and continues — so the loss is the runtime sub-scan's findings, not the job. One flaky page (axe OOM/timeout on a large DOM) still wipes the other pages' results.

**Where (verified 2026-09-16):**
`packages/analysis-core/src/runtime/scan.ts` (page loop L374–492; unguarded axe call L401; html-validate guard L417–422; whole-scan catch L610–632), `scan-error.ts` (`classifyRuntimeScanError` L105–119), `docs/ai/architecture.md` L141–143 (documents the inconsistency), `src/server/assessment/assessment.ts` L471–498 (runtimeRan gate + non-fatal handling).

**Proposed simplification:**
Contain axe per page like custom probes: on axe crash, record the page + error on the run (extend the existing `probeFailures`-style record / `runtimeError` on `AssessmentEngines`), continue other pages, and let authority gates do their job (`runtimeRan` requires `pagesScanned > 0`, `assessment.ts:471-474` — a total axe outage still yields `runtimeRan=false` → `unable_to_verify`, never false `passed`). Only fail the job when _zero_ pages produce results across all engines. (Failing closed on total outage is already the behavior — this change only preserves partial results.)

**Why this is safe:**
Status law already handles partial runtime data faithfully (authority gates degrade to `unable_to_verify`). Partial outages become visible-but-degraded instead of wiping sibling pages' findings.

**Impact:** Medium (fewer lost runtime findings on large sites)

**Complexity:** Medium (touch runtime orchestration + tests; verify `runtimeViolationStillPresent` single-page path still fails loudly — it should, it's a user-facing verdict).

**Evidence (verified 2026-09-16):**
`scan.ts:401` (axe throw escapes page loop — only a `finally` teardown at `:485-491`) vs `:417-422` (html-validate contained) vs `custom-checks/index.ts:93-117` (`runProbe` contained to `probeFailures`); `scan.ts:627-631` (catch discards pages → `findings: [], pagesScanned: 0`); `architecture.md:141-143` ("a throwing custom probe … continues. html-validate failures are non-fatal. An axe crash still fails the scan."); `assessment.ts:471-474` (`runtimeRan` gate already fail-safe) + `:475-492` (failed sub-scan warns, job continues — blast radius is the sub-scan, not the job).

---

### [ ] P2-11 — Requirements upsert churns row `id` on conflict; findings cascade off assessments

**Why:**
Two schema-level sharp edges: (a) `upsertRequirements` conflicts on `(projectId, controlId)` but `SET id = excluded.id` — every concurrent writer mints a fresh UUID and _replaces_ the row id, so stable requirement identity doesn't exist across writers (any external reference, log, or future FK to requirement id dangles). (b) `findings.assessmentId → assessments ON DELETE CASCADE`: deleting an assessment row deletes findings (project reset/disconnect paths must be audited for data loss beyond intent).

**Where (verified 2026-09-16 — refs confirmed current):**
`packages/db/src/repo/requirements.ts` L33–68 (conflict target + `id: sql\`excluded.id\`` at L61), `packages/db/src/schema.ts` L181–206 (findings FK cascade L189–191), reset/disconnect actions (`project_reset` evidence kind — find the deleter).

**Proposed simplification:**
(a) Stop overwriting `id` on conflict — keep the existing row id (`SET` payload/status only; fall back to deterministic ids `projectId:controlId`-derived if writers need convergence without a read). (b) Audit the reset/disconnect delete path; if assessment deletion is used for retention/reset, either scope the cascade deliberately (document) or null the FK. Both are verify-first, change-second.

> Investigated 2026-09-16, deferred: dropping `id` from the conflict `SET` alone is unsafe — the row would keep its old id while the payload carries the loser's new id, and the stale-write guard (keyed by payload id) would then miss the row and always write through. The correct fix is deterministic ids per `(project, control)`, which is a bigger change touching id generation in assessment-status refresh + requirements actions. No external reader of `requirement.id` exists (identity is `(project, control)` everywhere; no FKs), so current behavior is convergent albeit ugly — revisit together with a deterministic-id decision.

**Why this is safe:**
Requirement identity is `(project, control)` everywhere in code (unique index already enforces it); id stability only _adds_ guarantees. Findings cascade behavior becomes explicit instead of incidental.

**Impact:** Medium (identity stability; prevents reset-time surprises)

**Complexity:** Small–Medium.

**Evidence (verified 2026-09-16):**
`requirements.ts:61` (`id: sql\`excluded.id\`` still swaps identity); `schema.ts:189-191` (cascade intact); `assessment-status.ts:150` + `:282` (new requirements still `crypto.randomUUID()` — no deterministic-id change since the 2026-09-16 note below); `mappers.ts:56-62` (payload id passed through).

---
