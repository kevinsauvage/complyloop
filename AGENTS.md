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
| [`compliance-engineering-product-spec.md`](./docs/compliance-engineering-product-spec.md) | Product decisions, current scope               |
| [`docs/ai/architecture.md`](./docs/ai/architecture.md)                                    | System shape, persistence, analysis            |
| [`docs/ai/finding-flow.md`](./docs/ai/finding-flow.md)                                    | Finding page UX contract                       |
| [`.cursor/rules/`](./.cursor/rules/)                                                      | Enforceable rules (domain, quality, AI, TS, …) |

## What this is

Compliance engineering for **RGAA/WCAG** on React/Next.js/TypeScript — orgs, projects, continuous re-assessment. Product scope and success criteria: [`compliance-engineering-product-spec.md`](./docs/compliance-engineering-product-spec.md). Core loop and principles: [`.cursor/rules/product-context.mdc`](./.cursor/rules/product-context.mdc) (not repeated here).

## Stack

| Layer      | Tech                                                                  |
| ---------- | --------------------------------------------------------------------- |
| App        | Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui        |
| DB         | Postgres + Drizzle (`DATABASE_URL`); evidence insert-only             |
| Auth       | Auth.js v5 + GitHub OAuth/App; ephemeral checkouts per job           |
| Analysis   | AST + jsx-a11y + optional Playwright/axe when `runtimeBaseUrl` is set |
| Jobs       | Vercel Cron → `POST /api/internal/jobs/run` (no worker process)      |
| AI         | Vercel AI SDK, optional; **never sets statuses**                      |
| Tests      | Vitest + RTL; Playwright e2e (`E2E_AUTH_ENABLED`)                     |

Record new stack decisions here and in `docs/ai/architecture.md`.

## Commands

```bash
npm run dev              # Dev server (Turbopack); transpiles analysis-core from source
npm run build            # Production build; transpiles analysis-core from source
npm run build:core       # Compile packages/analysis-core → dist (publish)
npm run verify:gate      # Full gate: lint + typecheck + test + build + bundle check (definition of done)
npm run lint && npm run typecheck && npm run test && npm run build  # Definition of done (same as verify:gate)
npx vitest run <touched-file>  # Targeted verify during work (fast loop; full gate at the end)
npm run test:coverage    # Coverage gates (vitest.config.mts)
npm run test:db          # Postgres persistence integration (needs DATABASE_URL)
npm run db:migrate       # Apply migrations (tsx runs with --conditions=react-server so server-only imports resolve; keep the flag on every tsx script)
npm run worker:drain     # Run queued assessment jobs locally (builds + runs executor)
npm run ops:check        # Prod config sanity (DB + required env + queue depth)
npm run playwright:install  # Chromium for runtime audits + e2e
npm run test:e2e         # Playwright (after e2e:seed)
```

## Where code lives

Module layout (packages, boundaries, data flow): [`docs/ai/architecture.md`](./docs/ai/architecture.md). Use **graft** (below) for file-level lookup — do not rely on a second folder map here.

## When building features

1. Check the product spec section that applies.
2. Map the change to a core-loop stage ([`product-context.mdc`](./.cursor/rules/product-context.mdc)).
3. Use canonical statuses with exhaustive `switch` + `never` default ([`domain-model.mdc`](./.cursor/rules/domain-model.mdc)).
4. Update `docs/ai/architecture.md` when persistence or system shape changes.

## Boundaries — ask first / never touch

- Ask first: `drizzle/` SQL migrations, `src/core/` kernel, `packages/analysis-core/src/contract/`.
  Reason: evidence append-only, tenant isolation, and the analysis contract break silently when improvised around.
- Never: edit generated output (`.next/`, `dist/`, `coverage/`); use raw `getDrizzle()` in actions (use `withProjectWrite` / `withOrgWrite`); add `@axe-core/playwright` or `ssrf-guard/node`; let AI set requirement/finding statuses.
  Reason: each has caused a real break (build rewrites, SSR crash, unverified compliance claims) — silent until production.
- Multi-file change (>2 files) or architecture decision: output a plan (files / pattern / verification / `[ASSUMPTION]` items) and wait for approval before editing.
  Reason: wrong assumptions cost seconds in a plan, hours in a PR.
- High-risk diffs (auth, evidence, status transitions, migrations): get an independent review in a fresh context before merge — never self-approve your own implementation.
  Reason: the model that wrote the bug cannot reliably spot it by re-reading.

## Model routing

| Task                                                     | Use                       | Why                                                  |
| -------------------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| Architecture, planning, hard refactors, high-risk review | Strongest reasoning model | Only tier that holds multi-file constraints reliably |
| Routine implementation, small scoped edits               | Mid-tier / fast model     | Sufficient under a plan + gates, ~2–3× cheaper       |
| Terminal scripts, CI/DevOps, bulk summaries              | Cheapest capable model    | Cost dominates; capability floor is reachable        |

Route by task — never run the flagship model for everything. Verify with `npm run verify:gate`, not with a bigger model.

## Dependency policy

Keep the UI dependency surface from regrowing: do not add a new Radix/`ui/` primitive without 2+ consumers, and keep success/error toasts centralized (`useActionToast` / `action-state.ts`) rather than sprinkling new `sonner` calls.

## Server vs Client convention

Async data-fetching components (`workspace-context`, `connect-project-panel`, `nav-attention-badges`, `dashboard-pipeline-section`, plus server `app-shell`/`badges`) live alongside client leaves in `src/components/` with no `"use client"` and no `*.server.tsx` rename. Rule: never add `"use client"` above a file importing `@/server/*` — put interactivity in a dedicated client leaf (`mobile-nav-sheet`, `pathname-focus`, `badge-with-description`) and pass server content as slots/children.

<!-- graft:start -->

## Graft — repo context graph

Optional accelerator for a 800-file monorepo (not a substitute for reading the cited span).
`graft/INDEX.md` lists concept nodes with exact `file:line` spans.
`graft/` is gitignored local cache — run `graft build` after checkout or when spans look stale.

- `graft ask "<question>" --source` → ranked code spans for understanding/editing.
- `graft grep "<literal>"` → exhaustive occurrences (ranked results are top-N only).
- `graft skeleton <file>` / `graft callers <symbol>` → cheap API surface / blast radius.
- Source files always win over graph spans — never edit from a span without opening the file.
- If a span is truncated, open the file at that exact range before editing.
- If the graph looks stale, run `graft build` (deterministic, no key) before trusting spans.

<!-- graft:end -->
