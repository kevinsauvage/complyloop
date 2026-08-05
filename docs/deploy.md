# Deploying ComplyLoop

ComplyLoop’s MVP store and workspaces live on the local filesystem:

| Path | Purpose |
|------|---------|
| `$DATA_DIR/db.json` (default `.data/db.json`) | Projects, assessments, findings, evidence |
| `$DATA_DIR/workspaces/` | Git/GitHub clones assessed in place |
| `$DATA_DIR/github-tokens.json` | Encrypted GitHub OAuth tokens for webhooks / PR push |

**Ephemeral serverless disks (typical Vercel serverless / Lambda) are not a supported production target** for this MVP. Instances lose `.data/` between invocations, so assessments, clones, webhook re-pulls, and token persistence break.

## Supported shapes

### 1. Persistent disk (recommended for the JSON store)

Run a long-lived Node process with a mounted volume:

- **Fly.io**, **Railway**, **Render**, **Docker on a VPS**, or any host with a durable volume
- Set `DATA_DIR` to the mount path (e.g. `/data`)
- Point GitHub webhooks at a stable public HTTPS URL
- Keep `AUTH_SECRET` stable across deploys (token encryption key)

Example env for a volume-backed host:

```bash
DATA_DIR=/data
AUTH_SECRET=...          # required; also encrypts github-tokens.json
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
AUTH_URL=https://complyloop.example.com
GITHUB_WEBHOOK_SECRET=...
# AI_GATEWAY_API_KEY=...
```

Run `npm run build && npm run start` (or your platform’s Next.js start command). Ensure the volume is writable by the process user.

### 2. Local / laptop demo

Default: `DATA_DIR` unset → `.data/` under the repo. Fine for development; do not treat this as multi-user SaaS.

### 3. Future: Postgres (deferred)

When leaving single-node demo traffic, migrate the store behind `src/server/db.ts` to Postgres (see `todo.md` P2 and `docs/ai/decisions.md`). Clones may still need disk or an alternate fetch strategy; webhooks still need a durable app process.

## What not to do

- Deploy only to Vercel serverless **without** a persistent volume / external DB and expect webhooks or connected GitHub workspaces to survive.
- Share a host without setting `AUTH_SECRET` — GitHub tokens will not be persisted (and must never be written plaintext).
- Commit `.data/` or token files to git.

## Checklist before inviting real users

1. Persistent `DATA_DIR` (or Postgres migration).
2. Stable `AUTH_SECRET` and `AUTH_URL`.
3. GitHub OAuth App callback + webhook secret configured.
4. Backups for `DATA_DIR` (or DB).
5. Orgs/RBAC (still deferred) before multi-tenant production.
