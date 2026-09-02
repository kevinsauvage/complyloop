# TODO — ComplyLoop

One list, priority-ordered. Each item says **what** we'll build and **why** it matters.
Verified against the codebase on 2026-09-02 (supersedes `todo.md` and `nomotron-todo.md`).

**Definition of done for any change:** `npm run lint && npm run typecheck && npm run test && npm run build`
**Current state (verified 2026-09-02):** all four gates pass on `main` (test: 917 passed / 2 skipped). The core go-live machinery is present and real — health endpoint with 503-on-DB-down (`src/app/api/health/route.ts`), Postgres sliding-window rate limiting with tests (`src/server/rate-limit.ts`), HMAC webhook verification + out-of-request-path job enqueue (`src/server/webhook.ts`), `E2E_AUTH_ENABLED` gating of the e2e harness (prod worker required, `src/server/e2e-harness.ts`, `assessment-job-drain.ts`), migration runner, temp-checkout cleanup, and no committed secrets (.env gitignored). **Working tree note:** the P2 "Remediation history view" is in progress — `src/components/findings/remediation-history.tsx` + `.test.tsx` are untracked and `src/app/findings/[id]/page.tsx` is modified but uncommitted.

---

## P0 — Go-live blockers (nothing ships until these are done)

- [ ] **Run the go-live checklist in `docs/deploy.md` on a real environment**
      What: provision production Postgres + run migrations, set stable `AUTH_SECRET`/`AUTH_URL`, create the production GitHub App (Contents R/W, PR R/W, Checks R/W, Metadata R) + webhook secret, start at least one `npm run worker` process.
      Why: the app runs in dev today; none of this is confirmed for production, and the worker is mandatory — without it assessments never run.

- [ ] **Tested backup & restore drill**
      What: restore a `pg_dump` to staging once, verify `/api/health` and sign-in afterwards; schedule daily dumps with an off-host copy (`npm run ops:backup` exists, the drill isn't evidenced).
      Why: evidence is append-only compliance data — an untested backup is not a backup.

- [ ] **Sentry alerting wired, not just a DSN set**
      What: alert on unhandled exceptions, `webhook_clone_failed`, `workspace_missing`, `assessment_job_failed` evidence, and growing job queues.
      Why: silent failures mean users wait forever on assessments with no signal to the team.

- [ ] **Uptime probe → `GET /api/health`, and `E2E_AUTH_ENABLED` unset in prod**
      What: point the load balancer at the health endpoint (503 when DB is down — verified working); confirm the e2e auth bypass env var is not set on the deployment.
      Why: the e2e flag skips GitHub App enforcement and clones a fixture tree — leaving it on would be a security hole.

## P1 — Production hardening (new findings, 2026-09-02)

- [ ] **Wire retention for `rate_limit_buckets` — it grows unbounded today**
      What: `pruneRateLimitBuckets()` is implemented (`src/server/rate-limit.ts:60`) but has **no production caller** — only tests. Every connect/assess/AI/webhook action writes a row keyed by user/project; nothing ever sweeps the table. Run it from a scheduled task (extend the worker loop or an ops cron), and fold in a sweep for orphaned temp checkouts (a SIGKILLed worker skips `finally` cleanup in `withRepoCheckout`).
      Why: on a live platform the table accumulates a row per user per window and grows forever — a slow, silent disk/DB bloat.

- [ ] **Move migrations out of the app start command (not multi-replica safe)**
      What: the Docker `CMD` runs `npx tsx scripts/db-migrate.ts && node server.js` on **every** container start, and `scripts/db-migrate.ts` applies pending SQL files with no advisory lock wrapping the apply. Two replicas scaling up together can race to apply the same migration. Run migrations as a one-off out-of-band step (single pod / deploy pipeline), or wrap apply in a Postgres advisory lock so only one replica migrates.
      Why: horizontal scaling is the normal prod topology; a migration race mid-deploy is how production DBs break.

- [ ] **Fail closed on weak deploy secrets**
      What: `docker-compose.yml` defaults `AUTH_SECRET` to `e2e-secret-change-me` and hardcodes the prod Postgres password `complyloop`; `docs/deploy.md`'s full-stack example literally sets `AUTH_SECRET=replace-me`. If the compose profile is used for a real deploy, sessions/encrypted tokens are signed with a known secret. Reject the known defaults at startup (abort if `AUTH_SECRET` is a placeholder) and require a real password for the compose Postgres.
      Why: a guessable signing secret turns the auth/at-rest protections into theater.

- [ ] **Don't raise a Sentry error on every health probe while DB is down**
      What: `/api/health` calls `reportError(error, { code: "health_database_down" })` on every request. When `SENTRY_DSN` alerting lands, an LB draining across an outage floods Sentry with an identical alert per probe. Log the health-down at warning level (or rate-limit it) instead of capturing an exception each time.
      Why: protects alerting cost and signal quality once P0 #3 is wired.
