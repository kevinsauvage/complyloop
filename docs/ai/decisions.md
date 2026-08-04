# Decision Log

Record architectural and product-shaping decisions here so AI agents and humans share the same history. Newest first. Keep entries short: context, decision, consequence.

---

## 2026-08-04 — Project scaffold, lint, and test tooling

**Context:** First concrete setup after the stack decision. Needed a working app skeleton plus quality gates.

**Decision:** Scaffolded with create-next-app 16.3.0 (Next.js 16, React 19, Tailwind 4, TypeScript strict, `src/` dir, Turbopack, npm). ESLint 9 flat config: `eslint-config-next` (core-web-vitals + typescript) with **strict `eslint-plugin-jsx-a11y` rules** layered on `*.tsx`/`*.jsx` — the product assesses others' accessibility, so our UI meets the same bar — and `@typescript-eslint/no-explicit-any` as an error. Testing: Vitest 4 (jsdom, native `resolve.tsconfigPaths`) + React Testing Library + jest-dom; tests colocated as `src/**/*.test.ts(x)`. Scripts: `lint`, `typecheck`, `test`, `test:watch`.

**Consequence:** `npm run lint && npm run typecheck && npm run test && npm run build` is the local quality gate from day one; CI can reuse it as-is.

## 2026-08-04 — Initial stack

**Context:** Greenfield build of the compliance engineering platform (see product spec). MVP targets accessibility (RGAA/WCAG) assessment of React/Next.js/TypeScript repos.

**Decision:** TypeScript strict everywhere; Next.js App Router + React for the app; Tailwind + shadcn/ui; PostgreSQL with a typed ORM; deterministic analysis via axe-core / eslint-plugin-jsx-a11y / custom AST checks; Vercel AI SDK for AI features. Exact ORM (Prisma vs Drizzle) to be decided when the data layer is built.

**Consequence:** One-language codebase; the analysis engine can share AST tooling with the apps it assesses.

## 2026-08-04 — Framework-agnostic core with adapters

**Context:** MVP is accessibility-only, but the spec requires supporting SOC 2, ISO 27001, EU CRA, EAA, and custom frameworks later without redesign.

**Decision:** The domain core (controls, requirements, assessments, findings, remediation, evidence, exceptions) is framework-agnostic. RGAA/WCAG logic lives in a framework adapter; deterministic checkers plug into an analysis engine interface.

**Consequence:** Adding a new compliance domain means writing an adapter + checks, not touching the core.

## 2026-08-04 — AI is never the source of truth

**Context:** Spec sections 11, 19, 23: AI accelerates work but statuses must rest on deterministic evidence or human decisions.

**Decision:** Only the core's status engine changes statuses, and only from deterministic check results or recorded human decisions. AI output enters the system as typed, provenance-tagged suggestions at `suggested` state.

**Consequence:** AI features can evolve freely (models, prompts) without ever compromising the integrity of compliance statuses or evidence.
