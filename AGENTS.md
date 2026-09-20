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

| Layer    | Tech                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| App      | Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui                                                          |
| DB       | Postgres + Drizzle (`DATABASE_URL`); evidence insert-only                                                               |
| Auth     | Auth.js v5 + GitHub OAuth/App; ephemeral checkouts per job                                                              |
| Analysis | AST + jsx-a11y + optional Playwright/axe when `runtimeBaseUrl` is set                                                   |
| Jobs     | GH Actions `assessment-worker` via `repository_dispatch` + 15-min schedule backstop (no worker process, no Vercel Cron) |
| AI       | Vercel AI SDK, optional; **never sets statuses**                                                                        |
| Tests    | Vitest + RTL; Playwright e2e (`E2E_AUTH_ENABLED`)                                                                       |

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

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
