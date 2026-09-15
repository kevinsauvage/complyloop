# Deploying ComplyLoop on Vercel

Single topology: the Next.js app (web + API) runs on Vercel; Vercel Cron
drives assessments; Postgres runs on Neon or Supabase. There is no worker
process, no Docker image, and no `git` CLI anywhere — checkouts use pure-JS
git (isomorphic-git) and preview audits use a serverless Chromium build
(`@sparticuz/chromium`).

## How it runs

| Concern | Behavior |
|---|---|
| **Web/API** | Vercel Fluid functions, `next build` with zero config |
| **Jobs** | Queued in Postgres; Vercel Cron hits `POST /api/internal/jobs/run?limit=2` every 2 min (`vercel.json`); 3 attempts with backoff, serial per project, 30-min lease renewed by a 5-min heartbeat |
| **Checkouts** | Ephemeral isomorphic-git shallow clone per job into `/tmp`; deleted after |
| **Browsers** | `@sparticuz/chromium` (pinned) when `ASSESSMENT_RUNTIME_BROWSER=serverless`; locally installed Playwright browser otherwise |
| **State** | Postgres only; evidence append-only (`prepare: false` is already set, so pooled/transaction-mode connections work) |
| **Backups** | Postgres provider point-in-time (no app-side dump) |

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

## 2. Cron (the assessment worker)

`vercel.json` (committed) schedules `POST /api/internal/jobs/run?limit=2`
every 2 minutes. Authentication: Vercel Cron automatically sends
`Authorization: Bearer <CRON_SECRET>`; the route compares it constant-time
against `WORKER_SECRET` (`worker-auth.ts`) — so **set `WORKER_SECRET` to the
same value as `CRON_SECRET`** (≥16 chars, production only).

The route runs with `maxDuration = 300` (Hobby caps at 300; Pro up to 800).
Batches stay small (`limit=2`) so a slow clone/scan fits. Expired rate-limit
buckets prune once per batch (`runAssessmentJobBatch`).

If the queue ever grows instead of draining, Cron stopped firing or started
failing — alert on `assessmentJobs` queue depth (see `ops:check` below) and
check the Vercel Cron logs.

## 3. Environment variables (Vercel dashboard)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL with `sslmode=require` |
| `AUTH_SECRET` | `openssl rand -base64 32` (stable — rotation also re-encrypts stored tokens) |
| `AUTH_URL` | `https://<vercel-app>` (**required** in production) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub App OAuth client |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` | Installation-token repo access |
| `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET` | Install link + webhook verification |
| `WORKER_SECRET` | Same value as `CRON_SECRET` |
| `CRON_SECRET` | Vercel Cron secret (≥16 chars) |
| `ASSESSMENT_RUNTIME_BROWSER` | `serverless` (Vercel) — unset locally |
| `ASSESSMENT_MAX_CHECKOUT_BYTES` | `100000000` (100 MB — `/tmp` caps at ~500 MB) |
| `ASSESSMENT_MAX_CHECKOUT_FILES` | `10000` |
| `ASSESSMENT_MAX_RUNTIME_PAGES` | `10` (fewer pages per serverless run) |
| `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`) | Required by `ops:check` in production |
| `COMPLYLOOP_SUPPORT_EMAIL` | Shown on the Organization page |
| `AI_GATEWAY_API_KEY` | Optional — AI explanations/patches |

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
(`scan-error.ts`), same as a missing local browser.

## 5. Monitoring

- `GET /api/health` → `200` with queue depth, `503` when Postgres is down.
  Use it as the Vercel/dead-man check.
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
- [ ] All env vars set, `WORKER_SECRET` == `CRON_SECRET`, no placeholders
- [ ] Cron job created and firing (Vercel dashboard → Cron)
- [ ] Sign in → connect a repo → run assessment → results appear
- [ ] Assessment of a real repo exercises the isomorphic-git clone path
- [ ] Preview audit works with `ASSESSMENT_RUNTIME_BROWSER=serverless`
      (or the setting is consciously left unset → AST-only, `unable_to_verify`)
- [ ] Push a commit → webhook re-assessment enqueues (job history shows it)
- [ ] Create a draft PR from a finding → branch pushed, PR opened
- [ ] Cancel a queued/running job → status `cancelled`, nothing persisted
- [ ] `/api/health` returns 200; Sentry receives a test issue
- [ ] Provider DB backups enabled; restore drilled once to staging (record date
      + owner here when done: ___)

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
  end-to-end. The checklist above covers each.
