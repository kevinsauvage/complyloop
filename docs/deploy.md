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
| **Jobs** | Queued in DB; worker leases, retries ×3, serial per project |
| **Webhooks** | Acknowledge after enqueue — no long HTTP hold for clone/Playwright |

Webhooks that cannot clone return `handled: false` (`code: webhook_clone_failed`) without crashing the process.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Yes** | Postgres (Drizzle) |
| `AUTH_SECRET` | **Yes** (prod) | Sessions + token encryption |
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
| `DATABASE_SSL_INSECURE` | Dev only | Skip TLS verify for some hosted Postgres |

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
npm run test -- src/server/db-store/constraints.test.ts src/server/db-store/evidence-append-only.test.ts
```

### Reset (local / pre-launch only)

```bash
npm run db:reset -- --confirm
```

Then sign out, clear cookies, sign in again.

### Full stack via Docker

```bash
export AUTH_SECRET=replace-me
docker compose --profile app up -d --build     # runs migrate one-shot, then app
curl -sS http://localhost:3000/api/health
```

### Health check

`GET /api/health`:

- `200` — `{ status: "ok", database: "up" }`
- `503` — database unreachable

Use for readiness probes.

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

Or HTTP trigger (scheduler):

```bash
curl -X POST -H "Authorization: Bearer $WORKER_SECRET" \
  "https://app.example.com/api/internal/jobs/run?limit=10"
```

Leases last 30 minutes; crashed workers are retried. Alert on `assessment_job_failed` evidence and growing job queues.

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
- Webhooks: `workspace_missing`, repeated `webhook_clone_failed`
- Assessment failures after deploy

Structured JSON logs go to stdout. Postgres-backed rate limits apply across app instances; keep a WAF at the edge too.

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
- Share a host without `AUTH_SECRET`
- Commit `.data/` or token files
- `UPDATE`/`DELETE` evidence (DB rejects it)
- Enable `E2E_AUTH_ENABLED` outside CI/local e2e
- Run staging/prod without `SENTRY_DSN` and a tested restore
