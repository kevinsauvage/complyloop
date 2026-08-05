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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A sample project
(`fixtures/sample-shop`, copied to a disposable workspace under `.data/`) is
connected automatically — no sign-in required for the demo.

### Connect a GitHub repository (recommended)

1. Create a GitHub OAuth App under
   [Developer settings](https://github.com/settings/developers):
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
2. Copy `.env.example` to `.env.local` and set `AUTH_SECRET`,
   `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET`.
3. Restart `npm run dev`, click **Sign in with GitHub**, then **Connect** a
   repository from the dashboard picker.

Without those env vars the sample project and **Advanced: local path or git
URL** still work. Local paths are assessed in place; git/GitHub clones land in
`.data/workspaces/`.

Optional continuous monitoring: set `GITHUB_WEBHOOK_SECRET` and point a GitHub
repo webhook (push + pull_request) at
`{origin}/api/github/webhook`. After you sign in once, tokens are stored
**encrypted at rest** (AES-256-GCM via `AUTH_SECRET`) so webhooks can pull and
re-assess; PR events also post a **ComplyLoop Check Run** on the head commit.
Regressions appear as dashboard alerts.

### Deploying beyond the laptop

The JSON store, clones, and webhook re-pulls need a **persistent disk**. Plain
serverless ephemeral FS is not supported for production. See
[`docs/deploy.md`](./docs/deploy.md) (`DATA_DIR` on Fly/Railway/VPS, or migrate
the store later).

CI for assessed apps: add `@complyloop/check` as a dependency (workspace
`packages/check` until published), copy
[`templates/github-actions/complyloop-check.yml`](./templates/github-actions/complyloop-check.yml),
or run `npx complyloop-check .` / `npm run check -- .`.

Then click **Run assessment** and walk the loop:

1. **Assess** — thirteen deterministic AST checks scan the connected code
   (scoped to changed JSX when re-assessing after a snapshot diff).
2. **Understand** — each finding explains what failed, why, where, its impact,
   and confidence.
3. **Remediate** — review the suggested fix (edit e.g. the proposed alt text),
   approve it, and apply it to the file.
4. **Verify** — the platform re-runs the check and only then marks the fix
   verified.
5. **Evidence** — every step lands in an append-only evidence log, exportable
   as JSON, Markdown compliance report, or printable HTML.
6. **Monitor** — re-assessments detect regressions (try **Reset sample
   project**, then run the assessment again).

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
| `npm run check -- [path]` / `npx complyloop-check` | CI gate: fail on accessibility violations |

## Architecture

```
src/core/       Framework-agnostic domain: entities, statuses, transitions
src/analysis/   Deterministic engine: TS AST checks, scanner, fix applier
src/adapters/   Framework adapters (RGAA/WCAG first)
src/ai/         AI explainer (optional, provenance-tagged, never sets statuses)
src/server/     JSON store, seeding, assessment service, server actions
src/app/        Next.js App Router UI
packages/check  Customer-facing CI bin (@complyloop/check)
fixtures/       Sample project with deliberate violations (never linted)
```

See [`docs/ai/architecture.md`](./docs/ai/architecture.md) for the full
picture and [`docs/ai/decisions.md`](./docs/ai/decisions.md) for the decision
log. Agent-facing conventions live in [`AGENTS.md`](./AGENTS.md).
