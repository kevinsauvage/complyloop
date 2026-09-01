# ComplyLoop

Developer-first **compliance engineering**: turn requirements into verifiable engineering work.

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Monitoring
```

**MVP:** accessibility (RGAA 4 / WCAG 2.2) for React/Next.js/TypeScript. The domain core is framework-agnostic — other frameworks plug in as adapters.

Full product spec: [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md)

---

## Quick start

```bash
npm install
docker compose up -d          # Postgres on localhost:5433
cp .env.example .env.local    # set DATABASE_URL, AUTH_*, etc.
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, connect a repo.

| Need | Doc |
| --- | --- |
| Deploy to staging/prod | [`docs/deploy.md`](./docs/deploy.md) |
| Architecture | [`docs/ai/architecture.md`](./docs/ai/architecture.md) |
| All docs | [`docs/README.md`](./docs/README.md) |
| Agent / contributor guide | [`AGENTS.md`](./AGENTS.md) |

**Local dev:** assessments run **in-process** during `npm run dev`. **Production:** run `npm run worker` alongside the web app.

---

## GitHub setup

1. Create a [GitHub OAuth App](https://github.com/settings/developers):
   - Homepage: `http://localhost:3000`
   - Callback: `http://localhost:3000/api/auth/callback/github`
2. In `.env.local`: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
3. Restart dev server → **Sign in** → **Connect** a repository

Repos are **shallow-cloned per job** into a temp directory and deleted when done.

**Optional — continuous monitoring**

- Set `GITHUB_WEBHOOK_SECRET`
- Point repo webhooks (push + pull_request) at `{origin}/api/github/webhook`
- Tokens are encrypted at rest (AES-256-GCM). PR events post a **ComplyLoop Check Run**.

---

## How it works

1. **Assess** — On **Requirements**, pick framework + preset (RGAA or WCAG × Full / AA / AAA). **74 AST checks** scan connected code; changed JSX only on re-assess when possible. Optional **preview URL** (Settings → Runtime audit) enables Playwright + axe for contrast, landmarks, reflow, and **51 runtime-only** rules. First runtime run: `npm run playwright:install`.
2. **Understand** — Each finding: what failed, why, where, impact, confidence, engine (`ast` or `runtime`).
3. **Remediate** — Source: verified patch → draft PR. Runtime: call-site guidance — fix in the app, not a generic `aria-label` on a shared component.
4. **Verify** — Merge PR + re-assess, or re-run page audit / manual note. Only `verified` closes the loop.
5. **Evidence** — Append-only log; export JSON, Markdown, or HTML report.
6. **Monitor** — Webhooks and re-assessments catch regressions.

**Also on findings:** copy patch/PR body, mark runtime work implemented outside the platform, verify manually, record human pass or exceptions on Requirements.

**AI** (`AI_GATEWAY_API_KEY`): explanations, remediation suggestions, constrained source patches. Patches must pass ComplyLoop before **Create draft PR**. AI never sets requirement status.

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server; assessments in-process |
| `npm run worker` | Job worker (**required in production**) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm run test` | Vitest |
| `npm run playwright:install` | Chromium for runtime audits |
| `npm run check -- [path]` | Local a11y CI gate |
| `npx complyloop-check` | Same gate (published package) |

Definition of done: `npm run lint && npm run typecheck && npm run test && npm run build`

---

## CI in your app

```bash
npm run build:check    # from this monorepo
npm install @complyloop/check
npx complyloop-check .
```

Or copy [`templates/github-actions/complyloop-check.yml`](./templates/github-actions/complyloop-check.yml).

---

## Repo layout

```
src/core/        Domain model (framework-agnostic)
src/analysis/    AST checks + Playwright/axe runtime
src/adapters/    RGAA/WCAG controls & guidance
src/ai/          Optional AI (never sets statuses)
src/server/      Postgres, assessment, GitHub, actions
src/app/         Next.js UI
packages/check/  @complyloop/check CLI
```

---

## E2E tests

```bash
npm run playwright:install
npm run test:e2e
```

Gated harness (`E2E_AUTH_ENABLED`) — **never** on customer deploys. See [`docs/deploy.md`](./docs/deploy.md).
