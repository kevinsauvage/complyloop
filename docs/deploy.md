# Deploying ComplyLoop

ComplyLoop stores app state either as JSON or in Postgres. Clones and token
files still use the local filesystem under `$DATA_DIR`.

| Path / env | Purpose |
|------------|---------|
| `$DATA_DIR/db.json` | App state when `DATABASE_URL` is unset |
| `DATABASE_URL` | Postgres (Drizzle) for frameworks → evidence when set |
| `$DATA_DIR/workspaces/` | Git/GitHub clones assessed in place |
| `$DATA_DIR/github-tokens.json` | Encrypted GitHub OAuth tokens |
| `$DATA_DIR/webhook-deliveries.json` | Webhook delivery idempotency |

**Ephemeral serverless disks alone are not enough** — clones and token files need
durable disk (or you move those later). App state can live in managed Postgres
(Neon, Supabase, RDS, etc.).

## Supported shapes

### 1. Postgres for app state (recommended beyond the laptop)

1. Provision Postgres 16+ and set `DATABASE_URL`.
2. Apply schema: `npm run db:migrate`
3. Keep a volume (or other durable disk) for `DATA_DIR` workspaces + tokens, **or**
   accept that GitHub connect/webhooks need disk separately.

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

- Deploy only to Vercel serverless without Postgres **and** without durable disk for clones/tokens.
- Share a host without `AUTH_SECRET`.
- Commit `.data/` or token files to git.
- `UPDATE`/`DELETE` evidence rows outside the app’s append-only contract.

## Checklist before inviting real users

1. `DATABASE_URL` + migrated schema (or durable `DATA_DIR` JSON).
2. Durable disk for workspaces/tokens (or a follow-up to remove that need).
3. Stable `AUTH_SECRET` and `AUTH_URL`.
4. GitHub OAuth + webhook secret.
5. Backups for Postgres (and `DATA_DIR` if used).
6. Invite teammates from **Organization** (`/org`) once GitHub auth is live.
