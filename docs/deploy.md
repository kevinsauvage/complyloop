# Deploying ComplyLoop

ComplyLoop stores app state either as JSON or in Postgres. Git clones still use
the local filesystem under `$DATA_DIR`.

| Path / env | Purpose |
|------------|---------|
| `$DATA_DIR/db.json` | App state when `DATABASE_URL` is unset |
| `DATABASE_URL` | Postgres (Drizzle) for frameworks → evidence, orgs, encrypted GitHub tokens, webhook delivery ids |
| `$DATA_DIR/workspaces/` | Git/GitHub clones assessed in place |
| `$DATA_DIR/github-tokens.json` | Encrypted tokens when `DATABASE_URL` is unset (laptop fallback) |
| `$DATA_DIR/webhook-deliveries.json` | Delivery idempotency when `DATABASE_URL` is unset |

**Ephemeral serverless disks alone are not enough for clones** — workspaces need
durable disk (or a later remote/ephemeral clone strategy). With `DATABASE_URL`,
app state, tokens, and webhook idempotency do **not** need a shared volume.

## Supported shapes

### 1. Postgres for app state (recommended beyond the laptop)

1. Provision Postgres 16+ and set `DATABASE_URL`.
2. Apply schema: `npm run db:migrate`
3. Keep a volume (or other durable disk) for `DATA_DIR` workspaces (clones), **or**
   accept that GitHub connect needs disk for clones until that gap is closed.

Local example:

```bash
docker compose up -d
export DATABASE_URL=postgres://complyloop:complyloop@localhost:5432/complyloop
npm run db:migrate
npm run dev
```

Evidence rows are **insert-only** in Postgres (never updated or deleted by the app).

### 2. Persistent disk + JSON store

Omit `DATABASE_URL`. Run a long-lived Node process with a mounted volume:

```bash
DATA_DIR=/data
AUTH_SECRET=...
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
AUTH_URL=https://complyloop.example.com
GITHUB_WEBHOOK_SECRET=...
```

### 3. Laptop demo

Default: no `DATABASE_URL`, `DATA_DIR` unset → `.data/`. Fine for development.

## Auth notes

OAuth scopes today: `read:user user:email repo`. Prefer a GitHub App with tighter
permissions for multi-user use. Sign-out clears stored encrypted tokens.
`AUTH_URL` is required when serving production with GitHub auth configured.

## What not to do

- Deploy only to Vercel serverless without Postgres **and** without durable disk for clones.
- Share a host without `AUTH_SECRET`.
- Commit `.data/` or token files to git.
- `UPDATE`/`DELETE` evidence rows outside the app’s append-only contract.

## Checklist before inviting real users

1. `DATABASE_URL` + migrated schema (or durable `DATA_DIR` JSON).
2. Durable disk for workspaces/clones (or a follow-up remote clone strategy).
3. Stable `AUTH_SECRET` and `AUTH_URL`.
4. GitHub OAuth + webhook secret.
5. Backups for Postgres (and `DATA_DIR` if used for JSON/clones).
6. Invite teammates from **Organization** (`/org`) — switch to the shared org first if you use team orgs.
