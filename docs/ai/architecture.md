# Architecture Overview (AI-facing)

High-level architecture for ComplyLoop. The MVP implements the core loop in
`src/core/`, RGAA/WCAG in `src/adapters/rgaa/`, deterministic AST analysis in
`src/analysis/`, optional AI in `src/ai/`, and persistence/assessment/actions in
`src/server/`.

**Current connectors:** sample workspace, local path, git URL, and GitHub OAuth
repo connect. **Persistence:** JSON under `$DATA_DIR` (default `.data/`) behind `src/server/db.ts`, or **Postgres via Drizzle** when `DATABASE_URL` is set. Evidence is append-only (insert-only in Postgres). See `docs/ai/decisions.md` and `docs/deploy.md`. Orgs/RBAC still deferred.

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
│  Exceptions · Human pass · Status engine · Priority     │
└──────┬──────────────────┬──────────────────┬────────────┘
       │                  │                  │
┌──────▼───────┐  ┌───────▼────────┐  ┌──────▼───────────┐
│  Framework   │  │  Analysis      │  │  AI Services     │
│  Adapters    │  │  Engine        │  │  (explain,       │
│  (RGAA/WCAG  │  │  (TS AST       │  │   remediate;     │
│   first)     │  │   checks)      │  │   never status)  │
└──────────────┘  └───────┬────────┘  └──────────────────┘
                          │
                  ┌───────▼────────┐
                  │  Repo Connectors│
                  │  sample/local/  │
                  │  git/GitHub     │
                  └────────────────┘
```

## Module Responsibilities

- **Framework-agnostic core**: domain model and status transitions. Knows nothing about RGAA. Only place that changes requirement/remediation statuses.
- **Framework adapters**: map RGAA/WCAG into controls + developer guidance.
- **Analysis engine**: **deterministic TypeScript AST checks** (`src/analysis/`) — the automated source of truth for pass/fail. AI and runtime tools (axe, jsx-a11y ESLint for *this* app) do not set requirement status.
- **AI services**: explanation and remediation suggestions; typed, provenance-tagged, never statuses.
- **Repo connectors**: sample copy, local path, git clone, GitHub OAuth clone; webhooks re-pull and re-assess; PR Check Runs via Octokit.

## Key Flows

1. **Assessment**: connector provides a tree → scoped or full AST scan → findings + requirement statuses + append-only evidence. Manual controls stay `unable_to_verify` until human pass or exception.
2. **Remediation**: finding → suggestion → human approve → apply/PR → re-check → `verified` → evidence.
3. **Continuous monitoring**: webhook or re-assess → snapshot diff → **scoped re-scan of changed JSX when possible** (full tree otherwise) → regression alerts + optional Check Run on PR heads.

## Data Invariants

- Evidence is append-only; decisions and exceptions are historized, never hard-deleted.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- GitHub tokens at rest are encrypted with `AUTH_SECRET`; webhook deliveries are idempotent by `x-github-delivery`.

## Analysis checks (current)

Thirteen AST checks: img-alt, button-name, anchor-name, html-lang, positive-tabindex, input-label, heading-order, empty-heading, iframe-title, autoplay-media, duplicate-id, form-error-association, aria-hidden-focusable. CI gate: `npx complyloop-check` / `@complyloop/check`.
