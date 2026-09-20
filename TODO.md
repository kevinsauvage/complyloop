# TODO — Global Project Audit

Prioritized backlog from a full-codebase audit (Graft + source inspection).
Ordered by the impact order: correctness → missing functionality → security →
reliability → architecture → complexity → performance → UX → tests/docs.

---

### [ ] Restore a green, trustworthy quality gate

**Why:** `npm run verify:gate` (the definition of done) is red. `src/app/error.test.tsx` fails to collect because it imports `./not-found` → `@/auth` → `next-auth` → `next/server`, which Vitest cannot resolve; and `packages/analysis-core/src/runtime/html-validate-runtime.test.ts` intermittently times out (15s) because it imports Playwright but runs in the node project with no browser timeout. CI `quality` and local gates cannot pass.

**Where:** `src/app/error.test.tsx:7`, `src/app/not-found.tsx:4`, `vitest.config.mts:14-18,110-129`, `packages/analysis-core/src/runtime/html-validate-runtime.test.ts:72-184`.

**Change:** Decouple the not-found/error test from `@/auth` (inject or mock the session source), and give the browser-importing unit tests the DOM project + `PLAYWRIGHT_TEST_TIMEOUT_MS` (or move them to the gated e2e/DB path).

**Impact:** High

---

### [ ] Tie org membership to immutable user id (cross-tenant takeover)

**Why:** Membership lookup and claiming are keyed on the mutable `github_login`. `listOrgIdsForUser` grants org access to any account whose login matches a row — even one already claimed by another user — and `claimMembershipsForLogin` reassigns an existing claimed row (including `owner`) to whoever next signs in with that login. A recycled/renamed GitHub username inherits another tenant's org and projects.

**Where:** `packages/db/src/repo/orgs.ts:36-57` (`listOrgIdsForUser`), `:65-90` (`isPersonalOrgProvisioned`), `:240-270` (`claimMembershipsForLogin`).

**Change:** Resolve access and ownership by immutable `userId` only. Claim exclusively `userId IS NULL` unexpired invites; never reassign a row that already has a `userId`. On login collision with a claimed row, ignore it rather than granting.

**Impact:** High

---

### [ ] Stop false `passed`/resolves when a runtime audit only partially succeeds

**Why:** `runtimeRan` is `error === undefined && pagesScanned > 0`, ignoring `pageFailures`/`probeFailures` returned by the scanner. With some routes crashing, runtime-only/site-level/html-validate requirements can be derived `passed` and DOM/site findings on unaudited URLs are resolved as fixed — an unverified compliance claim, the exact thing the product must never do.

**Where:** `src/server/assessment/assessment.ts:466-493`, `src/server/assessment/assessment-findings.ts:218-240`, `packages/analysis-core/src/runtime/scan.ts:603-653`.

**Change:** Consume `pageFailures`/`probeFailures`: require full page coverage before any `passed` or DOM/site resolution; otherwise degrade to `unable_to_verify` (or scope resolution strictly to audited URLs).

**Impact:** High

---

### [ ] Force a full scan when control scope or engine version changes

**Why:** A preset expansion or `ANALYSIS_ENGINE_VERSION` bump makes `sourcesUnchanged` false, but if the pushed commit also touched a JSX file, `useScoped` stays true and only changed files are scanned. Newly in-scope per-file checks then produce no findings on the unchanged tree and are derived `passed` under standard authority — silently missed checks.

**Where:** `src/server/assessment/assessment.ts:353-416` (esp. `useScoped` vs `snapshotKey`/`forceFullScan`).

**Change:** Force a full-tree scan whenever `snapshot.controlScopeKey !== snapshotKey` (scope/engine changed), in addition to deletions and cross-file checks.

**Impact:** High

---

### [ ] Make assessment job finalization atomic (no duplicate or dropped results)

**Why:** Completion matches on the claim-time `(startedAt, leaseExpiresAt)` pair while the heartbeat mutates the lease asynchronously; a renewal resolving during `complete` makes the write no-op, leaving the job `running` so lease recovery re-runs it and persists a duplicate assessment/evidence. The apply-time re-check verifies only `status`, not lease ownership, so a reclaimed job can be applied twice; and a cancel landing after the apply commit leaves a `cancelled` job with fully persisted results.

**Where:** `src/server/assessment/assessment-worker.ts:62-90,190-231`, `src/server/assessment/assessment-pipeline.ts:192-264` (re-check at `:213-219`), `src/server/assessment/assessment-jobs.ts:443-505,564-587`.

**Change:** Finalize the job status inside the same transaction/lock as the apply write (or re-read the current lease under the lock before completing), verify lease ownership in the apply re-check, and make cancel and complete mutually exclusive so a cancel always means "saves nothing".

**Impact:** High

---

### [ ] Make webhook redeliveries idempotent through coalescing

**Why:** The route computes `firstDelivery` but never short-circuits on it, and webhook coalescing refreshes the pending job's payload without persisting the incoming `idempotencyKey`. Once the merged job leaves `queued`, a GitHub redelivery of the same `x-github-delivery` no longer matches any key and enqueues a duplicate scan.

**Where:** `src/app/api/github/webhook/route.ts:78-99,124-129`, `src/server/assessment/assessment-jobs.ts:165-227`.

**Change:** Skip processing when the delivery was already claimed (or return the existing job), and merge/persist the incoming idempotency key (or key deliveries per ref) so redeliveries map to the coalesced job.

**Impact:** High

---

### [ ] Apply migrations atomically and make them replay-safe

**Why:** `db-migrate.ts` runs each migration's DDL and its `_complyloop_migrations` insert as separate statements with no transaction; `0003_findings_engine.sql` guards nothing with `IF NOT EXISTS`. A crash between commit and the tracking insert replays the DDL and permanently fails ("constraint already exists"), and there is no down-migration path.

**Where:** `scripts/db-migrate.ts:39-53`, `drizzle/0003_findings_engine.sql:24-26`, `package.json:11` (`vercel-build`), `docs/vercel.md`.

**Change:** Wrap each migration plus its tracking insert in one transaction, make DDL re-runnable, and stop running migrations from `vercel-build` (see deploy item) so schema can't drift ahead of running code.

**Impact:** High

---

### [ ] Serialize org mutations per org, not per user

**Why:** `withOrgWrite` takes a lock keyed on `userId` (`orgWriteLockKey`), so two owners of the same org mutate under different locks and act on stale snapshots. Concurrent `leaveOrgMember` calls can each see the other as a remaining owner and delete both, leaving the org ownerless; role changes and invites similarly lose updates.

**Where:** `packages/db/src/postgres.ts:252-255`, `src/server/workspace/workspace-write.ts:269`, `src/server/workspace/org-membership.ts:139-148`.

**Change:** Lock org mutations on the org id (keep the user-scoped lock only for personal-org provisioning).

**Impact:** High

---

### [ ] Fail closed on ambiguous multi-org webhooks

**Why:** When a repo is connected in several orgs sharing one installation id, `candidates.find(...)` returns the first match and queues only that project; the ambiguity guard covers only the missing-installation branch. The other tenant's continuous re-assessment silently stops and its compliance state goes stale.

**Where:** `src/server/github/webhook.ts:159-189`.

**Change:** Reject the delivery (or enqueue for all matched projects) when more than one candidate matches, so no tenant is silently skipped.

**Impact:** Medium

---

### [ ] Authorize and rate-limit before expensive request work

**Why:** `updateRuntimeAuditAction` runs `assertSafeRuntimeUrl` (Node DNS resolution of an attacker-chosen host) before the permission check and rate limit, returning distinct messages that form a server-side DNS oracle usable by any signed-in user. The evidence report and GitHub repo-list routes have no rate limit despite loading up to 5,000 evidence rows or paginating all installations.

**Where:** `src/server/actions/runtime-audit.ts:50-61`, `src/app/(app)/evidence/report/route.ts`, `src/app/(app)/evidence/report/html/route.ts`, `src/app/api/github/repos/route.ts`.

**Change:** Do the permission check and rate limit before the DNS lookup, and add rate limits to the expensive read routes.

**Impact:** Medium

---

### [ ] Fix alert read-state authorization

**Why:** `markAlertReadAction` / `markAllAlertsReadAction` are gated on `project.view`, and the alert `read` flag is a single project-wide column. A `viewer` (read-only role) can clear every unread regression alert for all users, hiding compliance regressions from admins.

**Where:** `src/server/actions/alerts.ts:38,59`, `packages/db/src/schema.ts:262`.

**Change:** Require a write permission for mark-read (matching who owns decisions), or make read state per-user.

**Impact:** Medium

---

### [ ] Add indexes for the findings list and filters

**Why:** The main findings list orders by `severity_rank, id`; the only severity index is `(project_id, status, severity_rank, id)`, which cannot serve the unfiltered list. `control_id` and `engine` filters and the remediations `EXISTS` also have no supporting index, so the core list degrades as data grows.

**Where:** `packages/db/src/schema.ts:213-224,247`, `packages/db/src/repo/findings.ts:62-112`.

**Change:** Add the missing composite indexes for the unfiltered severity-first load and the filter columns, and back them with a migration.

**Impact:** Medium

---

### [ ] Make the gate cover the DB and product-critical read paths

**Why:** `verify:gate` omits `test:db` and `test:e2e`; the CI "schema↔migration drift gate" (`drizzle-kit check`) is a no-op because `drizzle/meta/` is not committed; and every page loader (`findings-view`, `dashboard-view`, `evidence-queries`, `report`, …) is excluded from coverage with "covered via e2e", which the gate never runs. `test:db` also silently passes with zero tests when `DATABASE_URL` is unset.

**Where:** `scripts/verify-gate.sh:8`, `vitest.config.mts:52-102`, `.github/workflows/ci.yml:71-73`, `packages/db/src/*.test.ts` (`describe.skipIf`).

**Change:** Run DB integration in the gate (or fail loudly when it is skipped), add minimal tests for the excluded loaders, and make the drift check actually compare schema to migrations.

**Impact:** Medium

---

### [ ] Close production/deploy operability gaps

**Why:** `ops:check` only warns on missing production env (AUTH_SECRET, AUTH_URL, GITHUB_APP_*, webhook secret, dispatch token, SENTRY_DSN) despite docs claiming non-zero exit; the ops-check workflow's health ping and Slack failure conditions use `if: env.*` inside the same step that defines those vars, so both are always false; and `vercel-build` migrates the shared production DB on preview deploys.

**Where:** `scripts/operations-check.ts:95-98`, `.github/workflows/ops-check.yml:43,52`, `package.json:11`, `docs/vercel.md`.

**Change:** Fail `ops:check` on missing required production config, move the workflow env to job/step scope so the conditions evaluate, and restrict migrations to production deploys.

**Impact:** Medium

---

### [ ] Remove dead exports and consolidate duplicated helpers

**Why:** Multiple exported symbols have no importers (e.g. `getStoredGitHubToken`, `canManageOrgMembers`), the OAuth-configured predicate and `AUTH_URL` assertions are duplicated across `proxy.ts`/`auth.ts`, and `isUniqueViolation` is reimplemented in more than one place with divergent correctness. Oversized functions/files add navigation cost for no benefit.

**Where:** `src/server/github/github-tokens.ts:112`, `src/server/workspace/org-queries.ts:105`, `src/proxy.ts:12-18`, `packages/db/src/repo/orgs.ts:161-173`.

**Change:** Delete unused exports, collapse duplicated predicates/helpers into one canonical implementation, and split the largest functions where it reduces risk.

**Impact:** Medium

---

### [ ] Strengthen the product's own accessibility e2e

**Why:** `e2e/a11y.spec.ts` labels `/` as "dashboard", but `/` is the public marketing page, so the real `/dashboard` is never axe-scanned; it only runs `wcag2a`/`wcag2aa`, discards anything below "serious", skips `/login`, error/not-found, and dialog states, and uses the flaky `networkidle` wait — weak coverage for an accessibility product.

**Where:** `e2e/a11y.spec.ts:29-63`.

**Change:** Point the spec at the real authenticated pages, include WCAG 2.1/2.2 AA and all impacts (or a documented severity floor), cover login/404/dialog states, and replace `networkidle`.

**Impact:** Low

---

### [x] Reconcile docs and comments with the code

**Why:** README and `docs/vercel.md` still instruct subscribing to `push, pull_request`, but only `push` is handled; documented assessment limits differ from `.env.example`; and `assessment-scheduler.ts` references a "Vercel worker route" that does not exist. Operators following the docs misconfigure the deployment.

**Where:** `README.md:48`, `docs/vercel.md:126-139`, `.env.example:69-72`, `src/server/assessment/assessment-scheduler.ts:11-16`.

**Change:** Update the docs/comments to match the implemented events, defaults, and topology.

**Impact:** Low

---

## Biggest Wins

1. **Close the cross-tenant membership takeover** — membership keyed on mutable login is the most serious data-integrity/security defect; one root cause, one fix.
2. **Eliminate assessment false-pass paths** (partial runtime coverage + scoped scan on scope change) — the core promise is verified compliance; silent `passed` is the worst possible failure.
3. **Make assessment job finalization atomic** — the lease/complete races produce duplicate or lost results and `cancelled` jobs with persisted state.
4. **Restore a trustworthy gate that covers DB and the product-critical read paths** — without it, every other fix is unverifiable.
5. **Make migrations transactional and deploy-safe** — protects against a stuck/failed schema and schema-ahead-of-code deploys.

## Target State

- The gate is green and meaningful: lint, typecheck, unit + coverage, build, DB integration, and e2e all run, and schema↔migration drift is actually detected.
- Membership and access are keyed on immutable user ids; no cross-tenant read or takeover, and every mutation (including alerts) is permission-gated.
- A scan either covers everything or reports `unable_to_verify`; no requirement passes and no finding resolves without complete evidence.
- Each assessment persists exactly once regardless of cancels, retries, lease recovery, or redelivered webhooks.
- Webhook deliveries are idempotent, coalesced without duplicates, and never silently skip a matching tenant.
- Migrations apply atomically on production deploys only, with a documented rollback path.
- The findings list and filtered views are index-backed and scale with data.
- Ops checks fail loudly on missing production config, and failure alerts actually fire.
- Docs and comments match the implemented events, limits, and topology.
- Dead exports and duplicated helpers are gone, leaving a smaller surface to maintain.
