# Deploying ComplyLoop on Vercel

Single topology: the Next.js app (web + API) runs on Vercel; assessments
execute on GitHub Actions runners (same Playwright Chromium family as local
dev — no serverless browser drift); Postgres runs on Neon or Supabase.
There is no worker process to operate, no Docker image, and no `git` CLI
anywhere — checkouts use pure-JS git (isomorphic-git).

## How it runs

| Concern       | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web/API**   | Vercel Fluid functions, `next build` with zero config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Jobs**      | Manual and webhook runs enqueue in Postgres (`enqueueAssessmentJob`). Trigger sites schedule a drain in `after()`: the GitHub Actions `assessment-worker` workflow (`.github/workflows/assessment-worker.yml`) executes the batch with Playwright Chromium — immediately via `repository_dispatch` (`assessment-drain`), every 15 min on schedule as the orphan/expired-lease backstop, or manually via `workflow_dispatch`. Unconfigured/failed dispatch falls back to self-fetching the single-scan worker route (`POST /api/internal/jobs/run?limit=1`, Vercel browser stack, degraded path). Serial per project in the queue, 3 attempts with backoff, 30-min lease renewed by a 5-min heartbeat |
| **Checkouts** | Ephemeral isomorphic-git shallow clone per job into `/tmp`; deleted after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Browsers**  | Playwright Chromium (`npx playwright install chromium`, lockfile-pinned so CI matches local dev); `@sparticuz/chromium` behind `ASSESSMENT_RUNTIME_BROWSER=serverless` remains only for the degraded Vercel worker-route path                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **State**     | Postgres only; evidence append-only (`prepare: false` is already set, so pooled/transaction-mode connections work)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Backups**   | Postgres provider point-in-time (no app-side dump)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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

## 2. Worker (GitHub Actions executor)

`npm run worker:drain` builds the executor (`scripts/build-worker.mjs` →
`dist/worker/assessment-worker-drain.cjs`, gitignored) and runs it with
plain Node. The bundle exists so probe sources reach the page exactly as
authored: tsx compiles with esbuild keepNames, whose `__name()` wrappers
have no definition in-page (`ReferenceError`, every probe dies), while
SWC/webpack stacks never emit them — hence the divergence. The build uses
`keepNames: false` and fails loudly if `__name(` ever appears in the
output; workspace-external native deps (`playwright-core`, `typescript`,
`@sentry/*`, `isomorphic-git`) resolve from `node_modules` because they
depend on `__dirname`/self-`require()` at runtime. It claims and runs queued jobs until idle
or `ASSESSMENT_WORKER_LIMIT` attempts (`ASSESSMENT_WORKER_CONCURRENCY`
bounds the in-process pool; per-project claims serialize concurrent jobs).
It exits non-zero only when the batch itself crashes (DB down, missing env)
— per-job failures and retries are recorded in Postgres, so the workflow run
reflects infra health, not assessment outcomes.

Triggers (`assessment-worker.yml`): `repository_dispatch` (`assessment-drain`,
fired from the app in `after()` on every enqueue so scans start immediately),
schedule every 15 min (orphan/expired-lease backstop), `workflow_dispatch`
(operator drain button, with `limit`/`concurrency` inputs). One runner drains
the whole batch; `concurrency: group: assessment-worker,
cancel-in-progress: false` keeps ticks serial. Job `timeout-minutes: 60`
caps a hung runner so it cannot burn the free-minutes budget (Free private:
2,000 Linux min/mo).

The dispatch needs a fine-grained PAT with Actions write on the app repo:
`GH_WORKER_DISPATCH_TOKEN` on Vercel; the target repo resolves from
`APP_REPO_FULL_NAME` (`owner/repo`) or Vercel's `VERCEL_GIT_REPO_OWNER` /
`VERCEL_GIT_REPO_SLUG`. The worker itself needs repo secrets `DATABASE_URL`
(pooled Postgres) plus `COMPLYLOOP_APP_ID` / `COMPLYLOOP_APP_PRIVATE_KEY`
— same values as Vercel's `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`
(the `GITHUB_` prefix is reserved in Actions, so the workflow maps them).
When the token is missing or GitHub rejects the
event, the app falls back to self-fetching the single-scan worker route
(`POST /api/internal/jobs/run?limit=1`, `WORKER_SECRET` Bearer) — same scan
on the Vercel browser stack, kept only as a degraded path (verdicts may
diverge per stack; a warning with code `assessment_worker_dispatch_failed`
marks those runs in the logs).

The old curl sweep (`assessment-sweep.yml`, retired) hit the Vercel route
every 5 min; restore it from git history if the GH executor ever needs a
Vercel-side backstop again. There is no Vercel Cron — Hobby plans only allow
daily schedules.

Authentication for the Vercel route: the self-fetch sends
`Authorization: Bearer <WORKER_SECRET>`; the route compares it constant-time
(`worker-auth.ts`). Set a single `WORKER_SECRET` (≥16 chars, production
only) — no `CRON_SECRET` coupling.

The route runs with `maxDuration = 300` (Hobby caps at 300; Pro up to 800).
The GH worker drains with `limit=10&concurrency=2` (inputs on
`workflow_dispatch`) to clear backlogs in a few ticks. Expired rate-limit
buckets prune once per batch (`runAssessmentJobBatch`).

If the queue ever grows instead of draining, both the dispatch and the
15-min schedule stopped firing or started failing — alert on
`assessmentJobs` queue depth (see `ops:check` below) and check the Vercel
function logs (filter `[event]` for `assessment_worker_dispatch_failed`
and `assessment_opportunistic_drain_failed`) plus the Actions run logs.

## 3. Environment variables (Vercel dashboard)

| Variable                                      | Value                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Pooled Postgres URL with `sslmode=require`                                                                                                                                                     |
| `AUTH_SECRET`                                 | `openssl rand -base64 32` (stable — rotation invalidates sessions AND stored GitHub tokens, reconnect required)                                                                   |
| `AUTH_URL`                                    | `https://<vercel-app>` (**required** in production)                                                                                                                                            |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`       | GitHub App OAuth client                                                                                                                                                                        |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`    | Installation-token repo access                                                                                                                                                                 |
| `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET`   | Install link + webhook verification                                                                                                                                                            |
| `WORKER_SECRET`                               | Bearer for the worker-route fallback (self-fetch secret, ≥16 chars)                                                                                                                            |
| `GH_WORKER_DISPATCH_TOKEN`                    | Fine-grained PAT (Actions write on the app repo) so the app can fire `repository_dispatch`; target repo from `APP_REPO_FULL_NAME` or Vercel's `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG` |
| `APP_REPO_FULL_NAME`                          | `owner/repo` of the app repo (dispatch target fallback)                                                                                                                                        |
| `ASSESSMENT_RUNTIME_BROWSER`                  | `serverless` (Vercel) — unset locally                                                                                                                                                          |
| `ASSESSMENT_MAX_CHECKOUT_BYTES`               | `100000000` (100 MB — `/tmp` caps at ~500 MB)                                                                                                                                                  |
| `ASSESSMENT_MAX_CHECKOUT_FILES`               | `10000`                                                                                                                                                                                        |
| `ASSESSMENT_MAX_RUNTIME_PAGES`                | `10` (fewer pages per serverless run)                                                                                                                                                          |
| `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`)     | Required by `ops:check` in production                                                                                                                                                          |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | Private preview gate (Basic Auth on every page; unset = open). Set both on the deployed project until public launch                                                                            |
| `COMPLYLOOP_SUPPORT_EMAIL`                    | Shown on the Organization page                                                                                                                                                                 |
| `AI_GATEWAY_API_KEY`                          | Optional — AI explanations/patches                                                                                                                                                             |

**Never set:** `E2E_*` (the harness swaps real checkouts for fixtures and skips
prod GitHub enforcement), `DATABASE_SSL_INSECURE`.

GitHub App settings: callback
`https://<vercel-app>/api/auth/callback/github`, webhook
`https://<vercel-app>/api/github/webhook` (events `push`, `pull_request`).

## 4. Runtime audits on Vercel

Set `ASSESSMENT_RUNTIME_BROWSER=serverless`. `@sparticuz/chromium` is pinned
exact (`153.0.0`, matching the local Playwright Chromium major — that
package versions by Chromium major and may break at
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
  enqueue to claim. A `worker_unauthorized` line means the fallback
  self-fetch bearer ≠ `WORKER_SECRET`, so fallback ticks never drain the
  queue (the GH worker is unaffected — it needs no bearer).
- `npm run ops:check` (from any machine with `DATABASE_URL`) verifies DB +
  prod env (`AUTH_SECRET`, `AUTH_URL`, `GITHUB_APP_ID`/`GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_WEBHOOK_SECRET`, `WORKER_SECRET`, `SENTRY_DSN`) + queue depth +
  evidence size. It exits non-zero on any breach so it gates deploys and
  alerts. Thresholds via env (defaults are starting values — tighten after
  the first prod signals):
  | Variable | Default | Meaning |
  | -------- | ------- | ------- |
  | `OPS_MAX_QUEUED_JOBS` | `50` | Fail when queued+running jobs exceed this (drain stopped keeping up). |
  | `OPS_MAX_EVIDENCE_MB` | `1024` | Fail when `pg_total_relation_size('evidence')` exceeds this. |
  Run it on a schedule with failure alerting — the `ops-check` GitHub
  Actions workflow (`.github/workflows/ops-check.yml`, daily 06:00 UTC +
  manual dispatch) is that schedule; a red run means the 15-min
  `assessment-worker` drain stopped firing/failing or evidence is outgrowing
  the database. `/api/health` intentionally stays light (queue depth only):
  it is an unauthenticated scrape target, so the heavy size query lives in
  `ops:check`, not on the health path.
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

### What "delete" keeps

| Action          | Findings / remediations / requirements                                                                              | Evidence                                                                | GitHub tokens                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Disconnect repo | Dropped with the project (FK cascade); only the `project_disconnected` row survives. Returning clients start fresh. | Retained (FK-less by design)                                            | Untouched (per-user scope)                                                                                                      |
| Delete project  | Dropped with the project                                                                                            | Retained                                                                | Untouched                                                                                                                       |
| Delete org      | Dropped with the org's projects                                                                                     | Retained — the UI toast says "Evidence history was retained for audit." | **Survive by design**: `github_tokens` rows are per-user with no org/project FK, so they stay usable for the user's other orgs. |

In short: evidence is forever (until a superuser prune); project-scoped compliance state follows the project; tokens follow the user.

## Pre-launch checklist

- [ ] Remote Postgres reachable; `db:migrate` applied from local machine
- [ ] All env vars set, `WORKER_SECRET` (≥16 chars) configured, no placeholders
- [ ] Basic Auth credentials set (private preview); remove them at public launch
- [ ] Worker workflow firing (Actions tab: dispatch on enqueue + every-15-min schedule) + `DATABASE_URL` / `COMPLYLOOP_APP_ID` / `COMPLYLOOP_APP_PRIVATE_KEY` repo secrets set + `GH_WORKER_DISPATCH_TOKEN` on Vercel
- [ ] Sign in → connect a repo → run assessment → results appear
- [ ] Assessment of a real repo exercises the isomorphic-git clone path
- [ ] Preview audit works with `ASSESSMENT_RUNTIME_BROWSER=serverless`
      (or the setting is consciously left unset → AST-only, `unable_to_verify`)
- [ ] Push a commit → webhook re-assessment enqueues (job history shows it)
- [ ] Create a draft PR from a finding → branch pushed, PR opened
- [ ] Cancel a queued/running job → status `cancelled`, nothing persisted
- [ ] `/api/health` returns 200; Sentry receives a test issue
- [ ] Provider DB backups enabled; restore drilled once to staging.
      Drill runbook (point-in-time, provider console — no app-side dump exists):
  1. create a staging branch/restore target at a recent timestamp;
  2. point a staging deploy at it (`DATABASE_URL` override);
  3. sign in, open dashboard + one finding, run `ops:check` against it;
  4. record date + owner here when done: \_\_\_ (pending — not yet drilled).
