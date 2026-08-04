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
connected automatically — click **Run assessment** and walk the loop:

1. **Assess** — six deterministic AST checks scan the connected code.
2. **Understand** — each finding explains what failed, why, where, its impact,
   and confidence.
3. **Remediate** — review the suggested fix (edit e.g. the proposed alt text),
   approve it, and apply it to the file.
4. **Verify** — the platform re-runs the check and only then marks the fix
   verified.
5. **Evidence** — every step lands in an append-only evidence log, exportable
   as JSON.
6. **Monitor** — re-assessments detect regressions (try **Reset sample
   project**, then run the assessment again).

Set `AI_GATEWAY_API_KEY` to enable AI-generated explanations; deterministic
explanations remain the baseline either way — AI is never the source of truth.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint (incl. strict jsx-a11y) |
| `npm run typecheck` | TypeScript, strict |
| `npm run test` | Vitest test suite |

## Architecture

```
src/core/       Framework-agnostic domain: entities, statuses, transitions
src/analysis/   Deterministic engine: TS AST checks, scanner, fix applier
src/adapters/   Framework adapters (RGAA/WCAG first)
src/ai/         AI explainer (optional, provenance-tagged, never sets statuses)
src/server/     JSON store, seeding, assessment service, server actions
src/app/        Next.js App Router UI
fixtures/       Sample project with deliberate violations (never linted)
```

See [`docs/ai/architecture.md`](./docs/ai/architecture.md) for the full
picture and [`docs/ai/decisions.md`](./docs/ai/decisions.md) for the decision
log. Agent-facing conventions live in [`AGENTS.md`](./AGENTS.md).
