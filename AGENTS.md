<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — AI Agent Guide

Guide for AI agents working in this repository. Read this before making changes.

## What This Project Is

A **compliance engineering platform** that turns compliance requirements into actionable, verifiable engineering work. It is developer-first: it doesn't just tell teams "you are not compliant" — it tells them *what* failed, *why*, *where*, *how to fix it*, and *proves the fix worked*.

Full product specification: [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md). Treat the spec as the source of truth for product decisions.

## The Core Product Loop

Everything in this codebase exists to serve this loop:

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Continuous monitoring
```

If a feature doesn't advance this loop, question whether it belongs in the MVP.

## MVP Scope

Deliberately narrow — **accessibility compliance (RGAA/WCAG) for React/Next.js/TypeScript web applications**:

- Machine-checkable accessibility requirements as the first framework
- Source-code analysis of connected repositories
- AI-assisted explanation and remediation with human review
- Automated verification of fixes
- Evidence generation and export

The domain model must stay **framework-agnostic** (requirements/controls, not "accessibility rules") so SOC 2, ISO 27001, EU CRA, EAA, and custom frameworks can be added later without redesign.

## Tech Stack

- **Language:** TypeScript (strict mode) everywhere
- **Frontend/App:** Next.js 16 (App Router) + React 19
- **Styling/UI:** Tailwind CSS 4 + shadcn/ui
- **Database:** PostgreSQL with a typed ORM (Prisma or Drizzle)
- **Analysis engine:** deterministic static analysis (e.g. axe-core, eslint-plugin-jsx-a11y, custom AST checks) as the source of truth; AI augments, never replaces it
- **AI:** Vercel AI SDK for explanation/remediation features; provider-agnostic
- **Testing:** Vitest + React Testing Library (jsdom)
- **Linting:** ESLint 9 flat config with `eslint-config-next` + strict `eslint-plugin-jsx-a11y`

If a stack decision is missing here, propose it and record it here once made.

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest, single run
npm run test:watch   # Vitest, watch mode
```

## Domain Vocabulary

Use these terms consistently in code, database schema, APIs, and UI. See `.cursor/rules/domain-model.mdc` for the full model.

| Term | Meaning |
|------|---------|
| **Framework** | A compliance framework (RGAA, WCAG, SOC 2, custom checklist) |
| **Control** | A machine-understandable obligation derived from a framework |
| **Requirement** | A control applied to a specific target (repo/app) with a status |
| **Assessment** | An evaluation run of requirements against connected software |
| **Finding** | A specific failure: what, why, where, impact, confidence |
| **Remediation** | The workflow that resolves a finding (Detected → … → Verified) |
| **Verification** | Automated or human confirmation that a fix actually works |
| **Evidence** | Immutable record of what was checked, found, changed, verified |
| **Exception** | A documented, historized deviation (accepted risk, N/A, false positive) |

## Non-Negotiable Product Principles

1. **Evidence over claims** — never mark something compliant without recorded evidence.
2. **Verification over AI confidence** — an AI saying "this looks compliant" is never a status source. Statuses come from deterministic checks or explicit human decisions.
3. **Human in the loop** — AI-generated remediations are *suggestions* until a human approves them. Important decisions and exceptions keep their history (no hard deletes of decision records).
4. **Explainability** — every finding must answer: what requirement failed, why, where, how to fix, how we know it's fixed.
5. **Continuous, not one-time** — design for re-assessment and regression detection, not single audit snapshots.
6. **Actionable for developers** — write finding/remediation copy in engineering language, not legal language.

## Requirement Statuses

The canonical status set (use an enum, exhaustive switches required):

`passed` | `failed` | `needs_review` | `not_applicable` | `unable_to_verify`

Always distinguish *automatically verified* results from *human-reviewed* results in the data model and UI.

## Engineering Conventions

- TypeScript strict; no `any` unless justified with a comment
- Imports at the top of the module — no inline imports
- Exhaustive `switch` over unions/enums with a `never` check in `default`
- Domain logic lives in framework-agnostic modules; accessibility/RGAA specifics are plugins/adapters, never baked into the core
- Deterministic checks and AI features are separated at the module boundary; AI output is always typed, validated, and labeled as AI-generated
- Evidence records are append-only
- Our own UI must meet the accessibility bar we assess others against (jsx-a11y strict is enforced by ESLint)
- Tests live next to the code they test as `*.test.ts(x)`; test behavior, not implementation — query by accessible role/name
- Full code quality standards: `.cursor/rules/code-quality.mdc`

## Definition of Done

Work is not done until all of these pass locally:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Never disable a lint rule, skip a test, or loosen tsconfig to make the gate pass — fix the underlying issue, or change the rule deliberately and record why in `docs/ai/decisions.md`.

## Repository Layout

```
compliance-engineering-product-spec.md   Product spec (source of truth)
AGENTS.md                                This file
docs/ai/                                 AI-facing design docs (architecture, decisions)
.cursor/rules/                           Cursor rules (product context, conventions)
src/app/                                 Next.js App Router routes
src/core/                                Framework-agnostic domain core (to be created)
src/adapters/                            Framework adapters, e.g. RGAA/WCAG (to be created)
src/analysis/                            Deterministic analysis engine (to be created)
src/ai/                                  AI services (to be created)
```

## When Building Features

1. Check the spec section relevant to the feature (sections are numbered).
2. Map the feature to the core loop stage(s) it serves.
3. Keep the core domain framework-agnostic; put RGAA/WCAG specifics behind an adapter.
4. Model statuses and workflow states as typed enums with exhaustive handling.
5. Record architectural decisions in `docs/ai/decisions.md`.
