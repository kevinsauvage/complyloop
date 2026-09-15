# Deploying ComplyLoop on Vercel

Single topology: the Next.js app (web + API) runs on Vercel; a GitHub Actions
scheduled workflow sweeps assessments; Postgres runs on Neon or Supabase.
There is no worker process, no Docker image, and no `git` CLI anywhere —
checkouts use pure-JS git (isomorphic-git) and preview audits use a
serverless Chromium build (`@sparticuz/chromium`).

## How it runs

| Concern       | Behavior                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web/API**   | Vercel Fluid functions, `next build` with zero config                                                                                                                                                                     |
| **Jobs**      | Queued in Postgres; every enqueue self-fetches the single-scan worker route (`POST /api/internal/jobs/run?limit=1`) in `after()`, the GitHub Actions sweep hits `POST /api/internal/jobs/run?limit=10&concurrency=2` every 15 min (`.github/workflows/assessment-sweep.yml`) as the orphan/expired-lease backstop; 3 attempts with backoff, serial per project, 30-min lease renewed by a 5-min heartbeat |
| **Checkouts** | Ephemeral isomorphic-git shallow clone per job into `/tmp`; deleted after                                                                                                                                                 |
| **Browsers**  | `@sparticuz/chromium` (pinned) when `ASSESSMENT_RUNTIME_BROWSER=serverless`; locally installed Playwright browser otherwise                                                                                               |
| **State**     | Postgres only; evidence append-only (`prepare: false` is already set, so pooled/transaction-mode connections work)                                                                                                        |
| **Backups**   | Postgres provider point-in-time (no app-side dump)                                                                                                                                                                        |

## 1. Database

Use Neon or Supabase with a **pooled connection string** (serverless fan-out
exhausts direct connections):

- Neon: the pooled (`-pooler`) hostname.
- Supabase: the pooler URL (transaction mode works — `prepare: false` is set
  in `packages/db/src/postgres.ts`).

Migrations run **from your machine** against the remote DB before first deploy
and on every schema change:

```bash
DATABASE_URL="<remote-url>" npm run db:migrate
```

## 2. Sweep (the assessment worker)

`/api/internal/jobs/run` is the **only** route that runs scans — trigger
sites (dashboard action, webhook) only enqueue, then self-fetch
`POST /api/internal/jobs/run?limit=1` in `after()` so scans start
immediately (each invocation claims one job; per-project claims serialize
concurrent tasks). The backstop is the `assessment-sweep` GitHub Actions
workflow (`.github/workflows/assessment-sweep.yml`, every 15 min,
`?limit=10&concurrency=2`): it reclaims jobs left `queued`/`running` by
failed self-fetches, killed tasks, or expired leases via the route's
lease-recovery path. There is no Vercel Cron — Hobby plans only allow daily
schedules, which left orphans stranded up to ~24h. `workflow_dispatch` on the
workflow doubles as an operator drain button.

Authentication: both the self-fetch and the sweep send
`Authorization: Bearer <WORKER_SECRET>`; the route compares it constant-time
(`worker-auth.ts`). Set a single `WORKER_SECRET` (≥16 chars, production
only) — no `CRON_SECRET` coupling.

The route runs with `maxDuration = 300` (Hobby caps at 300; Pro up to 800).
The sweep uses `limit=10&concurrency=2` to drain backlogs in a few ticks; on
Pro drop back to small batches (`limit=2`) so a slow clone/scan fits. Expired rate-limit
buckets prune once per batch (`runAssessmentJobBatch`).

If the queue ever grows instead of draining, both the self-fetch drain and
the sweep stopped firing or started failing — alert on `assessmentJobs` queue depth
(see `ops:check` below) and check the Vercel function logs (filter `[event]`
for `assessment_opportunistic_drain_failed`) plus the Actions run logs.

## 3. Environment variables (Vercel dashboard)

| Variable                                      | Value                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Pooled Postgres URL with `sslmode=require`                                                                          |
| `AUTH_SECRET`                                 | `openssl rand -base64 32` (stable — rotation also re-encrypts stored tokens)                                        |
| `AUTH_URL`                                    | `https://<vercel-app>` (**required** in production)                                                                 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`       | GitHub App OAuth client                                                                                             |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`    | Installation-token repo access                                                                                      |
| `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET`   | Install link + webhook verification                                                                                 |
| `WORKER_SECRET`                               | Bearer for the worker route (self-fetch + sweep secret, ≥16 chars)                                                              |
| `ASSESSMENT_RUNTIME_BROWSER`                  | `serverless` (Vercel) — unset locally                                                                               |
| `ASSESSMENT_MAX_CHECKOUT_BYTES`               | `100000000` (100 MB — `/tmp` caps at ~500 MB)                                                                       |
| `ASSESSMENT_MAX_CHECKOUT_FILES`               | `10000`                                                                                                             |
| `ASSESSMENT_MAX_RUNTIME_PAGES`                | `10` (fewer pages per serverless run)                                                                               |
| `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`)     | Required by `ops:check` in production                                                                               |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | Private preview gate (Basic Auth on every page; unset = open). Set both on the deployed project until public launch |
| `COMPLYLOOP_SUPPORT_EMAIL`                    | Shown on the Organization page                                                                                      |
| `AI_GATEWAY_API_KEY`                          | Optional — AI explanations/patches                                                                                  |

**Never set:** `E2E_*` (the harness swaps real checkouts for fixtures and skips
prod GitHub enforcement), `DATABASE_SSL_INSECURE`.

GitHub App settings: callback
`https://<vercel-app>/api/auth/callback/github`, webhook
`https://<vercel-app>/api/github/webhook` (events `push`, `pull_request`).

## 4. Runtime audits on Vercel

Set `ASSESSMENT_RUNTIME_BROWSER=serverless`. `@sparticuz/chromium` is pinned
exact (`149.0.0` — that package versions by Chromium major and may break at
any release, so upgrades are deliberate). The launch site is
`getBrowser()` in `packages/analysis-core/src/runtime/scan.ts`; launch
failures surface as "Could not start the browser used for preview audits."
(`scan-error.ts`), same as a missing local browser. `playwright-core` reads
its `browsers.json` registry at load, which file tracing omits by default —
`next.config.ts` force-includes it for all routes (`outputFileTracingIncludes`;
without it every runtime scan fails with `Cannot find module
.../browsers.json`).

## 5. Monitoring

- `GET /api/health` → `200` with queue depth, `503` when Postgres is down.
  Use it as the Vercel/dead-man check. A job stuck in `queued` with no
  worker activity shows up here as a growing `assessmentJobs` count.
- Lifecycle events (`[event] assessment job enqueued/claimed/completed`,
   `worker_batch_started/finished`, `worker_unauthorized`) log to stdout in
   production — filter Vercel logs for `[event]` to trace a stuck job from
   enqueue to claim. A `worker_unauthorized` line means the sweep/self-fetch
   bearer ≠ `WORKER_SECRET`, so ticks never drain the queue.
- `npm run ops:check` (from any machine with `DATABASE_URL`) verifies DB +
  prod env + queue depth. Run it on a schedule with failure alerting — it is
  the replacement for the old worker healthcheck.
- Sentry: unhandled exceptions, `assessment_job_failed` /
  `assessment_job_retrying`, `github_check_run_failed`, growing queue depth.

## 6. Evidence retention

The table grows unbounded by design (append-only trigger). Monitor
`pg_total_relation_size('evidence')` alongside queue depth. If you ever prune,
it is a superuser-level migration, not app code: keep decision records
(`requirement_exception_*`, `requirement_human_*`, `remediation_*`, finding
dismissals) forever; only noise kinds (`assessment_completed`,
`assessment_job`, `monitoring_changes_detected`) are candidates. Exports take
the newest 5000 rows and mark `truncated` — that bounds downloads, not the table.

## Pre-launch checklist

- [ ] Remote Postgres reachable; `db:migrate` applied from local machine
- [ ] All env vars set, `WORKER_SECRET` (≥16 chars) configured, no placeholders
- [ ] Basic Auth credentials set (private preview); remove them at public launch
- [ ] Sweep workflow firing every 15 min (Actions tab) + `WORKER_SECRET` repo secret set
- [ ] Sign in → connect a repo → run assessment → results appear
- [ ] Assessment of a real repo exercises the isomorphic-git clone path
- [ ] Preview audit works with `ASSESSMENT_RUNTIME_BROWSER=serverless`
      (or the setting is consciously left unset → AST-only, `unable_to_verify`)
- [ ] Push a commit → webhook re-assessment enqueues (job history shows it)
- [ ] Create a draft PR from a finding → branch pushed, PR opened
- [ ] Cancel a queued/running job → status `cancelled`, nothing persisted
- [ ] `/api/health` returns 200; Sentry receives a test issue
- [ ] Provider DB backups enabled; restore drilled once to staging (record date + owner here when done: \_\_\_)

## Decision log (Vercel migration, 2026-09-15)

- **Deleted:** `scripts/run-assessment-worker.ts` (Cron owns draining),
  `Dockerfile` / `docker-compose.yml` / `.dockerignore`, `docs/deploy.md`,
  `scripts/backup-postgres.sh`, `src/server/github/git.ts` (+ tests),
  `simple-git` and `playwright` library deps, `worker`/`ops:backup` scripts,
  the `DOCKER_BUILD` standalone branch.
- **`git` CLI → isomorphic-git** (verified: not shipped in the function
  runtime). Single sink `withRepoCheckout` + PR branch/commit/force-push all
  pure-JS; token travels per-request in the `Authorization` header. Full
  40-hex SHAs fetch by hash (verified live against GitHub); short SHAs need
  the full hash or a branch/tag name. Fix-branch commits now carry an explicit
  `ComplyLoop` author (the old CLI path silently depended on host gitconfig).
- **Chromium → `@sparticuz/chromium`** (exact pin) behind
  `ASSESSMENT_RUNTIME_BROWSER=serverless`; `playwright-core` is the direct
  dep, `playwright` lib removed (`playwright:install` still works via
  `@playwright/test` for local dev/e2e).
- **Poolers:** no code change — `prepare: false` was already set.
- **Not live-verified here** (needs a real deployment): sparticuz launch on
  Vercel infra, isomorphic-git force-push with an installation token, Cron
  end-to-end. The checklist above covers each.2
