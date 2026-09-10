# TODO — Compliance Engineering Platform audit roadmap

Source of truth: implementation (via Graft graph + direct file reads), not docs.
No prior audit files found (`BUG-TODO.md`, `TODO-*.md` absent; `graft grep TODO|FIXME|HACK|XXX` = zero hits), so nothing to consolidate — this is the single list.
Do not modify app code outside the Action of the item being executed. Work top-down (P0 → P3).

Conventions per item: **Problem** (what is wrong) · **Evidence** (exact files/functions) · **Action** (minimal change) · **Verification** (commands/tests).

> Status 2026-09-10 — easy wins implemented: #1, #3, #6, #12, #14b DONE
> (see ✅ markers). #14a and #11 investigated — no change needed (notes inline).
> Remaining: #2, #4, #5, #7–#10, #13.

---

## P0 — critical / blocking

### 2. P0 — GitHub token leaks via clone URL in process args

- **Problem:** `githubCloneUrl()` embeds the installation token in the HTTPS URL (`https://x-access-token:SECRET@github.com/...`) and `cloneShallow()` passes it as a CLI argv to `git clone`. The secret is visible in process listings, and any spawned-process logging captures it. `redactCloneUrl()` only scrubs error _text_ after the fact.
- **Evidence:** `src/server/github.ts:102-115` (`githubCloneUrl`, `redactCloneUrl`); `src/server/repo-checkout.ts:66-82` (`cloneShallow` → `createGit().clone(cloneUrl, ...)`).
- **Action:** Stop putting the token in the clone URL. Minimal fix: clone `https://github.com/<fullName>.git` with the token supplied via env-scoped `http.extraHeader` (`Authorization: Bearer <token>` through simple-git's `env`/`-c` config), never in argv; ensure the token never interpolates into error strings (keep `redactCloneUrl` as defense-in-depth and extend its regex to `Authorization: Bearer` fragments). Validate `fullName` with existing `parseOwnerRepo()` before use. No change to `withFixtureCheckout`/e2e path.
- **Verification:** New unit test asserting `cloneShallow` argv/env contains no token substring (mock `createGit`); `grep -rn "x-access-token" src packages --include="*.ts"` shows no URL construction with secret; `npm run typecheck && npm run lint`.

## P1 — high-impact correctness / architecture

### 4. P1 — Webhook/PR queue has no coalescing; one project can starve the worker

- **Problem:** Every `synchronize`/`push` enqueues a full assessment job, and the claim query enforces serial-per-project (`NOT EXISTS running for project`). Rapid pushes stack N full AST+Playwright scans that each scan a superseded SHA. Combined with the 60/hour per-project webhook rate limit (`webhook.ts:191`), a busy PR can still saturate the single worker and delay all other projects.
- **Evidence:** `src/server/webhook.ts:191-210` (`assertRateLimit` + `enqueueAssessmentJob` with `idempotencyKey: deliveryId` — every delivery is unique, so nothing dedupes); `src/server/assessment-jobs.ts:168-223` (serial claim); `src/server/assessment-worker.ts:102-193` (full clone+scan per job).
- **Action:** Minimal coalescing in `enqueueAssessmentJob` or `handleGitHubWebhookEvent`: before inserting a `trigger='webhook'` job, look for an existing `queued` job for the same `projectId` with a webhook payload; if found, update its `payload.ref`/`pullRequestHeadSha`/`availableAt`/`updatedAt` in place and return it instead of inserting (keep the oldest `idempotencyKey`; do not touch `running` jobs). Cap the change to webhook triggers only.
- **Verification:** Unit test on `enqueueAssessmentJob`: two rapid webhook enqueues for same project → one row, ref updated to newest SHA; `npx vitest run src/server/assessment-jobs.test.ts src/server/webhook.test.ts`; `npm run typecheck`.

### 5. P1 — Regression alerts computed from a pre-scan (stale) snapshot

- **Problem:** `runClaimedAssessmentJob` loads `db` + `snapshotProjectSlice` _before_ the minutes-long clone/scan, then `collectRegressionAlerts({db, ...})` matches `db.alerts` for `existingUnread`. Concurrent human reads/writes during the scan are invisible, so the apply can refresh-in-place an alert the user just read (resurrecting unread state) or miss a just-created one and mint duplicates.
- **Evidence:** `src/server/assessment-worker.ts:106-117` (pre-scan load), `125-142` (alert computation from stale `db`), `149-183` (apply under advisory lock but with precomputed `alerts`).
- **Action:** Move the unread-alert lookup inside the apply transaction: pass `run` + `trigger` into the `drizzle.transaction` block, re-read the project's unread `compliance_regression` alerts via the tx client (or `loadProjectDb` scoped read inside the lock), then build `alerts` and call `applyAssessmentPayload`. Keep the alert shape identical; the pre-scan `db` remains for `runAssessment` input only.
- **Verification:** Integration test (needs `DATABASE_URL`): mark regression alert read mid-scan (or simulate stale `db` vs fresh tx) → apply does not flip it back to unread; `npm run test:db`; `npm run typecheck`.

### 7. P1 — Coverage exclusions hide the riskiest paths; add unit tests for pure logic

- **Problem:** `vitest.config.mts:43-81` excludes `repo-checkout`, `github-tokens/app`, `report.ts` loader, `db/repo/**`, runtime scan drivers from unit thresholds. Thresholds (94 lines / 96 funcs) therefore certify a subset while checkout quota, ref handling, token decrypt errors, and report ordering ship with little or no unit coverage.
- **Evidence:** `vitest.config.mts:59-80`; untested pure functions: `assertCheckoutWithinQuota` (`src/server/repo-checkout.ts:30-57`), `parseJobPayload`/`jobFromRow` (`src/server/assessment-jobs.ts:59-89`), `evidenceRowsForProject`/`composeAuditReport` (`src/server/report-model.ts:131-144,251-279`), `verifyGitHubSignature` (`src/server/webhook.ts:33-44`).
- **Action:** Add (not refactor) unit tests only: quota counting (empty dir, nested, `.git` ignored, over-limit throws), payload parse fallback to `{}` on garbage, evidence ordering (export window oldest-first → rendered order asserted), signature verify false on missing secret/header. Do not lower thresholds; do not un-exclude live-I/O files.
- **Verification:** `npm run test:coverage` passes with thresholds intact; `npm run test:db` unchanged.

## P2 — worthwhile improvements

### 8. P2 — Synchronous recursive quota walk blocks the event loop and runs twice

- **Problem:** `assertCheckoutWithinQuota` uses `readdirSync`/`statSync` recursively and is called _twice_ per ref checkout (before fetch and after). On a 50k-file checkout this blocks the server event loop for seconds; symlink handling is implicit (non-file entries skipped) rather than explicit, and `node_modules`/`.next` count against the quota, rejecting legitimate monorepos.
- **Evidence:** `src/server/repo-checkout.ts:30-57`, call sites `122,134`.
- **Action:** Keep the quota but make it cheap and explicit: single async walk after final checkout state (drop the pre-fetch call, or keep pre-fetch only as a fast `du`-free file-count guard if measured necessary); skip symlink traversal explicitly via `Dirent.isSymbolicLink()`; skip `.git` (already) + document that `node_modules` counts (no new ignore semantics without product sign-off). Convert to `fs/promises` async iteration.
- **Verification:** Benchmark note in test (50k-file fixture completes without blocking — assert async fn + symlink loop fixture terminates); `npx vitest run src/server/repo-checkout.test.ts`; `npm run lint`.

### 9. P2 — Audit report silently drops controls and has a double-reverse ordering trap

- **Problem:** `composeAuditReport` uses `controls.flatMap(... return [] when no requirement)` — catalog/preset drift (control without requirement row) vanishes from the audit report instead of surfacing. Separately, `listEvidenceForExport` returns `rows.reverse()` (oldest-first) and `evidenceRowsForProject` does `.slice().reverse()` again — the final order is correct only by accident of two reverses; the next editor will break it.
- **Evidence:** `src/server/report-model.ts:270-274` (flatMap drop), `131-144` (filter+reverse); producer `packages/db/src/repo/evidence.ts:113-135` (`rows.reverse()`); consumer `src/server/report.ts:118-132`.
- **Action:** (a) Emit a visible `unable_to_verify` row (or `not_applicable` per `requirement-status.ts` semantics — check before choosing) for controls with no requirement instead of `[]`, including the control code so drift is auditable. (b) Normalize to a single documented ordering contract: loader returns oldest-first, model preserves it without reversing (or vice versa) with a named helper + test locking the order. Update markdown + HTML renderers only if the order changes.
- **Verification:** `npx vitest run src/server/report-model.test.ts src/server/report-html/report.test.ts` (new cases: missing-requirement control appears; evidence order oldest→newest stable); snapshot update only if ordering intentionally changes.

### 10. P2 — Org export fans out one query set per project (N+1)

- **Problem:** `exportOrgDataAction` does `...projectIds.map(loadProjectRuntime)` inside `Promise.all` — O(P) full runtime loads plus full evidence/assessment loads. Large orgs will time out the action and spike Postgres connections (`getDrizzle` pool).
- **Evidence:** `src/server/actions/org.ts:197-238` (lines `208-214` fan-out).
- **Action:** Bound it: chunk `projectIds` (e.g. 5 at a time) with sequential `for` loop or `pLimit`-style concurrency of 5; add a hard project cap (e.g. 50) returning a `PublicError` asking to narrow scope if exceeded. No schema change, no streaming refactor.
- **Verification:** Unit test with mocked loaders asserting max 5 in flight + cap error path; manual export on a 10-project org succeeds; `npm run typecheck`.

### 11. P2 — Job lease completion uses brittle string-equality on timestamps (INVESTIGATED 2026-09-10 — no change)

- **Problem:** `completeAssessmentJob`/`failAssessmentJob` guard with `eq(leaseExpiresAt, job.leaseExpiresAt) AND eq(startedAt, job.startedAt)` on ISO strings. If the column type normalizes (timestamp vs text, millis truncation, TZ), legitimate completions are rejected as "stale lease" and jobs loop to retry/fail spuriously.
- **Evidence:** `src/server/assessment-jobs.ts:239-247`, `278-286`; schema `packages/db/src/schema.ts` (verify `assessmentJobs` column types for `leaseExpiresAt`/`startedAt` when executing).
- **Finding:** columns are `timestamp withTimezone, mode: "string"` (`packages/db/src/schema.ts:281-282`). Both write and guard use `new Date().toISOString()` millis precision, which timestamptz preserves exactly — the round-trip is stable, so the guard is not brittle in practice. No change made; if the column type ever changes to a non-string mode, revisit.
- **Action:** Check the column types first. If text: keep but add a regression test locking the round-trip format. If timestamp/timestamptz: replace the guard with `id + status='running'` + `attempts` comparison (monotonic integer, no format risk), keeping `returning({id})` + stale warning. Smallest change that removes the format dependency.
- **Verification:** `npm run test:db` (lease claim→complete→fail cycle green, no spurious stale warnings); `npm run typecheck`.

### 13. P2 — Report loader fetches evidence twice

- **Problem:** `loadReportInput` concurrently loads `getProjectRuntime(project.id)` (which includes an evidence window) and `listEvidenceForExport(...)`, then discards the runtime's evidence (`{...runtime, evidence: exported.records}`). One of the two reads is always wasted; on evidence-heavy projects it doubles I/O on the export path.
- **Evidence:** `src/server/report.ts:103-133` (lines `118-131`).
- **Action:** Add a `skipEvidence` (or `includeEvidence=false`) option to `getProjectRuntime`/`loadProjectRuntime` and use it in `loadReportInput`, keeping `reportInputForProject` signature unchanged. Fall back to current behavior when the loader is unavailable.
- **Verification:** Route-level test or mocked-loader test asserting one evidence query per export; `npx vitest run src/server/report.test.ts`; `npm run typecheck`.
