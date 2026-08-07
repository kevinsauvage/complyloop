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
| `SENTRY_DSN` | Optional — captures server errors via `@sentry/node` |

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
export DATABASE_URL=postgres://complyloop:complyloop@localhost:5432/complyloop
npm run db:migrate
npm run dev
```

Evidence rows are **insert-only** in Postgres (never updated or deleted by the app).

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

Projects are **GitHub-only**. Connect via the repository picker after Sign in
with GitHub (admin/owner role in the active organization).

## What not to do

- Omit `DATABASE_URL` (the app will not start usefully without Postgres).
- Share a host without `AUTH_SECRET`.
- Commit leftover `.data/` or token files to git.
- `UPDATE`/`DELETE` evidence rows outside the app’s append-only contract.

## Checklist before inviting real users

1. `DATABASE_URL` + migrated schema.
2. Stable `AUTH_SECRET` and `AUTH_URL`.
3. GitHub App (`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`) + App OAuth client + webhook secret.
4. Backups for Postgres (restore tested once).
5. Optional `SENTRY_DSN` for error tracking (structured logs always emit).
6. Invite teammates from **Organization** (`/org`) — switch to the shared org first if you use team orgs.
