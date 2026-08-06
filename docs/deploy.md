# Deploying ComplyLoop

ComplyLoop stores app state either as JSON or in Postgres. Git clones still use
the local filesystem under `$DATA_DIR`.

## Hard launch constraint (read this first)

Until clone-per-job / ephemeral workspace support lands:

1. **Run a single long-lived Node instance** (one replica). Do not horizontally
   scale app servers that each have their own empty disk.
2. **Mount durable disk** at `DATA_DIR` for `$DATA_DIR/workspaces/` (git clones).
   Ephemeral serverless disks are unsupported for clones.
3. Prefer `DATABASE_URL` (Postgres) for app state, tokens, and webhook
   idempotency so those do not require a shared volume.

If a webhook fires and the workspace path is missing, the handler returns a
clear `handled: false` message and emits a structured error
(`code: workspace_missing`) — it does not crash the process. Fix by restoring
the volume or re-connecting the repository on that instance.

| Path / env | Purpose |
|------------|---------|
| `$DATA_DIR/db.json` | App state when `DATABASE_URL` is unset |
| `DATABASE_URL` | Postgres (Drizzle) for frameworks → evidence, orgs, encrypted GitHub tokens, webhook delivery ids |
| `$DATA_DIR/workspaces/` | Git/GitHub clones assessed in place |
| `$DATA_DIR/github-tokens.json` | Encrypted tokens when `DATABASE_URL` is unset (laptop fallback) |
| `$DATA_DIR/webhook-deliveries.json` | Delivery idempotency when `DATABASE_URL` is unset |
| `SENTRY_DSN` | Optional — captures server errors via `@sentry/node` |

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

**Production GitHub access must use a GitHub App** (`GITHUB_APP_ID` +
`GITHUB_APP_PRIVATE_KEY`). Set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` to the
App’s OAuth client credentials. Users install the App on selected repositories;
clone / PR / Checks use short-lived installation tokens — never the classic
`repo` scope over a whole account.

Laptop demo without App credentials still requests `read:user user:email repo`.

Sign-out clears stored encrypted user tokens. `AUTH_SECRET` is required in
production (the app refuses the known dev-only fallback). `AUTH_URL` is required
when serving production with GitHub auth configured.

**Local path connects** (`ALLOW_LOCAL_PROJECT_CONNECT`) default **off** in
production. Hosted deployments must not enable them — they resolve arbitrary
server filesystem paths. Use the GitHub picker or git URLs instead. Advanced
connect requires sign-in (admin/owner) when local connects are disabled.

## What not to do

- Deploy multi-instance / autoscaled replicas that do not share the same durable
  `DATA_DIR` for clones (webhooks and remediations will hit `workspace_missing`).
- Deploy only to Vercel serverless without Postgres **and** without durable disk for clones.
- Share a host without `AUTH_SECRET`.
- Commit `.data/` or token files to git.
- `UPDATE`/`DELETE` evidence rows outside the app’s append-only contract.

## Checklist before inviting real users

1. `DATABASE_URL` + migrated schema (or durable `DATA_DIR` JSON).
2. **Single instance** + durable disk for workspaces/clones.
3. Stable `AUTH_SECRET` and `AUTH_URL`.
4. GitHub App (`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`) + App OAuth client + webhook secret.
5. Backups for Postgres (and `DATA_DIR` if used for JSON/clones).
6. Optional `SENTRY_DSN` for error tracking (structured logs always emit).
7. Invite teammates from **Organization** (`/org`) — switch to the shared org first if you use team orgs.
