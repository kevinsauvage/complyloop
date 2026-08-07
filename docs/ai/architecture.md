# Architecture Overview (AI-facing)

High-level architecture for ComplyLoop. The MVP implements the core loop in
`src/core/`, RGAA/WCAG in `src/adapters/rgaa/`, deterministic AST analysis in
`src/analysis/`, optional AI in `src/ai/`, and persistence/assessment/actions in
`src/server/`.

**Current connectors:** GitHub OAuth / GitHub App repo connect only.
**Persistence:** JSON under `$DATA_DIR` (default `.data/`) behind `src/server/db.ts`, or **Postgres via Drizzle** when `DATABASE_URL` is set (domain state, encrypted GitHub tokens, webhook delivery ids). Evidence is append-only (insert-only in Postgres). Writers use `withDbWrite` / `withWorkspaceWrite`. **Tenancy:** organizations + memberships with role RBAC (`src/core/rbac.ts`); active org via cookie; projects carry `orgId`. Clones remain under `$DATA_DIR/workspaces`. See `docs/ai/decisions.md` and `docs/deploy.md`.

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
                  │  GitHub         │
                  └────────────────┘
```

## Module Responsibilities

- **Framework-agnostic core**: domain model and status transitions. Knows nothing about RGAA. Only place that changes requirement/remediation statuses.
- **Framework adapters**: map RGAA/WCAG into controls + developer guidance.
- **Analysis engine**: dual deterministic engines — TypeScript AST checks (`src/analysis/checks/`) for local/CI/auto-fix, and optional **runtime DOM audits** (Playwright + axe-core in `src/analysis/runtime/`) when `project.runtimeBaseUrl` is set. Composition-sensitive rules use runtime as status truth when it runs; AI never sets requirement status.
- **AI services**: explanation and remediation suggestions; typed, provenance-tagged, never statuses.
- **Repo connectors**: GitHub OAuth / App clone; webhooks re-pull and re-assess; PR Check Runs via Octokit.

## Key Flows

1. **Assessment**: AST scan of the connected tree; if a preview URL is configured, also audit routes with axe. Merge findings (runtime owns composition-sensitive checks). Update requirement statuses + append-only evidence. Manual controls stay `unable_to_verify` until human pass or exception.
2. **Remediation**: finding → suggestion → human approve → apply/PR (source findings with fixes) or call-site handoff (DOM findings) → re-check with the same engine → `verified` → evidence.
3. **Continuous monitoring**: webhook or re-assess → snapshot diff → **scoped re-scan of changed JSX when possible** (full tree otherwise) + optional runtime re-audit → regression alerts + optional Check Run on PR heads.

## Data Invariants

- Evidence is append-only; decisions and exceptions are historized, never hard-deleted.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- GitHub tokens at rest are encrypted with `AUTH_SECRET`; webhook deliveries are idempotent by `x-github-delivery`.

## Analysis checks (current)

Thirteen AST checks: img-alt, button-name, anchor-name, html-lang, positive-tabindex, input-label, heading-order, empty-heading, iframe-title, autoplay-media, duplicate-id, form-error-association, aria-hidden-focusable. CI gate: `npx complyloop-check` / `@complyloop/check`.
