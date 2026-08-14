# Deploying ComplyLoop

ComplyLoop stores all app state in Postgres (`DATABASE_URL`). Source trees are
**ephemeral**: each assess / webhook / remediation / PR job shallow-clones into
a temp directory, works, then deletes the tree. No durable workspace volume.

## Hard launch constraint

1. **`DATABASE_URL` is required** — apply schema with `npm run db:migrate`.
2. Instances need enough **local disk + git** for temporary clones (OS temp).
   Jobs run in-process on the request/webhook handler (no separate worker yet).
3. Multi-instance is fine for app state (Postgres). Concurrent clones of the
   same repo may hit GitHub rate limits — monitor as you scale.

If a webhook cannot clone, the handler returns `handled: false` with a clear
message (`code: webhook_clone_failed`) — it does not crash the process.

| Path / env | Purpose |
|------------|---------|
| `DATABASE_URL` | Postgres (Drizzle) — frameworks → evidence, orgs, encrypted GitHub tokens, webhook delivery ids |
| `SENTRY_DSN` | **Required for staging/prod** — server/edge error capture via `@sentry/nextjs` |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional — same DSN for browser errors and App Router error boundaries |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional — default `0.05` when `NODE_ENV=production` and DSN is set |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Optional build-time — upload source maps on `next build` |

## Supported shape

### Postgres (required)

1. Provision Postgres 16+ and set `DATABASE_URL`.
   With `sslmode=require`, TLS certificates are verified by default. Aiven and
   similar hosts use a private CA — for local/dev set `DATABASE_SSL_INSECURE=true`
   until a CA/`sslrootcert` path is configured. Never leave that flag on in
   production without understanding the MITM risk.
2. Apply schema: `npm run db:migrate`

Local example:

```bash
docker compose up -d
export DATABASE_URL=postgres://complyloop:complyloop@localhost:5433/complyloop
npm run db:migrate
npm run dev
```

**Wipe all data (pre-launch / local only):**

```bash
npm run db:reset -- --confirm
```

Then sign out, clear `localhost` cookies for the app, and sign in again so Auth.js
mints a fresh session keyed by your stable GitHub account id.


Evidence rows are **insert-only**: the app never updates/deletes them, and
migration `0003_evidence_append_only.sql` adds a trigger that rejects
`UPDATE`/`DELETE` at the database layer. Mutable tenant tables have foreign
keys and status checks (`0005_tenant_constraints.sql`); evidence is
intentionally excluded so history survives project/org deletion. Opt-in proof
when `DATABASE_URL` is set:

```bash
npm run test -- src/server/db-store/constraints.test.ts src/server/db-store/evidence-append-only.test.ts
```

### Full-stack demo (optional compose profile)

```bash
export AUTH_SECRET=replace-me
docker compose --profile app up -d --build
curl -sS http://localhost:3000/api/health
```

The `app` service migrates on start and exposes `/api/health`.

### Health check

`GET /api/health` returns:

- `200` `{ status: "ok", database: "up" }` when Postgres answers `SELECT 1`
- `503` `{ status: "unavailable", database: "down" }` when the DB is unreachable

Point your load balancer or orchestrator readiness probe at this path.

### Postgres backup and restore

Practice restore once before inviting paying orgs.

**Backup** (logical dump):

```bash
pg_dump "$DATABASE_URL" --format=custom --file="complyloop-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

**Restore** into an empty database (destructive — use a staging DB first):

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" complyloop-YYYYMMDDTHHMMSSZ.dump
npm run db:migrate   # apply any migrations newer than the dump
```

Schedule daily dumps (or use your host’s PITR). Keep at least one off-host copy.
After restore, hit `/api/health` and sign in once to confirm Auth + GitHub App env
still match.

## Auth notes

**Production GitHub access must use a GitHub App** (`GITHUB_APP_ID` +
`GITHUB_APP_PRIVATE_KEY`). Set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` to the
App’s OAuth client credentials. Users install the App on selected repositories;
clone / PR / Checks use short-lived installation tokens — never the classic
`repo` scope over a whole account.

Laptop demo without App credentials still requests `read:user user:email repo`.

Sign-out clears stored encrypted user tokens. OAuth access tokens are stored
server-side only (not in the session JWT). `AUTH_SECRET` is required in
production (the app refuses the known dev-only fallback). `AUTH_URL` is required
when serving production with GitHub auth configured.

Projects are **GitHub-only**. Connect via the repository picker after Sign in
with GitHub (admin/owner role in the active organization).

## Monitoring

With `SENTRY_DSN` set, server errors are reported via `@sentry/nextjs`. Configure
alerts (email/Slack/Pager) for at least:

- Unhandled exceptions / `reportError` events
- Webhook outcomes with `workspace_missing` or repeated `webhook_clone_failed`
- Assessment action failures after deploy

Structured JSON logs always emit on stdout for aggregation.

Application rate limits (connect / assess / AI) are in-process and reset on
restart — fine for a single-instance pilot; put a WAF or edge limit in front
before multi-tenant scale.

## Playwright e2e (CI / local)

Browser tests use a gated harness (`E2E_AUTH_ENABLED=1` + `E2E_FIXTURE_ROOT`).
Sessions are minted as Auth.js JWTs; checkouts copy the local fixture instead of
cloning GitHub. **Never enable these variables on customer-facing deploys.**

```bash
docker compose up -d
npm run db:migrate
npm run playwright:install
npm run test:e2e
```

## What not to do

- Omit `DATABASE_URL` (the app will not start usefully without Postgres).
- Share a host without `AUTH_SECRET`.
- Commit leftover `.data/` or token files to git.
- `UPDATE`/`DELETE` evidence rows (DB trigger will reject; do not bypass as
  the app role).
- Set `E2E_AUTH_ENABLED` / `E2E_FIXTURE_ROOT` outside CI and local Playwright runs.
- Run staging/prod without `SENTRY_DSN` and a tested Postgres restore.


## Checklist before inviting real users

1. `DATABASE_URL` + migrated schema.
2. Stable `AUTH_SECRET` and `AUTH_URL`.
3. GitHub App (`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`) + App OAuth client + webhook secret.
4. Backups for Postgres (restore tested once).
5. `SENTRY_DSN` for error tracking + alerts wired to an on-call channel.
6. Load balancer readiness → `GET /api/health`.
7. Invite teammates from **Organization** (`/org`) — switch to the shared org first if you use team orgs.
