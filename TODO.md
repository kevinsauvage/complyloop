# TODO — Compliance Engineering Platform audit roadmap

Source of truth: implementation (via Graft graph + direct file reads), not docs.
No prior audit files found (`BUG-TODO.md`, `TODO-*.md` absent; `graft grep TODO|FIXME|HACK|XXX` = zero hits), so nothing to consolidate — this is the single list.
Do not modify app code outside the Action of the item being executed. Work top-down (P0 → P3).

Conventions per item: **Problem** (what is wrong) · **Evidence** (exact files/functions) · **Action** (minimal change) · **Verification** (commands/tests).

> Status 2026-09-10 — easy wins implemented: #1, #2, #3, #4, #5, #6, #10, #12, #13, #14b DONE
> (see ✅ markers). #14a and #11 investigated — no change needed (notes inline).
> Remaining: #7–#9.

---

## P1 — high-impact correctness / architecture

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

### 11. P2 — Job lease completion uses brittle string-equality on timestamps (INVESTIGATED 2026-09-10 — no change)

- **Problem:** `completeAssessmentJob`/`failAssessmentJob` guard with `eq(leaseExpiresAt, job.leaseExpiresAt) AND eq(startedAt, job.startedAt)` on ISO strings. If the column type normalizes (timestamp vs text, millis truncation, TZ), legitimate completions are rejected as "stale lease" and jobs loop to retry/fail spuriously.
- **Evidence:** `src/server/assessment-jobs.ts:239-247`, `278-286`; schema `packages/db/src/schema.ts` (verify `assessmentJobs` column types for `leaseExpiresAt`/`startedAt` when executing).
- **Finding:** columns are `timestamp withTimezone, mode: "string"` (`packages/db/src/schema.ts:281-282`). Both write and guard use `new Date().toISOString()` millis precision, which timestamptz preserves exactly — the round-trip is stable, so the guard is not brittle in practice. No change made; if the column type ever changes to a non-string mode, revisit.
- **Action:** Check the column types first. If text: keep but add a regression test locking the round-trip format. If timestamp/timestamptz: replace the guard with `id + status='running'` + `attempts` comparison (monotonic integer, no format risk), keeping `returning({id})` + stale warning. Smallest change that removes the format dependency.
- **Verification:** `npm run test:db` (lease claim→complete→fail cycle green, no spurious stale warnings); `npm run typecheck`.
