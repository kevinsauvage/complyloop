# Architecture Overview (AI-facing)

High-level target architecture derived from the product spec. Update this document as the system takes shape — it is the map AI agents use before touching code.

## System Shape

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js App                        │
│  Dashboard · Requirements · Findings · Evidence · PRs   │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│                  Framework-Agnostic Core                │
│  Frameworks · Controls · Requirements · Assessments     │
│  Findings · Remediations · Verifications · Evidence     │
│  Exceptions · Status engine · Prioritization            │
└──────┬──────────────────┬──────────────────┬────────────┘
       │                  │                  │
┌──────▼───────┐  ┌───────▼────────┐  ┌──────▼───────────┐
│  Framework   │  │  Analysis      │  │  AI Services     │
│  Adapters    │  │  Engine        │  │  (explain,       │
│  (RGAA/WCAG  │  │  (deterministic│  │   suggest,       │
│   first)     │  │   checks)      │  │   summarize)     │
└──────────────┘  └───────┬────────┘  └──────────────────┘
                          │
                  ┌───────▼────────┐
                  │  Repo Connectors│
                  │  (GitHub first) │
                  └────────────────┘
```

## Module Responsibilities

- **Framework-agnostic core**: owns the domain model and all status transitions. Knows nothing about accessibility, RGAA, or any specific framework. This is the only module allowed to change requirement/remediation statuses.
- **Framework adapters**: translate a framework (RGAA/WCAG first) into controls the core understands, and map analysis results back to those controls.
- **Analysis engine**: deterministic checks only — axe-core, eslint-plugin-jsx-a11y, custom AST checks. Its results are the automated source of truth for pass/fail.
- **AI services**: explanation, root-cause hypotheses, remediation suggestions, evidence summaries. Output is typed, validated, provenance-tagged, and never sets statuses (see `.cursor/rules/ai-features.mdc`).
- **Repo connectors**: clone/read connected repositories, watch changes (webhooks/PRs) to trigger re-assessment and regression detection.

## Key Flows

1. **Assessment**: connector fetches code → adapter selects applicable controls → analysis engine runs checks → core records findings + statuses + evidence.
2. **Remediation**: finding → AI suggestion (`suggested`) → human approval (`approved`) → change/PR (`implemented`) → automated re-check (`verified`) → evidence appended.
3. **Continuous monitoring**: repo change event → scoped re-assessment → regression finding if a previously `passed` requirement now fails, with the introducing change attached.

## Data Invariants

- Evidence is append-only; decisions and exceptions are historized, never hard-deleted.
- Every status records its determination method (`automated` vs `human_review`).
- `verified` is only reachable via a deterministic check or an explicit, recorded human verification.
