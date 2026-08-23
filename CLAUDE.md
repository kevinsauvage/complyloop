<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` -- verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CLAUDE.md -- AI Agent Guide

Guide for AI agents working in this repository. Read this before making changes.

## What This Project Is

A **compliance engineering platform** that turns compliance requirements into actionable, verifiable engineering work. It is developer-first: it doesn't just tell teams "you are not compliant" -- it tells them *what* failed, *why*, *where*, *how to fix it*, and *proves the fix worked*.

Full product specification: [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md). Treat the spec as the source of truth for product decisions.
Architecture reference: [`docs/ai/architecture.md`](./docs/ai/architecture.md).
Domain rules: [`.cursor/rules/domain-model.mdc`](./.cursor/rules/domain-model.mdc).

## The Core Product Loop

Everything in this codebase exists to serve this loop:

```
Requirement -> Assessment -> Finding -> Explanation -> Remediation -> Verification -> Evidence -> Continuous monitoring
```

If a feature doesn't advance this loop, question whether it belongs in the MVP.

## Non-Negotiable Product Principles

1. **Evidence over claims** -- never mark something compliant without recorded evidence.
2. **Verification over AI confidence** -- an AI saying "this looks compliant" is never a status source. Statuses come from deterministic checks or explicit human decisions.
3. **Human in the loop** -- AI-generated remediations are *suggestions* until a human approves them. Important decisions and exceptions keep their history (no hard deletes of decision records).
4. **Explainability** -- every finding must answer: what requirement failed, why, where, how to fix, how we know it's fixed.
5. **Continuous, not one-time** -- design for re-assessment and regression detection, not single audit snapshots.
6. **Actionable for developers** -- write finding/remediation copy in engineering language, not legal language.

## MVP Scope

Deliberately narrow -- **accessibility compliance (RGAA/WCAG) for React/Next.js/TypeScript web applications**:

- Machine-checkable accessibility requirements as the first framework
- Source-code analysis of connected repositories
- AI-assisted explanation and remediation with human review
- Automated verification of fixes
- Evidence generation and export

The domain model must stay **framework-agnostic** (requirements/controls, not "accessibility rules") so SOC 2, ISO 27001, EU CRA, EAA, and custom frameworks can be added later without redesign.

## Tech Stack

- **Language:** TypeScript (strict mode) everywhere (`typescript` is a runtime dependency for AST analysis)
- **Frontend/App:** Next.js 16 (App Router) + React 19
- **Styling/UI:** Tailwind CSS 4 + shadcn/ui v4 (radix-nova, dark zinc theme by default); app helpers in `src/components/page-primitives.tsx`
- **Persistence:** Postgres via Drizzle (`DATABASE_URL` required; `src/server/db-store/`). Evidence is insert-only (DB trigger enforced). Encrypted GitHub tokens + webhook deliveries live in Postgres. Source checkouts are ephemeral temp clones per job (`src/server/repo-checkout.ts`) -- no durable workspace volume.
- **Auth / GitHub connect:** Auth.js v5 (`next-auth`) with GitHub OAuth (`AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`); projects are GitHub-only (sign-in required to connect)
- **GitHub API / git:** `@octokit/rest` + `@octokit/webhooks` (typed events) + `@octokit/webhooks-methods`; clones and PR push via `simple-git`; handoff patches via `diff`; source walks via `fast-glob`
- **Observability:** `@sentry/nextjs` (`SENTRY_DSN` server/edge, optional `NEXT_PUBLIC_SENTRY_DSN` for the browser). `reportError` / `reportWarning` in `src/server/observability.ts` remain the product API.
- **Analysis engine:** deterministic TypeScript AST checks in `src/analysis/` as the source of truth for local/CI defects (**18 checks**). Role and focusability tables come from `aria-query` + `axobject-query`. Optional **runtime DOM audits** (Playwright + axe-core injected from disk as `axe.min.js`) when a project has `runtimeBaseUrl` -- composition-sensitive rules (labels, names) then use the rendered page as status truth; runtime-only rules (contrast, title, bypass, landmarks, nested interactive, target size) stay `unable_to_verify` until that audit runs. Do not add `@axe-core/playwright` (Next/webpack rewrites axe `source`). Runtime URL SSRF uses isomorphic `ssrf-guard` + Node DNS -- never `ssrf-guard/node` (undici 8 breaks Next SSR). AI augments, never replaces either engine.
- **Durable worker:** Assessment jobs run through a job-queue + lease pattern (`src/server/assessment-jobs.ts`, `src/server/assessment-worker.ts`) for resilience across restarts. The worker process is launched via `npm run worker` / `scripts/run-assessment-worker.ts`.
- **AI:** Vercel AI SDK for explanations (optional, gated by `AI_GATEWAY_API_KEY`); deterministic explanations are the baseline. AI output is typed, validated (Zod), and provenance-tagged -- it never sets statuses.
- **Testing:** Vitest + React Testing Library (jsdom) for unit/integration; Playwright for e2e (gated by `E2E_AUTH_ENABLED`). E2E projects: `public` (anonymous), `owner` (full access), `viewer` (read-only).
- **Linting:** ESLint 9 flat config with `eslint-config-next` + strict `eslint-plugin-jsx-a11y`
- **CI package:** `@complyloop/check` / `npx complyloop-check` in `packages/check/`

If a stack decision is missing here, propose it and record it here once made.

## Domain Vocabulary

Use these terms consistently in code, database schema, APIs, and UI.

| Term | Meaning |
|------|---------|
| **Framework** | A compliance framework (RGAA, WCAG, SOC 2, custom checklist) |
| **Control** | A machine-understandable obligation derived from a framework |
| **Requirement** | A control applied to a specific target (repo/app) with a status |
| **Assessment** | An evaluation run of requirements against connected software |
| **Finding** | A specific failure: what, why, where, impact, confidence |
| **Remediation** | The workflow that resolves a finding (Detected -> ... -> Verified) |
| **Verification** | Automated or human confirmation that a fix actually works |
| **Evidence** | Immutable record of what was checked, found, changed, verified |
| **Exception** | A documented, historized deviation (accepted risk, N/A, false positive) |

## Requirement Statuses

The canonical status set (use an enum, exhaustive switches required):

`passed` | `failed` | `needs_review` | `not_applicable` | `unable_to_verify`

Always distinguish *automatically verified* results from *human-reviewed* results in the data model and UI.

## Remediation Statuses

`detected` | `investigating` | `suggested` | `approved` | `implemented` | `verified`

A fix is never "complete" at `implemented` -- only `verified` closes the loop.

## Engineering Conventions

- TypeScript strict; no `any` unless justified with a comment
- Imports at the top of the module -- no inline imports
- Exhaustive `switch` over unions/enums with a `never` check in `default`
- Domain logic lives in framework-agnostic modules; accessibility/RGAA specifics are plugins/adapters, never baked into the core
- Deterministic checks and AI features are separated at the module boundary; AI output is always typed, validated, and labeled as AI-generated
- Evidence records are append-only
- Our own UI must meet the accessibility bar we assess others against (jsx-a11y strict is enforced by ESLint)
- Tests live next to the code they test as `*.test.ts(x)`; test behavior, not implementation -- query by accessible role/name
- Server Actions split by domain in `src/server/actions/` -- no barrel file
- Never swallow errors in empty `catch` blocks; either handle meaningfully or rethrow with context
- Do not add `@axe-core/playwright` (Next/webpack rewrites axe `source`)
- Full code quality standards: `.cursor/rules/code-quality.mdc`

## Definition of Done

Work is not done until all of these pass:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Never disable a lint rule, skip a test, or loosen tsconfig to make the gate pass -- fix the underlying issue, or change the rule deliberately and record why in `docs/ai/architecture.md`.

## Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run test             # Vitest, single run
npm run test:watch       # Vitest, watch mode
npm run test:coverage    # Vitest with coverage
npm run check -- [path]  # CI gate: fail on accessibility violations in a tree
npm run db:generate      # Drizzle schema generation
npm run db:migrate       # Apply migrations
npm run db:reset         # Wipe + remigrate
npm run db:studio        # Drizzle studio (DB browser)
npm run worker           # Start the durable assessment worker
npm run e2e:seed         # Seed DB for Playwright tests
npm run test:e2e         # Playwright e2e tests
npm run test:e2e:ui      # Playwright with UI
npm run ops:check        # Operational health checks
npm run ops:backup       # Postgres backup
```

## Repository Layout

```
compliance-engineering-product-spec.md   Product spec (source of truth)
CLAUDE.md                                This file (AI agent guide)
AGENTS.md                                Next.js agent rules (auto-managed)
docs/
  ai/architecture.md                     Architecture reference (AI-facing)
  deploy.md                              Deployment runbook
.cursor/rules/
  domain-model.mdc                       Canonical vocabulary and status enums
  ai-features.mdc                        Rules for AI implementation
  code-quality.mdc                       Code quality standards
  typescript-conventions.mdc             TypeScript/React conventions
  product-context.mdc                    Product principles and context
src/
  core/                                  Framework-agnostic domain core
    finding-types.ts                     Finding, Remediation, Alert, Assessment types
    project-types.ts                     Framework, Control, Project, Org, Membership, Requirement types
    statuses.ts                          Requirement / Finding / Remediation status enums
    prioritization.ts                    Scoring and priority logic
    remediation.ts                       Remediation workflow logic
    root-cause.ts                        Root-cause clustering types
    rbac.ts                              Role-based access control
    requirement-status.ts                Status transition rules
    labels.ts, location.ts, pagination.ts, public-error.ts  Utilities
  analysis/                              Deterministic analysis engine
    checks/ (18 checks)                  img-alt, button-name, anchor-name, html-lang,
                                         positive-tabindex, input-label, heading-order,
                                         empty-heading, iframe-title, autoplay-media,
                                         duplicate-id, form-error-association,
                                         aria-hidden-focusable, aria-role, aria-props,
                                         aria-required-attr, no-autofocus, keyboard-interaction
    runtime/                             Runtime DOM audit support
      scan.ts, axe-map.ts, findings.ts, url-safety.ts
    parse.ts                             TypeScript AST parsing
    scan.ts, source-files.ts             Scanner orchestration and file walking
  adapters/rgaa/                         RGAA/WCAG framework adapter
    controls.ts                          RGAA control definitions
    guidance.ts                          Developer guidance per control
    presets.ts                           Framework presets
  ai/                                    AI explainer and remediation (optional, gated)
    explainer.ts, remediation.ts, warn.ts
  server/                                Server-side logic
    actions/                             Server Actions (split by domain, no barrel)
      assessment.ts, remediation.ts, remediation-verify.ts, remediation-dismiss.ts,
      remediation-ai.ts, requirements.ts, requirements-intake.ts,
      connect.ts, org.ts, pr.ts, alerts.ts, runtime-audit.ts, auth.ts, shared.ts
    db-store/                            Drizzle ORM persistence layer
      schema.ts                          Full DB schema (8 tables + indexes + triggers)
      postgres-persist.ts, postgres-load.ts  Core read/write
      postgres-evidence.ts               Evidence insert-only store
      postgres-sync.ts                   Cached catalog sync
      write-lock.ts                      Concurrency control
      client.ts, types.ts, constraints.test.ts, postgres-ssl.ts, postgres-url.ts
    assessment*.ts                       Assessment orchestration, jobs, worker, findings
    github*.ts                           GitHub App auth, checks, repo, tokens, access
    webhook*.ts                          Webhook handlers and delivery tracking
    connect*.ts                          Repo connection flow
    monitor.ts, seed.ts, report.ts       Monitoring, seeding, report generation
    observability.ts                     reportError / reportWarning (product API)
    repo-checkout.ts                     Ephemeral temp clone per job
    e2e-harness.ts                       E2E test harness (replaces GH clone with local fixtures)
  app/                                   Next.js App Router
    (pages)                              layout, page, loading, error, global-error, not-found
    findings/                            Findings list + detail ([id])
    evidence/report/html/                Evidence HTML report (printable)
    api/                                 API routes
      auth/[...nextauth]/                Auth.js v5
      github/webhook/                    GitHub webhook receiver
      health/                            Health check
      internal/jobs/run/                 Worker job trigger
  components/                            Shared UI components
    dashboard/                           dashboard-status-counts, dashboard-activity-sections,
                                         dashboard-alerts-card, assessment-job-status
    findings/                            finding-action-panel, finding-dismiss-card,
                                         finding-explanations-card, finding-remediation-card
    requirements/                        requirements-intake-panel, requirement-card
    ui/                                  shadcn/ui primitives (18: button, card, badge, ...)
    app-shell.tsx, badges.tsx, connect-project-panel.tsx,
    github-repo-picker.tsx, org-members-card.tsx, ...
  cli/check.ts                           CI package source (complyloop-check CLI)
  hooks/use-action-toast.ts              Shared React hooks
  lib/utils.ts                           Utility helpers
  instrumentation.ts, instrumentation-client.ts  Sentry setup
  types/                                 Type declaration files
  auth*.ts                               Auth.js v5 configuration
packages/
  check/                                 @complyloop/check (CI gate CLI)
    bin.js                               Entry point
    dist/cli.js                          Bundled output
    testdata/                            Deliberate violations for CI testing
                                           (excluded from lint/typecheck)
scripts/                                 Operational scripts
  backup-postgres.sh                     Postgres backup
  build-check.mjs                       Bundle the CI package
  db-migrate.ts, db-reset.ts             Database management
  e2e-seed.ts                           Seed DB for Playwright tests
  operations-check.ts                    Health check script
  run-assessment-worker.ts               Worker process launcher
templates/
  github-actions/                       GitHub Actions CI templates
e2e/                                     Playwright end-to-end tests
  fixtures/sample-app/                  Deliberate a11y violations for e2e
  .auth/                                 Browser storage states (owner, viewer)
  a11y.spec.ts, authz.spec.ts, core-loop.spec.ts,
  evidence-export.spec.ts, org-account.spec.ts, settings.spec.ts, ...
drizzle/                                 Drizzle ORM migrations (0000-0006)
.github/workflows/
  ci.yml                                 Main CI pipeline
  complyloop-check.yml                   Compliance gate check
```

## Key Data Invariants

- Evidence is append-only; DB trigger enforces no UPDATE/DELETE. Evidence rows outlive project and organization deletion (no FKs from evidence to mutable tables).
- Every status records `automated` vs `human_review` determination method.
- `verified` only via deterministic re-check or recorded human verification.
- GitHub tokens at rest are encrypted with `AUTH_SECRET` (AES-256-GCM). Never log or return raw tokens in API responses.
- Webhook deliveries are idempotent by `x-github-delivery` header.
- All AI output is provenance-tagged (`ai_generated: true`) and enters workflows at `suggested` only -- never at `passed`/`verified`.

## AI Feature Rules (Summary -- see ai-features.mdc for full rules)

AI may explain, locate, propose fixes, and generate tests.
AI must never set or change a status (including `verified`), produce evidence, or auto-apply changes.
All AI output must pass through Zod validation before use.