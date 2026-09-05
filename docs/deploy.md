# Deploying ComplyLoop

Production checklist and reference. **App overview:** [`README.md`](../README.md).

## Before you go live

- [ ] `DATABASE_URL` set; migrations applied via the dedicated deploy step ([Migrations](#migrations-at-deploy-time))
- [ ] Stable `AUTH_SECRET` and `AUTH_URL`
- [ ] GitHub App credentials + webhook secret
- [ ] At least one `npm run worker` process
- [ ] `SENTRY_DSN` + alerts wired
- [ ] Load balancer → `GET /api/health`
- [ ] Postgres backup tested (restore once to staging)
- [ ] Teammates invited from `/org`

---

## How it runs

| Concern | Behavior |
| --- | --- |
| **State** | Postgres only — no durable repo workspace on disk |
| **Clones** | Shallow temp checkout per job; deleted after |
| **Jobs** | Queued in DB; worker leases (30 min), 3 attempts total with backoff, serial per project |
| **Webhooks** | Acknowledge after enqueue — no long HTTP hold for clone/Playwright |
| **Write lock** | Job claim uses `FOR UPDATE SKIP LOCKED` so workers can dequeue in parallel across projects (still one running assessment per project). Rate limits use per-key named locks. Interactive writes and assessment apply acquire a per-project advisory lock during persist. |

Webhooks never clone. Clone or scan failures happen in the worker and end as `assessment_job_failed` evidence after the last attempt.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Yes** | Postgres (Drizzle) |
| `AUTH_SECRET` | **Yes** (prod) | Sessions + token encryption. Production refuses known placeholders (`replace-me`, `e2e-secret-change-me`). |
| `AUTH_URL` | **Yes** (prod) | Auth.js public URL |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` | **Yes** (prod) | Repo access via installation tokens |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | **Yes** | App OAuth client |
| `GITHUB_WEBHOOK_SECRET` | Recommended | Webhook verification |
| `GITHUB_APP_SLUG` | Recommended | Install link in connect UI |
| `SENTRY_DSN` | **Yes** (staging/prod) | Error capture |
| `WORKER_SECRET` | If using HTTP worker trigger | Bearer for `POST /api/internal/jobs/run` |
| `WORKER_POLL_MS` | No | Worker poll interval (default 5000) |
| `ASSESSMENT_MAX_CHECKOUT_BYTES` | No | Clone size cap (default 500 MB) |
| `ASSESSMENT_MAX_CHECKOUT_FILES` | No | Clone file cap (default 50,000) |
| `ASSESSMENT_MAX_RUNTIME_PAGES` | No | Runtime audit page quota (default 25) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Browser Sentry |
| `SENTRY_TRACES_SAMPLE_RATE` | No | 0–1, default 0.05 in production |
| `AI_GATEWAY_API_KEY` | No | Enables AI explanations / suggestions / patches (Vercel AI Gateway) |
| `GITHUB_API_BASE_URL` | No | GitHub REST base override (GHES, or the e2e fixture API) |
| `COMPLYLOOP_SUPPORT_EMAIL` | No | Support contact shown on the Organization page |
| `COMPLYLOOP_BACKUP_DIR` | For `ops:backup` | Destination for `scripts/backup-postgres.sh` |
| `DATABASE_SSL_INSECURE` | Dev only | Skip TLS verify for some hosted Postgres |
| `E2E_AUTH_ENABLED` / `E2E_FIXTURE_ROOT` / `E2E_AUTH_SECRET` / `E2E_GITHUB_TOKEN` | CI/local e2e only | Playwright harness — never on customer deploys |

---

## Postgres

### Local

```bash
docker compose up -d    # port 5433 (avoids local 5432 conflicts)
export DATABASE_URL=postgres://complyloop:complyloop@localhost:5433/complyloop
npm run db:migrate
npm run dev
```

With `sslmode=require`, TLS is verified by default. For hosts with a private CA (e.g. Aiven), use `DATABASE_SSL_INSECURE=true` in dev only — not in prod without understanding MITM risk.

### Migrations at deploy time

Migrations never run from the app container's start command — with more than
one replica, simultaneous starts race and can corrupt a deploy. They run as a
**separate deploy step, before any app replica starts**.

**Docker Compose** runs them automatically via the one-shot `migrate` service;
`app` replicas start only after it succeeds:

```bash
docker compose --profile app up -d --build
```

Behind the scenes compose interleaves as: `postgres` (healthy) → `migrate`
(run once, exit 0) → `app` replicas start. To re-run migrations against a
running stack without a full up:

```bash
docker compose --profile app run --rm migrate
```

**Other orchestrators** (K8s Job, ECS one-off task, CI deploy step) run the
same command directly, then start replicas:

```bash
npx tsx scripts/db-migrate.ts   # already pinned in docker-compose migrate
```

`scripts/db-migrate.ts` is hardened for concurrency as a safety net: it takes a
Postgres advisory lock, so even an overlapping run (deploy step colliding with
the next deploy) serializes instead of double-applying. Local and staging still
use the same `npm run db:migrate`.

### Evidence is append-only

The DB trigger rejects `UPDATE`/`DELETE` on evidence. Proof tests:

```bash
npm run test -- packages/db/src/constraints.test.ts packages/db/src/evidence-append-only.test.ts
```

**Table growth is unbounded** — there is no compaction job. The append-only
trigger means pruning is a superuser-level migration, not app code. Keep
decision records (`requirement_exception_*`, `requirement_human_*`,
`remediation_*`, `finding` dismissals) forever if you ever prune; only noise
kinds (`assessment_completed`, `assessment_job`, `monitoring_changes_detected`)
are candidates.

JSON and HTML/markdown exports take the newest
`EVIDENCE_EXPORT_LIMIT` (5000) rows and set `truncated` / `evidenceTotal`
on the JSON payload. The evidence page paginates. Operational guidance:

- Alert on table size (`pg_total_relation_size('evidence')`) alongside the
  `/api/health` queue-depth signal.

### Reset (local / pre-launch only)

```bash
npm run db:reset -- --confirm
```

Then sign out, clear cookies, sign in again.

### Full stack via Docker

```bash
export AUTH_SECRET="$(openssl rand -base64 32)"
docker compose --profile app up -d --build     # runs migrate one-shot, then app
curl -sS http://localhost:3000/api/health
```

Compose has no default `AUTH_SECRET`. Copy-pasting `replace-me` or `e2e-secret-change-me` into production env will fail boot.

### Health check

`GET /api/health`:

- `200` — `{ status: "ok", database: "up", assessmentJobs: <queued+running>, latencyMs }`
- `503` — `{ status: "unavailable", database: "down", error, latencyMs }`

Use for readiness probes. `assessmentJobs` is a cheap queue-depth signal for alerting (`COUNT(*)` of queued and running jobs).

### Backup & restore

**Backup:**

```bash
pg_dump "$DATABASE_URL" --format=custom --file="complyloop-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

**Restore** (destructive — staging first):

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" complyloop-YYYYMMDDTHHMMSSZ.dump
npm run db:migrate
```

Schedule daily dumps; keep an off-host copy. After restore: hit `/api/health`, sign in once.

---

## Workers

```bash
npm run worker
```

Docker Compose already ships a `worker` service (`profiles: ["app"]`), so
`docker compose --profile app up` runs one worker alongside the app — the
default for single-node deploys. Other orchestrators run `npm run worker`
as a separate process.

Or HTTP trigger (scheduler):

```bash
curl -X POST -H "Authorization: Bearer $WORKER_SECRET" \
  "https://app.example.com/api/internal/jobs/run?limit=10"
```

Leases last 30 minutes; crashed workers are retried. Alert on `assessment_job_failed` evidence and growing job queues. Idle ticks prune expired Postgres rate-limit buckets.

**Ops helpers:**

```bash
npm run ops:check    # DB + prod config sanity
npm run ops:backup   # needs COMPLYLOOP_BACKUP_DIR + pg_dump on host
```

---

## GitHub auth

**Production:** GitHub App (`GITHUB_APP_ID` + private key). OAuth client = App credentials. Installation tokens scope to selected repos — not account-wide `repo`.

**Local demo:** OAuth can use `read:user user:email repo` without App credentials.

Sign-out clears encrypted tokens. OAuth tokens stay server-side (not in JWT).

---

## Monitoring

With `SENTRY_DSN`, alert on:

- Unhandled exceptions / `reportError`
- `assessment_job_failed` / `assessment_job_retrying` (worker), `github_check_run_failed`, `github_token_missing`
- Growing `assessmentJobs` on `/api/health`, and assessment failures after deploy

Do not alert on `health_database_down` — the health probe reports it as a warning so uptime checks cannot flood error alerts.

Structured JSON logs go to stdout. Postgres-backed rate limits apply across app instances; keep a WAF at the edge too. The worker prunes expired buckets on idle ticks.

---

## Playwright e2e (CI / local only)

```bash
docker compose up -d
npm run db:migrate
npm run playwright:install
npm run test:e2e
```

Uses `E2E_AUTH_ENABLED=1` + `E2E_FIXTURE_ROOT`. **Never on customer deploys.**

---

## Do not

- Run without `DATABASE_URL`
- Share a host without `AUTH_SECRET`, or set `AUTH_SECRET` to a known placeholder (`replace-me`, `e2e-secret-change-me`)
- Commit `.data/` or token files
- `UPDATE`/`DELETE` evidence (DB rejects it)
- Enable `E2E_AUTH_ENABLED` outside CI/local e2e
- Run staging/prod without `SENTRY_DSN` and a tested restore
