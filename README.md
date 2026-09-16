# ComplyLoop

Developer-first **compliance engineering**: turn requirements into verifiable engineering work.

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Monitoring
```

**Product:** accessibility (RGAA 4 / WCAG 2.2) for React/Next.js/TypeScript.

Full product spec: [`compliance-engineering-product-spec.md`](./docs/compliance-engineering-product-spec.md)

---

## Quick start

```bash
npm install
docker run -d --name complyloop-pg \
  -e POSTGRES_USER=complyloop -e POSTGRES_PASSWORD=complyloop \
  -e POSTGRES_DB=complyloop -p 5433:5432 postgres:16-alpine
cp .env.example .env.local    # set DATABASE_URL, AUTH_*, etc.
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, connect a repo.

| Need                      | Doc                                                    |
| ------------------------- | ------------------------------------------------------ |
| Deploy to staging/prod    | [`docs/vercel.md`](./docs/vercel.md)                   |
| Architecture              | [`docs/ai/architecture.md`](./docs/ai/architecture.md) |
| All docs                  | [`docs/README.md`](./docs/README.md)                   |
| Agent / contributor guide | [`AGENTS.md`](./AGENTS.md)                             |

**Local dev:** assessments run **in-process** during `npm run dev`. **Production (Vercel):** trigger sites only enqueue, then kick the GitHub Actions `assessment-worker` via `repository_dispatch` (15-min schedule backstop; self-fetch of `POST /api/internal/jobs/run` as degraded fallback) — no worker process, no Vercel Cron (see [`docs/vercel.md`](./docs/vercel.md)).

---

## GitHub setup

1. Create a [GitHub App](https://github.com/settings/apps):
   - Homepage: `http://localhost:3000`
   - Callback: `http://localhost:3000/api/auth/callback/github`
   - Webhook URL: `http://localhost:3000/api/github/webhook` (events: `push`, `pull_request`)
   - Permissions: Contents R/W, Pull requests R/W, Checks R/W, Metadata R
   - Request user authorization (OAuth) during installation
2. In `.env.local`: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (+ `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`)
3. Restart dev server → **Sign in** → **Install the App** → **Connect** a repository

Repos are **shallow-cloned per job** into a temp directory and deleted when done.

**Continuous monitoring**

- Webhook events (`push`, `pull_request`) trigger re-assessments; PR events post a **ComplyLoop Check Run**.
- Repo access uses short-lived App installation tokens — assessments and check runs keep working with no user signed in.

---

## How it works

1. **Assess** — Default preset is **Full RGAA 4** on connect (change in **Settings**). On **Requirements**, browse presets via **`?presetId=`** (shareable URLs). **58 custom AST checks + `eslint-plugin-jsx-a11y`** scan connected code (75 distinct check ids); re-assess skips unchanged files via snapshot diff when possible (runtime audits always re-scan all preview pages). Optional **preview URL** (Settings → Runtime audit) enables Playwright + axe for contrast, landmarks, reflow, and other **runtime-only** rules (see `check-authority.ts`). First runtime run: `npm run playwright:install`.
2. **Understand** — Each finding: what failed, why, where, impact, confidence, engine (`ast` or `runtime`).
3. **Remediate** — Source: verified patch → draft PR. Runtime: call-site guidance — fix in the app, not a generic `aria-label` on a shared component.
4. **Verify** — Merge PR + re-assess, or re-run page audit. Only `verified` closes the loop.
5. **Evidence** — Append-only log; export JSON, Markdown, or HTML report.
6. **Monitor** — Webhooks and re-assessments catch regressions.

**Also on findings:** copy patch/PR body, mark runtime work implemented outside the platform, record human pass or exceptions on Requirements.

**AI** (`AI_GATEWAY_API_KEY`): explanations, remediation suggestions, constrained source patches. Patches must pass ComplyLoop before **Create draft PR**. AI never sets requirement status.

---

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Dev server; assessments in-process |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm run test` | Vitest |
| `npm run test:db` | Postgres persistence integration (needs `DATABASE_URL`) |
| `npm run test:coverage` | Coverage gate (`vitest.config.mts`) |
| `npm run verify:gate` | Full gate: lint + typecheck + test + build + bundle check |
| `npm run db:migrate` / `db:reset -- --confirm` / `db:studio` | Apply migrations / wipe + remigrate / Drizzle Studio |
| `npm run db:ensure-owner` | Backfill org owner |
| `npm run worker:drain` | Run queued assessment jobs locally (builds + runs the executor) |
| `npm run ops:check` | Prod config sanity (DB + required env + queue depth) |
| `npm run playwright:install` | Chromium for runtime audits + e2e |
| `npm run test:e2e` (after `e2e:seed`) | Playwright e2e |
| `npm run build:core` / `build:db` | Compile workspace packages → `dist` (publish only; dev transpiles from source) |
| `npm run analyze` | Turbopack bundle report |

Definition of done: `npm run verify:gate` (or `npm run lint && npm run typecheck && npm run test && npm run build`)

---

## Repo layout

See [`AGENTS.md`](./AGENTS.md) (commands, graft) and [`docs/ai/architecture.md`](./docs/ai/architecture.md) (modules, persistence, flows).

---

## E2E tests

```bash
npm run playwright:install
npm run test:e2e
```

Gated harness (`E2E_AUTH_ENABLED`) — **never** on customer deploys. See [`docs/vercel.md`](./docs/vercel.md).
