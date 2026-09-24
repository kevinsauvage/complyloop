# ComplyLoop — 30 Critical TODOs

> Full-project analysis. Ordered most critical → least.
> Baseline verified at time of writing: `typecheck`, `lint`, and 1,803 tests pass (27 skipped); `npm audit` clean.
> `P0` = correctness/security/data-loss, `P1` = reliability/hardening, `P2` = product UX & CI hygiene.
> **Confidence** = how certain the finding is real as described (0–100). **Effort** = implementation size (S / M / L / XL).

## Summary

| #   | Priority | Area          | Issue                                                 | Conf | Effort |
| --- | -------- | ------------- | ----------------------------------------------------- | :--: | :----: |
| 1   | P0       | Compliance    | Sticky human decisions hide new violations            |  95  |   L    |
| 2   | P0       | Security      | Webhook buffers unbounded body before signature check |  90  |   S    |
| 3   | P0       | Reliability   | Heartbeat false-cancels valid long runs               |  80  |   S    |
| 4   | P0       | Reliability   | Job stage write clobbers concurrent payload           |  85  |   S    |
| 5   | P0       | Cost/Abuse    | AI-fix checkout bypasses rate limit                   |  90  |   S    |
| 6   | P0       | Security      | Preview Basic-auth gate fails open                    |  90  |   S    |
| 7   | P0       | Storage       | No retention for jobs/assessments/snapshots           |  90  |   M    |
| 8   | P1       | Correctness   | Masked-findings query is a raw JSONB text compare     |  85  |   M    |
| 9   | P1       | Security      | AI `attributeValue` unbounded → source edits          |  80  |   S    |
| 10  | P1       | Reliability   | AI gateway calls have no timeout                      |  85  |   S    |
| 11  | P1       | Reliability   | GitHub token/Octokit calls have no timeout            |  85  |   S    |
| 12  | P1       | Security      | Raw DB error text leaked to client                    |  90  |   S    |
| 13  | P1       | Performance   | Missing index on `findings.control_id`                |  90  |   S    |
| 14  | P1       | Performance   | Evidence free-text search unindexed                   |  85  |   M    |
| 15  | P1       | Abuse         | Repo typeahead endpoint unthrottled                   |  85  |   S    |
| 16  | P1       | Abuse         | Report download routes unthrottled + full history     |  85  |   S    |
| 17  | P1       | Abuse         | Assessment-job polling endpoint unthrottled           |  80  |   S    |
| 18  | P1       | Supply chain  | GH Actions pinned to mutable tags with secrets        |  95  |   S    |
| 19  | P1       | CI            | Workflows lack least-privilege `permissions`          |  85  |   S    |
| 20  | P1       | CI            | No dependency/SAST/secret scanning                    |  90  |   M    |
| 21  | P2       | Accessibility | Our own UI contrast fails WCAG AA (2 spots)           |  85  |   S    |
| 22  | P2       | Accessibility | Assessment status changes not announced               |  85  |   S    |
| 23  | P2       | Accessibility | Finding not-found `h1` not focusable                  |  80  |   S    |
| 24  | P2       | Accessibility | Dashboard heading-order skip                          |  80  |   S    |
| 25  | P2       | Accessibility | `aria-label` on generic elements                      |  85  |   S    |
| 26  | P2       | Accessibility | Invalid `aria-checked` on native checkbox             |  85  |   S    |
| 27  | P2       | Accessibility | Disabled-action hint reachable only via `title`       |  80  |   S    |
| 28  | P2       | Dependencies  | next-auth v5 beta + experimental compiler in prod     |  75  |   M    |
| 29  | P2       | UX            | `(marketing)` has no error boundary                   |  85  |   S    |
| 30  | P2       | Tests         | E2E gaps: webhook dispatch + runtime verify worker    |  80  |   XL   |

---

## P0 — Critical

### 1. Sticky human decisions hide new violations

`packages/analysis-core/src/contract/requirement-status.ts:67-72`, `src/server/workspace/requirements-view.ts`

- **Why:** A requirement marked `passed` by a permanent exception/human pass returns the stored status before open findings are considered. New violations accumulate silently; the dashboard reads `passed` while the code is failing — a false compliance claim.
- **Fix:** Masked counts are now surfaced in the UI (`masked-findings.ts`), but status still never re-arms. Narrow exceptions to finding fingerprints (or re-open on findings detected after the decision) per the product spec; pin precedence with a contract test.
- **Confidence:** 95/100 · **Effort:** L
- [ ] Done

### 2. Webhook buffers unbounded body before signature verification

`src/app/api/github/webhook/route.ts:33-52`

- **Why:** The 5 MB `content-length` check is advisory (absent under chunked encoding); `await request.text()` buffers the whole stream, and signature verification runs only after. An unauthenticated client can force arbitrary in-memory buffering (DoS).
- **Fix:** Stream the body with a hard byte counter and abort at `MAX_WEBHOOK_BODY_BYTES`; never call `request.text()` on an unverified request.
- **Confidence:** 90/100 · **Effort:** S
- [ ] Done

### 3. Heartbeat false-cancels valid long runs

`src/server/assessment/assessment-worker.ts:64-90`

- **Why:** The lease heartbeat is `setInterval` + fire-and-forget async renew with no in-flight guard. A slow renew overlaps the next tick, the second carries a stale `expectedLease`, `refreshAssessmentJobLease` returns `null`, and the run is discarded as remotely cancelled — striking exactly the longest/most expensive scans.
- **Fix:** Skip a tick while a renew is in flight (boolean/promise guard); only set `cancelledRemotely` when no renew is pending.
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 4. Job stage write clobbers concurrent payload keys

`src/server/assessment/assessment-jobs.ts:630-667`

- **Why:** `updateAssessmentJobStage` SELECTs the payload, spread-merges `{...payload, stage}`, then UPDATEs gated only on `status='running'`. Concurrent stage stamps interleave and the loser overwrites the winner's keys; also no lease guard.
- **Fix:** One atomic `UPDATE ... SET payload = payload || jsonb_build_object('stage', …, 'stageStartedAt', …) WHERE id AND status='running'`; add an overlapping-write test.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 5. AI-fix checkout bypasses rate limit

`src/server/actions/ai-fix.ts:55-67`

- **Why:** `assertAiRateLimit` runs only when `!hasSafeDeterministicFix(finding)`, but `generatePatchCandidateOnCheckout` (ephemeral clone + scan) runs unconditionally. Repeated submissions with a deterministic fix clone/scan the repo with no throttle.
- **Fix:** Rate-limit the action unconditionally before checkout.
- **Confidence:** 90/100 · **Effort:** S
- [ ] Done

### 6. Preview Basic-auth gate fails open

`src/proxy.ts:141-158`

- **Why:** `if (!isGitHubAuthConfigured()) return nextWithCsp(...)` returns before the Basic-auth check, so a deployment with `BASIC_AUTH_*` set but `AUTH_*` unset serves every page with no gate and no login.
- **Fix:** Evaluate the Basic-auth gate before the GitHub-auth early return (at minimum whenever `BASIC_AUTH_*` is configured).
- **Confidence:** 90/100 · **Effort:** S
- [ ] Done

### 7. No retention for jobs/assessments/snapshots

`src/server/assessment/assessment-scheduler.ts:72-90`, `packages/db/src/schema.ts:153-183,334-396`

- **Why:** Only `webhook_deliveries` and `rate_limit_buckets` are pruned. Terminal `assessment_jobs`, `assessments`, and `assessment_snapshots` grow forever; `ops:check` only watches evidence bytes, so the growth is invisible until the DB degrades.
- **Fix:** Scheduled batched prune (retain N per project / T days, keep decision-referenced rows); extend `ops-thresholds` to alarm on table size.
- **Confidence:** 90/100 · **Effort:** M
- [ ] Done

---

## P1 — High

### 8. Masked-findings query is a raw JSONB text compare

`packages/db/src/repo/findings.ts:278`

- **Why:** `payload ->> 'detectedAt' > $1` relies on lexicographic ISO ordering, has no supporting index, and silently excludes rows with a missing/non-ISO `detectedAt`. Correct today, fragile to any payload-format change.
- **Fix:** Persist `detectedAt` as a real column (or an expression index) and compare as `timestamptz`.
- **Confidence:** 85/100 · **Effort:** M
- [ ] Done

### 9. AI `attributeValue` unbounded → source edits

`src/ai/remediation.ts:21`, `src/server/actions/remediation-ai.ts:153-164`

- **Why:** Zod validates shape but not length/format; the value is written into `finding.fix.value` and later becomes a source edit. A boundary failure for AI output.
- **Fix:** Bound the length and validate attribute-value shape before persisting.
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 10. AI gateway calls have no timeout

`src/ai/ai-call.ts:135-139,184-193`

- **Why:** No `abortSignal`; a hung gateway stalls the server action until the platform kills it.
- **Fix:** `abortSignal: AbortSignal.timeout(...)` (mirror `assessment-job-dispatch.ts:50`).
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 11. GitHub token/Octokit calls have no timeout

`src/server/github/github-tokens.ts:203-215`, `src/server/github/github.ts:14-21`

- **Why:** The OAuth refresh `fetch` and all Octokit clients use no timeout; a stalled GitHub hangs request handlers and workers.
- **Fix:** `AbortSignal.timeout` on the fetch; `request: { timeout: 15_000 }` on Octokit.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 12. Raw DB error text leaked to client

`src/server/github/pr.ts:126-128`

- **Why:** A DB write failure throws `` `… database write failed (${error.message})` ``, exposing driver/SQL text in user-facing copy.
- **Fix:** `reportError` the detail; surface `publicErrorMessage(error)`.
- **Confidence:** 90/100 · **Effort:** S
- [ ] Done

### 13. Missing index on `findings.control_id`

`packages/db/src/schema.ts:212-234`, `packages/db/src/repo/findings.ts:101-103,240-250`

- **Why:** `listFindingsPageForProject` filters by `control_id` and `countOpenFindingsByControlForProject` groups by it; no index includes the column, so both degrade to scans.
- **Fix:** Add `(project_id, control_id)` index (new migration).
- **Confidence:** 90/100 · **Effort:** S
- [ ] Done

### 14. Evidence free-text search unindexed

`packages/db/src/repo/evidence.ts:119-123`

- **Why:** `ilike(summary, '%q%')` with a leading wildcard against an append-only table with only btree `at`/`project_id` indexes; degrades to a scan as evidence grows.
- **Fix:** `CREATE EXTENSION pg_trgm; CREATE INDEX … USING gin (summary gin_trgm_ops)`.
- **Confidence:** 85/100 · **Effort:** M
- [ ] Done

### 15. Repo typeahead endpoint unthrottled

`src/app/api/github/repos/route.ts:22-83`, `src/server/github/github-app.ts:186-216`

- **Why:** No rate limit, and it paginates every installation — an authenticated admin can burn the GitHub API quota and hammer the DB.
- **Fix:** `assertRateLimit(\`repos:${userId}\`, …)` and/or a short-TTL per-user cache.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 16. Report download routes unthrottled + full history

`src/app/(app)/evidence/report/route.ts`, `src/app/(app)/evidence/report/html/route.ts`, `src/server/reporting/report.ts:121-124`

- **Why:** No rate limit; `getProjectRuntime` loads full finding history plus a 5,000-row evidence read per export.
- **Fix:** Apply `assertExportRateLimit`; bound the runtime read where full history isn't required.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 17. Assessment-job polling endpoint unthrottled

`src/app/api/projects/[projectId]/assessment-jobs/route.ts:28-29`

- **Why:** Authz is correct, but any viewer can poll in a tight loop, each hit a DB read.
- **Fix:** Cheap per-user rate limit (or a server-side min interval).
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 18. GH Actions pinned to mutable tags with secrets

`.github/workflows/*.yml` (`actions/checkout@v4`, `setup-node@v4`, `cache@v4`, `upload-artifact@v4`)

- **Why:** A compromised/retagged action runs in CI where `ops-check.yml` exposes `AUTH_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GH_WORKER_DISPATCH_TOKEN`.
- **Fix:** Pin actions to commit SHAs; let Dependabot maintain them.
- **Confidence:** 95/100 · **Effort:** S
- [ ] Done

### 19. CI workflows lack least-privilege permissions

`.github/workflows/ci.yml:8-10`, `.github/workflows/ops-check.yml:28-31`

- **Why:** Only `assessment-worker.yml` sets `contents: read`; the others inherit the repo default (possibly write).
- **Fix:** Add `permissions: contents: read` at workflow level.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 20. No dependency/SAST/secret scanning in CI

`.github/workflows/ci.yml:17-24`

- **Why:** CI runs format/lint/typecheck/test/build only — no `npm audit`/osv-scanner, CodeQL, or secret scan.
- **Fix:** Add a vulnerability-scan job and (optionally) CodeQL + gitleaks.
- **Confidence:** 90/100 · **Effort:** M
- [ ] Done

---

## P2 — Medium

### 21. Our own UI contrast fails WCAG AA

`src/app/(app)/findings/_components/status-nav.tsx:36` (3.99:1), `src/components/forms/auto-submit-select-form.tsx:66` (3.46:1)

- **Why:** Inactive tabs use `text-foreground/60`; the count suffix uses `text-muted-foreground/70`. Both fail 1.4.3 on the light background (`aria-hidden` does not exempt visible text).
- **Fix:** Use `text-muted-foreground` (7.10:1) or another ≥4.5:1 tone.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 22. Assessment status changes not announced

`src/app/(app)/dashboard/_components/assessment-job-status.tsx:133,160`

- **Why:** Poll errors and queued→running→succeeded transitions render with no live region; `router.refresh()` on completion is silent to screen readers.
- **Fix:** Wrap the status line in `role="status" aria-live="polite"` (reuse the `findings-bulk-list.tsx` pattern).
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 23. Finding not-found `h1` not focusable

`src/app/(app)/findings/[id]/not-found.tsx:21`

- **Why:** Renders inside AppShell where `PathnameFocus` calls `heading.focus()`; a non-focusable `h1` makes that a silent no-op, so keyboard/SR users get no focus move.
- **Fix:** Add `tabIndex={-1}` (compare `page-primitives.tsx:47`).
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 24. Dashboard heading-order skip

`src/app/(app)/dashboard/_components/dashboard-activity-sections.tsx:86`

- **Why:** The regressions banner emits an `h3` before any `h2` when the alerts card is absent → h1 → h3 → h2.
- **Fix:** Render the banner title as `h2`.
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 25. `aria-label` on generic elements

`src/app/(marketing)/page.tsx:224`, `src/app/(app)/dashboard/_components/dashboard-status-counts.tsx:98`

- **Why:** Role `generic` prohibits naming, so the labels are ignored by AT.
- **Fix:** Use `role="group"` / `aria-labelledby` on a semantic container, or remove.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 26. Invalid `aria-checked` on native checkbox

`src/app/(app)/findings/_components/findings-bulk-list.tsx:199`

- **Why:** `aria-checked` is invalid on `<input type="checkbox">` and can desync AT from real state (indeterminate is already handled at `:148`).
- **Fix:** Remove the prop; keep the `indeterminate` ref effect.
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 27. Disabled-action hint reachable only via `title`

`src/app/(app)/findings/_components/findings-bulk-list.tsx:229`

- **Why:** The "suggestions only" explanation lives in `title` on a non-focusable `<span>` wrapping a disabled `<Button>` — unreachable by keyboard/SR.
- **Fix:** Render as visible text or `aria-describedby` on an enabled element.
- **Confidence:** 80/100 · **Effort:** S
- [ ] Done

### 28. Production dependency/build risk

`package.json` (`next-auth: 5.0.0-beta.32`), `next.config.ts` (`reactCompiler: true`, `experimental.turbopackRustReactCompiler: true`)

- **Why:** Auth runs on a v5 beta; the production build enables experimental React Compiler + native-Rust Turbopack paths — unplanned breakage surface on upgrades.
- **Fix:** Track a stable next-auth v5 release; gate experimental flags behind an env and validate them in CI (already partly covered by build).
- **Confidence:** 75/100 · **Effort:** M
- [ ] Done

### 29. `(marketing)` has no error boundary

`src/app/(marketing)/`

- **Why:** A render error on `/`, `/login`, or legal pages falls through to the app-styled root `error.tsx`, losing marketing chrome.
- **Fix:** Add `src/app/(marketing)/error.tsx` (or accept the fallback explicitly).
- **Confidence:** 85/100 · **Effort:** S
- [ ] Done

### 30. E2E gaps: webhook dispatch + runtime verify worker

`e2e/`, `.github/workflows/assessment-worker.yml`

- **Why:** The critical async paths — webhook → enqueue → `repository_dispatch` → worker claim, and `verify_remediation` runtime re-audit — have no end-to-end coverage; regressions surface only in production.
- **Fix:** Add an e2e/CI job that enqueues a webhook and drains the worker against the fixture, asserting the persisted verdict.
- **Confidence:** 80/100 · **Effort:** XL
- [ ] Done

---

_Generated from a full-project analysis. Verify each item against current `main` before working it — the codebase moves fast and several earlier findings were already fixed._
