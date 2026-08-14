# ComplyLoop — Compliance Engineering Platform

A developer-first compliance engineering platform that turns compliance
requirements into actionable, verifiable engineering work:

> **Requirement → Assessment → Finding → Explanation → Remediation →
> Verification → Evidence → Continuous monitoring**

The MVP covers **accessibility compliance (RGAA 4 / WCAG 2.1)** for
React/Next.js/TypeScript codebases. The domain core is framework-agnostic so
other compliance frameworks (SOC 2, ISO 27001, EU CRA, EAA, custom controls)
can be added as adapters. Full product specification:
[`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md).

## Getting started

```bash
npm install
docker compose up -d
# set DATABASE_URL in .env.local (see .env.example)
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, and
connect a repository. Postgres (`DATABASE_URL`) is required.

### Connect a GitHub repository

1. Create a GitHub OAuth App under
   [Developer settings](https://github.com/settings/developers):
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
2. Copy `.env.example` to `.env.local` and set `AUTH_SECRET`,
   `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET`.
3. Restart `npm run dev`, click **Sign in with GitHub**, then **Connect** a
   repository from the dashboard picker.

Without those env vars the repository picker stays unavailable — set them to
connect GitHub projects. Assessment jobs shallow-clone into a temp directory
and delete it when finished (no durable workspace on disk).

Optional continuous monitoring: set `GITHUB_WEBHOOK_SECRET` and point a GitHub
repo webhook (push + pull_request) at
`{origin}/api/github/webhook`. After you sign in once, tokens are stored
**encrypted at rest** (AES-256-GCM via `AUTH_SECRET`) so webhooks can clone and
re-assess; PR events also post a **ComplyLoop Check Run** on the head commit.
Regressions appear as dashboard alerts.

### Playwright product e2e

```bash
npm run playwright:install
npm run test:e2e
```

Uses a gated harness (`E2E_AUTH_ENABLED` + local fixture checkout) — never enable
those env vars on customer deploys. See [`docs/deploy.md`](./docs/deploy.md).

### Deploying beyond the laptop

**Postgres is required** (`DATABASE_URL` + `npm run db:migrate`). Clones are
ephemeral per job — no durable workspace volume. See
[`docs/deploy.md`](./docs/deploy.md).

Local `docker compose` publishes Postgres on **5433** (avoids clashing with a
Homebrew/Postgres.app on 5432).

CI for assessed apps: `npm install @complyloop/check` (build the workspace
package with `npm run build:check` first when installing from this repo), copy
[`templates/github-actions/complyloop-check.yml`](./templates/github-actions/complyloop-check.yml),
or run `npx complyloop-check .` / `npm run check -- .`.

Then click **Run assessment** and walk the loop:

1. **Assess** — eighteen deterministic AST checks scan the connected code
   (scoped to changed JSX when re-assessing after a snapshot diff). Optionally
   set a **preview / staging URL** under **Settings → Runtime audit** so
   composition-sensitive rules (labels, names, headings…) are audited on the
   **rendered page** with Playwright + axe — that avoids false positives on
   design-system primitives like `<input {...props} />` — and so runtime-only
   rules (contrast, page title, skip links, landmarks, target size) can be
   assessed at all. First time: `npm run playwright:install`.
2. **Understand** — each finding explains what failed, why, where, its impact,
   and confidence (and whether it came from `ast` or `runtime`).
3. **Remediate** — review the suggested fix (edit e.g. the proposed alt text),
   approve it, and apply it to the file (source findings). Runtime findings get
   call-site guidance — do not slap a generic `aria-label` on a shared Input.
4. **Verify** — the platform re-runs the same engine (AST or runtime) and only
   then marks the fix verified.
5. **Evidence** — every step lands in an append-only evidence log, exportable
   as JSON, Markdown compliance report, or printable HTML.
6. **Monitor** — re-assessments detect regressions when the connected tree
   changes.

On each finding you can also copy a **unified diff + PR body**, mark work
**implemented outside** the platform, **verify manually** with a note, and on
Requirements record a **human pass** for manual/checklist controls or
**N/A / accepted risk / compensating control** exceptions.

Set `AI_GATEWAY_API_KEY` to enable AI explanations and AI remediation
suggestions; deterministic explanations/fixes remain the happy-path baseline —
AI is never the source of truth.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint (incl. strict jsx-a11y) |
| `npm run typecheck` | TypeScript, strict |
| `npm run test` | Vitest test suite |
| `npm run playwright:install` | Chromium for runtime (axe) audits |
| `npm run check -- [path]` / `npx complyloop-check` | CI gate: fail on accessibility violations |

## Architecture

```
src/core/       Framework-agnostic domain: entities, statuses, transitions
src/analysis/   AST checks + optional runtime (Playwright/axe) audits + fixes
src/adapters/   Framework adapters (RGAA/WCAG first)
src/ai/         AI explainer (optional, provenance-tagged, never sets statuses)
src/server/     Postgres store, seeding, assessment service, server actions
src/app/        Next.js App Router UI
packages/check  Customer-facing CI bin (@complyloop/check)
```

See [`docs/ai/architecture.md`](./docs/ai/architecture.md) for the full
picture. Agent-facing conventions live in [`AGENTS.md`](./AGENTS.md).
