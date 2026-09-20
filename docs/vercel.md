# Deploying ComplyLoop on Vercel

> **TL;DR** — Next.js app on Vercel, Postgres on Neon/Supabase, assessments on
> GitHub Actions. No worker process, no Docker image, no `git` CLI, no Vercel
> Cron. App enqueues jobs → dispatches the `assessment-worker` workflow →
> 15-min schedule backstop.

Single topology: the Next.js app (web + API) runs on Vercel; assessments
execute on GitHub Actions runners (same Playwright Chromium family as local
dev — no serverless browser drift); Postgres runs on Neon or Supabase.
Checkouts use pure-JS git (isomorphic-git).

## How it runs

- **Web/API** — Vercel Fluid functions, `next build` with zero config.
- **Jobs** — Manual and webhook runs enqueue in Postgres
  (`enqueueAssessmentJob`). Trigger sites schedule a drain in `after()`,
  which fires the GitHub Actions `assessment-worker` workflow
  (`.github/workflows/assessment-worker.yml`):
  - `repository_dispatch` (`assessment-drain`) for immediate start,
  - 15-min schedule as the orphan/expired-lease backstop,
  - `workflow_dispatch` for manual operator drains.
  - No second executor: an unconfigured/failed dispatch leaves the job
    `queued` for the schedule.
  - Serial per project, 3 attempts with backoff, 30-min lease renewed by a
    5-min heartbeat.
- **Checkouts** — Ephemeral isomorphic-git shallow clone per job into `/tmp`;
  deleted after.
- **Browsers** — Playwright Chromium (`npx playwright install chromium`,
  lockfile-pinned so CI matches local dev) on the GitHub Actions executor;
  local dev uses its own `playwright:install` browsers.
- **State** — Postgres only; evidence append-only (`prepare: false` is set,
  so pooled/transaction-mode connections work).
- **Backups** — Postgres provider point-in-time (no app-side dump).

## 1. Database

Use Neon or Supabase with a **pooled connection string** (serverless fan-out
exhausts direct connections):

- Neon: the pooled (`-pooler`) hostname.
- Supabase: the pooler URL (transaction mode works — `prepare: false` is set
  in `packages/db/src/postgres.ts`).

Migrations run **on every deploy**: Vercel picks up the `vercel-build` script
(`db:migrate && build`), so the schema is current before the app starts.
For the very first deploy (or a wiped database), run once from your machine:

```bash
DATABASE_URL="<remote-url>" npm run db:migrate
```

## 2. Worker (GitHub Actions executor)

`npm run worker:drain` builds the executor (`scripts/build-worker.mjs` →
`dist/worker/assessment-worker-drain.cjs`, gitignored) and runs it with
plain Node.

Why a bundle: probe sources must reach the page exactly as authored. tsx
compiles with esbuild keepNames, whose `__name()` wrappers have no definition
in-page (`ReferenceError`, every probe dies), while SWC/webpack stacks never
emit them. The build uses `keepNames: false` and fails loudly if `__name(`
ever appears in the output. Workspace-external native deps
(`playwright-core`, `typescript`, `@sentry/*`, `isomorphic-git`) resolve from
`node_modules` (they depend on `__dirname`/self-`require()` at runtime).

Runtime behavior: claims and runs queued jobs until idle or
`ASSESSMENT_WORKER_LIMIT` attempts (`ASSESSMENT_WORKER_CONCURRENCY` bounds
the in-process pool; per-project claims serialize concurrent jobs). It exits
non-zero only when the batch itself crashes (DB down, missing env) —
per-job failures and retries are recorded in Postgres, so the workflow run
reflects infra health, not assessment outcomes.

Triggers (`assessment-worker.yml`):

- `repository_dispatch` (`assessment-drain`, fired from the app in `after()`
  on every enqueue so scans start immediately),
- schedule every 15 min (orphan/expired-lease backstop),
- `workflow_dispatch` (operator drain button, with `limit`/`concurrency` inputs).

One runner drains the whole batch; `concurrency: group: assessment-worker,
cancel-in-progress: false` keeps ticks serial. Job `timeout-minutes: 60`
caps a hung runner so it cannot burn the free-minutes budget (Free private:
2,000 Linux min/mo).

The dispatch needs a fine-grained PAT with Actions write on the app repo:
`GH_WORKER_DISPATCH_TOKEN` on Vercel. The target repo resolves from
`APP_REPO_FULL_NAME` (`owner/repo`) or Vercel's `VERCEL_GIT_REPO_OWNER` /
`VERCEL_GIT_REPO_SLUG`.

The worker itself needs repo secrets `DATABASE_URL` (pooled Postgres) plus
`COMPLYLOOP_APP_ID` / `COMPLYLOOP_APP_PRIVATE_KEY` — same values as Vercel's
`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` (the `GITHUB_` prefix is reserved
in Actions, so the workflow maps them).

A missing/rejected dispatch leaves the job `queued` for the 15-min schedule
(a warning with code `assessment_worker_dispatch_failed` marks those runs in
the logs). A manual re-run re-kicks the worker for any dispatchable queued
job instead of stacking a duplicate scan.

The old curl sweep (`assessment-sweep.yml`, retired) hit a Vercel worker
route every 5 min; it stays retired — the GH executor is the only drain
path. There is no Vercel Cron — Hobby plans only allow daily schedules.

The GH worker drains with `limit=10&concurrency=2` (inputs on
`workflow_dispatch`) to clear backlogs in a few ticks. Expired rate-limit
buckets prune once per batch (`runAssessmentJobBatch`).

**Queue growing?** Both the dispatch and the 15-min schedule stopped firing
or started failing. Alert on `assessmentJobs` queue depth (see `ops:check`
below) and check the Vercel function logs (filter `[event]` for
`assessment_worker_dispatch_failed`) plus the Actions run logs.

## 3. Environment variables (Vercel dashboard)

| Variable                                      | Value                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Pooled Postgres URL with `sslmode=require`                                                                                                                                                     |
| `AUTH_SECRET`                                 | `openssl rand -base64 32` (stable — rotation invalidates sessions AND stored GitHub tokens, reconnect required)                                                                                |
| `AUTH_URL`                                    | `https://<vercel-app>` (**required** in production)                                                                                                                                            |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`       | GitHub App OAuth client                                                                                                                                                                        |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`    | Installation-token repo access                                                                                                                                                                 |
| `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET`   | Install link + webhook verification                                                                                                                                                            |
| `GH_WORKER_DISPATCH_TOKEN`                    | Fine-grained PAT (Actions write on the app repo) so the app can fire `repository_dispatch`; target repo from `APP_REPO_FULL_NAME` or Vercel's `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG` |
| `APP_REPO_FULL_NAME`                          | `owner/repo` of the app repo (dispatch target fallback)                                                                                                                                        |
| `ASSESSMENT_MAX_CHECKOUT_BYTES`               | `524288000` (500 MB — matches the code default; `/tmp` caps at ~500 MB)                                                                                                                        |
| `ASSESSMENT_MAX_CHECKOUT_FILES`               | `50000`                                                                                                                                                                                        |
| `ASSESSMENT_MAX_CHECKOUT_SCAN_MS`             | `30000`                                                                                                                                                                                        |
| `ASSESSMENT_MAX_RUNTIME_PAGES`                | `25`                                                                                                                                                                                           |
| `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`)     | Required by `ops:check` in production                                                                                                                                                          |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | Private preview gate (Basic Auth on every page; unset = open). Set both on the deployed project until public launch                                                                            |
| `COMPLYLOOP_SUPPORT_EMAIL`                    | Shown on the Organization page                                                                                                                                                                 |
| `AI_GATEWAY_API_KEY`                          | Optional — AI explanations/patches                                                                                                                                                             |

**Never set:** `E2E_*` (the harness swaps real checkouts for fixtures and skips
prod GitHub enforcement), `DATABASE_SSL_INSECURE`.

GitHub App settings: callback
`https://<vercel-app>/api/auth/callback/github`, webhook
`https://<vercel-app>/api/github/webhook` (event `push` only; PR feedback
arrives via the merge-push scan).

## 4. Monitoring

- `GET /api/health` → `200` with queue depth, `503` when Postgres is down.
  Use it as the Vercel/dead-man check. A job stuck in `queued` with no
  worker activity shows up here as a growing `assessmentJobs` count.
- Lifecycle events (`[event] assessment job enqueued/claimed/completed`,
  `worker_batch_started/finished`) log to stdout in
  production — filter Vercel logs for `[event]` to trace a stuck job from
  enqueue to claim.
- `npm run ops:check` (from any machine with `DATABASE_URL`) verifies DB +
  prod env (`AUTH_SECRET`, `AUTH_URL`, `GITHUB_APP_ID`/`GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_WEBHOOK_SECRET`, `GH_WORKER_DISPATCH_TOKEN`, `SENTRY_DSN`) + queue depth +
  evidence size. It exits non-zero on any breach so it gates deploys and
  alerts.
  - Thresholds via env (defaults are starting values — tighten after the
    first prod signals):
    | Variable              | Default | Meaning                                                      |
    | --------------------- | ------- | ------------------------------------------------------------ |
    | `OPS_MAX_QUEUED_JOBS` | `50`    | Fail when queued+running jobs exceed this (drain behind).    |
    | `OPS_MAX_EVIDENCE_MB` | `1024`  | Fail when `pg_total_relation_size('evidence')` exceeds this. |
  - Run it on a schedule with failure alerting — the `ops-check` GitHub
    Actions workflow (`.github/workflows/ops-check.yml`, daily 06:00 UTC +
    manual dispatch) is that schedule. A red run means the 15-min
    `assessment-worker` drain stopped firing/failing or evidence is outgrowing
    the database.
  - `/api/health` intentionally stays light (queue depth only): it is an
    unauthenticated scrape target, so the heavy size query lives in
    `ops:check`, not on the health path.
- Sentry: unhandled exceptions, `assessment_job_failed` /
  `assessment_job_retrying`, growing queue depth.

## 5. Evidence retention

The table grows unbounded by design (append-only trigger). Monitor
`pg_total_relation_size('evidence')` alongside queue depth. If you ever prune,
it is a superuser-level migration, not app code: keep decision records
(`requirement_exception_*`, `requirement_human_*`, `remediation_*`, finding
dismissals) forever; only noise kinds (`assessment_completed`,
`assessment_job`, `monitoring_changes_detected`) are candidates. Exports take
the newest 5000 rows and mark `truncated` — that bounds downloads, not the table.

### What "delete" keeps

| Action          | Compliance state (findings, remediations, requirements)                      | Evidence                     | GitHub tokens                                  |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| Disconnect repo | Dropped with the project (FK cascade); only `project_disconnected` survives. | Retained (FK-less by design) | Untouched (per-user)                           |
| Delete project  | Dropped with the project                                                     | Retained                     | Untouched                                      |
| Delete org      | Dropped with the org's projects                                              | Retained (toast confirms it) | Survive — per-user rows with no org/project FK |

In short: evidence is forever (until a superuser prune); project-scoped compliance state follows the project; tokens follow the user.

## Pre-launch checklist

- [ ] Remote Postgres reachable; `db:migrate` applied from local machine
- [ ] All env vars set, `GH_WORKER_DISPATCH_TOKEN` configured, no placeholders
- [ ] Basic Auth credentials set (private preview); remove them at public launch
- [ ] Worker workflow firing (Actions tab: dispatch on enqueue + every-15-min schedule) + `DATABASE_URL` / `COMPLYLOOP_APP_ID` / `COMPLYLOOP_APP_PRIVATE_KEY` repo secrets set + `GH_WORKER_DISPATCH_TOKEN` on Vercel
- [ ] Sign in → connect a repo → run assessment → results appear
- [ ] Assessment of a real repo exercises the isomorphic-git clone path
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
