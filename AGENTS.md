<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — AI Agent Guide

Orientation for agents working in this repo. **Do not duplicate** product principles, domain vocabulary, or quality gates here — those live in `.cursor/rules/` (always applied in Cursor) and `docs/ai/architecture.md`.

| Doc | Role |
|-----|------|
| [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md) | Product source of truth |
| [`docs/ai/architecture.md`](./docs/ai/architecture.md) | System shape, persistence, analysis engines |
| [`docs/missing-rules.md`](./docs/missing-rules.md) | Prioritized RGAA 4.1.2 / WCAG 2.2 coverage gaps |
| [`.cursor/rules/`](./.cursor/rules/) | Enforceable agent rules (domain, quality, AI, TS, analysis, server, UI) |

## What this is

A **compliance engineering platform**: turns requirements into verifiable engineering work (Finding → Remediation → Evidence). MVP is accessibility (RGAA/WCAG) for React/Next.js/TypeScript apps; the domain stays framework-agnostic.

Core loop every feature must serve:

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Continuous monitoring
```

If a change does not advance that loop, question whether it belongs in the MVP.

## Tech stack

- **App:** Next.js 16 (App Router) + React 19, TypeScript strict, Tailwind 4 + shadcn/ui
- **DB:** Postgres via Drizzle (`DATABASE_URL`); evidence insert-only; GitHub tokens encrypted at rest
- **Auth / GitHub:** Auth.js v5 + GitHub OAuth/App; ephemeral clones per job (`src/server/repo-checkout.ts`)
- **Analysis:** AST checks in `src/analysis/` (50) + optional Playwright/axe runtime when `runtimeBaseUrl` is set
- **Jobs:** Durable assessment worker (`npm run worker`)
- **AI:** Vercel AI SDK, optional (`AI_GATEWAY_API_KEY`); never sets statuses
- **CI package:** `@complyloop/check` / `npx complyloop-check`
- **Tests:** Vitest + RTL; Playwright e2e (gated by `E2E_AUTH_ENABLED`)

Missing stack decisions: propose them, then record in this file and `docs/ai/architecture.md` if the system shape changes.

## Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run lint && npm run typecheck && npm run test && npm run build  # Definition of done
npm run test:coverage    # Coverage gates on product surface (vitest.config.mts)
npm run check -- [path]  # Local a11y CI gate on a tree
npm run worker           # Assessment job worker
npm run db:migrate       # Apply Drizzle migrations
npm run test:e2e         # Playwright (after e2e:seed)
```

## Layout (where to look)

```
src/core/           Framework-agnostic domain (statuses, transitions, types)
src/analysis/       Deterministic AST + runtime audits
src/adapters/rgaa/  RGAA/WCAG controls and guidance
src/ai/             Optional AI explainer / remediation (provenance-tagged)
src/server/         Persistence, assessment, GitHub, webhooks, actions/
src/app/            App Router pages + API routes
src/components/     UI (feature folders + shadcn in ui/)
packages/check/     CI gate CLI (testdata/ is deliberate violations — excluded from lint)
docs/ai/            Architecture notes for agents
.cursor/rules/      Cursor / agent rules
```

## When building features

1. Check the relevant numbered section of the product spec.
2. Map the change to a core-loop stage.
3. Keep `src/core/` framework-agnostic; put RGAA/WCAG behind `src/adapters/`.
4. Use canonical statuses with exhaustive switches (see `domain-model` rule).
5. Update `docs/ai/architecture.md` when system shape or persistence changes.
