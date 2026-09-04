<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — AI agent guide

Orientation for agents. **Do not duplicate** product principles, domain vocabulary, or quality gates — those live in [`.cursor/rules/`](./.cursor/rules/) and [`docs/ai/architecture.md`](./docs/ai/architecture.md).

## Doc map

| Doc                                                                                       | Use when                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`compliance-engineering-product-spec.md`](./docs/compliance-engineering-product-spec.md) | Product decisions, MVP scope                   |
| [`docs/ai/architecture.md`](./docs/ai/architecture.md)                                    | System shape, persistence, analysis            |
| [`docs/ai/finding-flow.md`](./docs/ai/finding-flow.md)                                    | Finding page UX contract                       |
| [`docs/analysis-strategy.md`](./docs/analysis-strategy.md)                                | Analysis engines, what/when to add tooling     |
| [`TODO.md`](./TODO.md)                                                                    | Prioritized bugs, debt, decisions to revisit   |
| [`.cursor/rules/`](./.cursor/rules/)                                                      | Enforceable rules (domain, quality, AI, TS, …) |

## What this is

Compliance engineering platform: **Finding → Remediation → Evidence**, with continuous re-assessment.

MVP = accessibility (RGAA/WCAG) for React/Next.js/TypeScript. Domain stays framework-agnostic.

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Monitoring
```

If a change does not advance that loop, question whether it belongs in the MVP.

## Stack

| Layer      | Tech                                                                  |
| ---------- | --------------------------------------------------------------------- |
| App        | Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui        |
| DB         | Postgres + Drizzle (`DATABASE_URL`); evidence insert-only             |
| Auth       | Auth.js v5 + GitHub OAuth/App; ephemeral clones per job               |
| Analysis   | AST + jsx-a11y + optional Playwright/axe when `runtimeBaseUrl` is set |
| Jobs       | `npm run worker` (required in prod)                                   |
| AI         | Vercel AI SDK, optional; **never sets statuses**                      |
| CI package | `@complyloop/check` / `npx complyloop-check`                          |
| Tests      | Vitest + RTL; Playwright e2e (`E2E_AUTH_ENABLED`)                     |

Record new stack decisions here and in `docs/ai/architecture.md`.

## Commands

```bash
npm run dev              # Dev server (Turbopack); transpiles analysis-core from source
npm run build            # Production build; transpiles analysis-core from source
npm run build:core       # Compile packages/analysis-core → dist (publish)
npm run lint && npm run typecheck && npm run test && npm run build  # Definition of done
npm run test:coverage    # Coverage gates (vitest.config.mts)
npm run check -- [path]  # Local a11y CI gate
npm run worker           # Assessment worker
npm run db:migrate       # Apply migrations
npm run test:e2e         # Playwright (after e2e:seed)
```

## Where code lives

```
src/core/                          Framework-agnostic domain (5 files are shims over analysis-core/contract)
packages/analysis-core/src/        AST checks (checks/registry.ts) + runtime audits + contract/ (statuses, findings, status derivation)
src/adapters/rgaa/                 RGAA/WCAG catalog & guidance
src/ai/                            Optional AI (provenance-tagged)
src/server/                        Persistence, assessment, GitHub, actions
src/app/                           App Router pages + API routes
src/components/                    UI (feature folders + ui/)
packages/check/                    CI CLI (testdata/ = deliberate violations)
docs/ai/                           Architecture notes
.cursor/rules/                     Agent rules
```

## When building features

1. Check the product spec section that applies.
2. Map the change to a core-loop stage.
3. Keep `src/core/` framework-agnostic; RGAA/WCAG behind `src/adapters/`.
4. Use canonical statuses with exhaustive `switch` + `never` default ([`domain-model`](./.cursor/rules/domain-model.mdc)).
5. Update `docs/ai/architecture.md` when system shape or persistence changes.
