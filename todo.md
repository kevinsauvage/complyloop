# Critical TODO

> Generated from a full project analysis.
> Only P0 and P1 items are included.

## Summary

The codebase is in strong shape: tenant isolation (installation-pinned webhooks, double-checked finding writes), SSRF guards, evidence append-only triggers, serial-per-project job claims, and fail-closed status derivation are all correctly implemented and verified. The remaining critical risks cluster in three places: (1) correctness of compliance verdicts (runtime-global AST suppression, sticky exceptions hiding regressions), (2) data-loss / deploy safety (e2e DB fallback, non-atomic migrations), and (3) silent pipeline degradation (dispatch failures with no alarm, racy stage writes, heartbeat false-cancels). Fix the 4 P0s first; the 5 P1s close the reliability gaps behind them.

## Priority Overview

| Priority | Count | Meaning                        |
| -------- | ----: | ------------------------------ |
| P0       |     4 | Critical / address immediately |
| P1       |     5 | High priority                  |

---

# P0 — Critical

## P0-1 — E2E harness can migrate and seed the production database

**What**

`playwright.config.ts` falls back `DATABASE_URL` to `E2E_DATABASE_URL → DATABASE_URL → E2E_DEFAULT_DATABASE_URL`, and the e2e `webServer.command` runs `npm run db:migrate && npm run e2e:seed && npm run build && npm run start` against whatever URL resolves. If `E2E_DATABASE_URL` is unset in an environment where `DATABASE_URL` points at a shared/staging/prod database, running e2e destructively migrates and seeds it. There is no guard (no `_e2e_` name check, no required `E2E_DATABASE_URL`, no refusal).

**Why**

This is a data-loss / production-corruption risk. A single local `npm run test:e2e` with a prod-like env wipes real org/project/evidence rows and replaces them with fixture data. The repo already gates prod migrations carefully (`scripts/vercel-build.mjs` migrates production-only so previews never touch shared DBs) — the e2e path bypasses that intent.

**Evidence**

- `playwright.config.ts:29-32` — `DATABASE_URL: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? E2E_DEFAULT_DATABASE_URL`
- `playwright.config.ts:79-80` — `command: "npm run db:migrate && npm run e2e:seed && npm run build && npm run start"`
- `e2e/env.ts` / `e2e/global-setup.ts` — no prod-URL refusal (verified: no `_e2e_` / `E2E_PROD_HARNESS` gate on the DB URL)

**How**

- Require `E2E_DATABASE_URL` explicitly before migrate/seed; never fall back to bare `DATABASE_URL`. Fail fast with a clear error if unset.
- Add a safety refusal: abort if the resolved URL does not look like an e2e database (e.g. require `_e2e` / `e2e` in the name, or require explicit `ALLOW_E2E_ON_DB=1` override).
- Apply the guard in `e2e/env.ts` (single choke point) so both `playwright.config.ts` and `global-setup.ts` inherit it.

**Done when**

- With `E2E_DATABASE_URL` unset and `DATABASE_URL` pointing at a non-e2e DB, `npm run test:e2e` aborts before any migrate/seed with a clear message.
- With `E2E_DATABASE_URL` set, e2e runs unchanged.
- A test covers the refusal (unit test on the resolver + CI e2e still green).

---

## P0-2 — Runtime audit on one route suppresses AST findings repo-wide (false-pass risk)

**What**

`filterAstFindingsForAuthority` drops **all** composition-sensitive / runtime-only / package-twin AST findings whenever the run-level boolean `runtimeRan` is true. `runtimeRan` is `pagesScanned > 0` for the whole run (`assessment.ts`), not per-route or per-file. A runtime audit covering only `/login` therefore suppresses AST hits in unscanned routes, and requirement status can derive `passed` with the defect still live.

**Why**

This violates the platform's core promise (evidence over claims; never mark passed without proof). For a compliance product a false-pass is worse than a false-fail: customers ship inaccessible code believing it verified, and `verified` remediations close on untested surface. The code comment states the intent ("the runtime verdict wins when it ran") but the implementation scopes "ran" to the project, not to the covered routes/files.

**Evidence**

- `packages/analysis-core/src/merge-findings.ts:29-40` — `if (!runtimeRan) return [...astFindings]; return astFindings.filter(...)` (global boolean, no route/file scoping)
- `src/server/assessment/assessment.ts:466-469` — `const runtimeRan = runtimeConfigured && runtimeResult.error === undefined && runtimeResult.pagesScanned > 0`
- `packages/analysis-core/src/contract/requirement-status.ts:95-104` — `runtime_only`/`site_level` derive `passed` from the same global `runtimeRan`

**How**

- Scope the drop to what runtime actually covered: pass the scanned route set / file set into `filterAstFindingsForAuthority` (or `mergeRawFindings`) and keep AST rows for uncovered files. Minimum viable fix: only drop AST findings whose file maps to a scanned route; keep the rest.
- Alternative if coverage mapping is unavailable: keep both (dedupe identical nodes only) rather than dropping by check-id class.
- Add tests: AST violation in unscanned route + runtime covering a different route → AST finding survives and requirement stays `failed`/`needs_review`.

**Done when**

- A run with runtime covering route A and an AST composition-sensitive violation in route B retains the route-B finding and does not derive `passed`.
- Existing merge tests (`merge-findings.test.ts`) plus the new scoped test pass; no change when runtime covers everything.

---

## P0-3 — Migration files apply non-atomically (half-applied prod DDL on failure)

**What**

`scripts/db-migrate.ts` applies each migration file via bare `sql.unsafe(body)` and only then inserts the `_complyloop_migrations` row. A multi-statement file failing midway leaves partial DDL applied with no record, so a retry re-applies half-applied DDL (duplicate-column / duplicate-index errors, or worse, half-created constraints). Advisory locking serializes concurrent migrators but does not make a single file atomic.

**Why**

Migrations run on production deploys (`scripts/vercel-build.mjs`). A half-applied migration blocks deploys and can leave the schema in a state no retry can cleanly recover from, requiring manual DB surgery on the production database. This is the highest deployment-reliability risk in the repo.

**Evidence**

- `scripts/db-migrate.ts:47-51` — `await sql.unsafe(body); await sql\`INSERT INTO "_complyloop_migrations"...\`` (no transaction wrapper)
- `scripts/db-migrate.ts:32` — advisory lock present (concurrency OK, atomicity missing)
- `scripts/vercel-build.mjs:8-11` — migrations run automatically on production deploys

**How**

- Wrap each file's body + bookkeeping insert in a single transaction (`BEGIN … COMMIT`, or run the whole `applyMigrations` loop in one transaction per file). On failure the file rolls back and stays unrecorded, so retry is safe.
- Keep the advisory lock as-is. Verify multi-statement bodies run inside the transaction driver correctly (postgres.js `sql.begin`).

**Done when**

- A deliberately failing multi-statement migration leaves zero partial objects and no `_complyloop_migrations` row; re-running after fixing the file succeeds.
- `npm run db:migrate` + `npm run test:db` pass.

---

## P0-4 — Worker dispatch fails silently; broken dispatch pages nobody for up to 24h

**What**

`dispatchAssessmentWorker()` returns `false` (console/`reportWarning` only) when `GH_WORKER_DISPATCH_TOKEN` / repo is missing or GitHub rejects the dispatch. Jobs then sit until the 15-minute schedule backstop. Meanwhile `scripts/operations-check.ts` treats all missing prod env as warn-only, and `ops-check.yml` runs daily — a broken dispatch configuration produces no failing signal for up to 24h while every manual/webhook run appears stuck in "queued".

**Why**

Dispatch is the only prompt trigger for the assessment pipeline; the schedule is a backstop, not the UX. Silent misconfiguration turns the core loop (Assess → Finding → …) into 15-minute latency with no alarm, which reads as "the product is broken" to every user and masks real queue pile-ups behind the same symptom.

**Evidence**

- `src/server/assessment/assessment-job-dispatch.ts:35-62` — `if (!token || !repo) return false; … catch → reportWarning … return false` (never throws)
- `scripts/operations-check.ts:33-50` — missing prod env degrades to warn instead of failing
- `.github/workflows/ops-check.yml:18-22` — daily cadence

**How**

- Make `ops:check` fail (non-zero exit) when dispatch env (`GH_WORKER_DISPATCH_TOKEN`, app repo resolution) is absent in production, or add a separate deploy-time check that does. Keep warn-only for genuinely optional keys (e.g. `SENTRY_DSN`).
- Alert on queue **age**, not just depth: fail/warn when the oldest `queued` job is older than ~20 minutes (covers dispatch-broken + worker-down with one signal).
- Shorten `ops-check` cadence or wire the age check into the existing 15-min schedule tick.

**Done when**

- With `GH_WORKER_DISPATCH_TOKEN` unset in a prod-config check, `ops:check` (or the deploy check) fails loudly instead of warning.
- A queued job older than the age threshold triggers the alert even when depth is 1.
- Normal operation (dispatch configured, queue draining) stays green.

---

# P1 — High Priority

## P1-1 — `updateAssessmentJobStage` read-modify-write clobbers concurrent stage payloads

**What**

`updateAssessmentJobStage` SELECTs the payload, spreads `{...parseJobPayload(row.payload), stage, stageStartedAt}`, then UPDATEs gated only on `status='running'`. Stage stamps are fire-and-forget (`void updateAssessmentJobStage(...)` at checkout/scan/apply boundaries), so two stamps can interleave: the loser overwrites the winner's `stage`/`stageStartedAt` (and any payload keys written between read and write). The SELECT also has no lease guard, so a stale worker can merge over newer payload state.

**Why**

Impact today is UI/crash-forensics accuracy (the status column stays the source of truth per the function's own comment), but wrong-stage data sends on-call debugging to the wrong stage and masks killed-worker attribution. It is also the only unguarded payload writer on the hot path — every other write uses locks or atomic compare-and-set.

**Evidence**

- `src/server/assessment/assessment-jobs.ts:631-667` — SELECT then UPDATE with spread-merge, `WHERE id AND status='running'` only
- `src/server/assessment/assessment-worker.ts:101-103,109,127` — `const reportStage = (stage) => { void updateAssessmentJobStage(job.id, stage); }` (fire-and-forget, overlapping possible)

**How**

- Single atomic update: `UPDATE assessment_jobs SET payload = payload || jsonb_build_object('stage', ..., 'stageStartedAt', ...) WHERE id AND status='running'` (or `jsonb_set`), no separate SELECT.
- Add a concurrency test: two overlapping stage writes → final payload has the later stage, no lost keys.

**Done when**

- Overlapping stage stamps converge on the last writer without dropping payload keys; the function has no SELECT.
- New concurrency test passes; existing assessment-job tests green.

---

## P1-2 — Heartbeat overlapping ticks cause false remote-cancel (valid runs discarded)

**What**

The lease heartbeat uses `setInterval` with a fire-and-forget async renew and no in-flight guard. Under pool pressure (`POOL_MAX=3`) a slow renew can overlap the next tick; the second tick carries a stale `expectedLease`, gets `null` from the exact-match `refreshAssessmentJobLease`, sets `cancelledRemotely=true`, and the run is discarded as cancelled even though nobody cancelled it.

**Why**

A valid long scan (large clone + Playwright) is thrown away and the project slot burned for nothing; the user sees "cancelled" for a run they never cancelled. Rare, but it strikes exactly the longest/most expensive runs.

**Evidence**

- `src/server/assessment/assessment-worker.ts:64-90` — `setInterval(() => { void (async () => { … refreshAssessmentJobLease({…expectedLease…}) … else { cancelledRemotely = true; … } })() }, ASSESSMENT_JOB_HEARTBEAT_MS)` (no in-flight flag)
- `src/server/assessment/assessment-jobs.ts:601-620` — exact-match lease guard returns `null` on stale `expectedLease`
- `packages/db/src/postgres.ts:202` — small pool (`max:3`) makes slow renews plausible

**How**

- Skip a tick while one renew is in flight (boolean / promise chain), e.g. `if (renewing) return; renewing = true; … finally { renewing = false; }`.
- Optionally forward the renewed lease on success before the next tick (already done via `onLeaseRenewed` — keep).

**Done when**

- Overlapping/slow renews never set `cancelledRemotely` spuriously (test with deferred renew mock: two ticks, one slow → single effective renew, no cancel flag).
- Real cancel still sets the flag via the `null` path when no renew is in flight.

---

## P1-3 — Post-login open-redirect guard divergence (`/\` passes the action, blocked by proxy)

**What**

`safeCallbackUrl` in the sign-in server action rejects `//` but allows `/\...`, while `toSafeCallbackUrl` in `proxy.ts` rejects both `//` and `/\`. The action passes the unblocked value as Auth.js `redirectTo`; `/\evil.com` is normalized to `//evil.com` by several browsers (backslash-as-slash), turning a post-login redirect into an attacker-host bounce.

**Why**

Low likelihood (requires an attacker-crafted login link) but a real phishing/session-adjacent mechanism, and the fix is one line. The two validators implement the same policy and disagree line-for-line — they should be one helper.

**Evidence**

- `src/server/actions/auth.ts:12-17` — `if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard"; return value;` (no `/\` check)
- `src/proxy.ts:36-46` — `value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")` (strict)

**How**

- Add the `!value.startsWith("/\\")` clause to `safeCallbackUrl`, or better, extract one shared helper imported by both (note: `proxy.ts` runs on the edge — keep the helper dependency-free).
- Add a unit test: `/\evil.com`, `//evil.com` → `/dashboard`; `/dashboard/findings` passes through.

**Done when**

- Both validators reject `/\...` and `//...`; shared helper or identical clauses.
- New test covers `/\`, `//`, valid internal path.

---

## P1-4 — Assessment / snapshot / evidence history grows without bound

**What**

Every webhook push appends assessment + snapshot rows (snapshot dedup only shrinks the hash map, not the row count). Only `webhook_deliveries` (10k) and rate-limit buckets are pruned. There is no retention policy for superseded assessments, snapshots, findings history, or evidence — storage and export cost grow with every push.

**Why**

Hot reads are bounded (latest-only loaders, capped exports), so this is a slow-burn scalability/cost problem, not an outage. Left alone it inflates the production database, slows backups, and makes evidence exports heavier until someone is forced into an emergency prune without a tested policy.

**Evidence**

- `packages/db/src/repo/assessments.ts:12-32` — every run inserts assessment + snapshot (dedup only empties `fileHashes`)
- `src/server/assessment/assessment-scheduler.ts:72-90` — prunes only `webhook_deliveries` + rate-limit buckets
- `drizzle/0000_init.sql:83-98` — assessment/snapshot tables with no retention trigger/TTL
- `scripts/operations-check.ts:56-65` — evidence size already monitored (signal exists, policy does not)

**How**

- Define a retention policy (e.g. keep N latest assessments + snapshots per project, or T days; keep evidence rows referenced by retained assessments + all human-decision evidence).
- Implement as a batched prune in the scheduler tick (same pattern as the delivery prune), behind env-tunable limits.
- Verify exports and the finding page only ever need retained rows before deleting anything.

**Done when**

- A project with hundreds of pushes retains a bounded number of superseded assessment/snapshot rows per the policy; latest-run reads, finding history, and exports unchanged.
- Prune runs in the scheduled tick without locking interactive writes (batched, logged via `reportWarning`-level telemetry, not Sentry noise).

---

## P1-5 — Sticky human decisions mask new violations indefinitely

**What**

`deriveRequirementStatus` returns the stored `currentStatus` for any permanent exception/human-pass before looking at open findings. Only temporary-exception expiry re-arms the requirement. A requirement marked `passed`-by-exception therefore never re-surfaces regressions — new violations accumulate silently underneath the sticky verdict.

**Why**

By design per the code comment, but it quietly defeats continuous monitoring (the core loop's last stage) and the "evidence over claims" principle: the dashboard says `passed` while open violations exist. At minimum the residual risk must be visible; ideally the model distinguishes "exception covers known finding X" from "new violations since the exception".

**Evidence**

- `packages/analysis-core/src/contract/requirement-status.ts:67-72` — `if (isStickyHumanDecision(input)) { return input.currentStatus ?? "unable_to_verify"; }` before the open-findings check at `:75-80`
- `src/server/assessment/assessment-status.ts:49-93` — only temp-exception expiry re-arms

**How**

- Smallest safe change: surface the masked state in the UI/API (e.g. requirement shows "passed by exception — N open findings" and the exception review lists findings detected after the exception timestamp).
- Larger follow-up (separate task): narrow exceptions to finding fingerprints so new violations re-open the requirement; do not change status derivation until the product spec blesses the semantics.
- Add a contract-level test pinning the precedence (sticky-vs-findings) so the behavior is explicit.

**Done when**

- A requirement with a permanent exception + new open violations visibly reports the masked count (or re-opens per the chosen semantics), with the behavior covered by a `requirement-status` test.
- No change to temp-exception expiry behavior.

---
