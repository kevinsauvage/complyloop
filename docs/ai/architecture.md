# Architecture Overview (AI-facing)

High-level architecture for ComplyLoop. The MVP implements the core loop in
`src/core/`, RGAA/WCAG in `src/adapters/rgaa/`, deterministic AST analysis in
`src/analysis/`, optional AI in `src/ai/`, and persistence/assessment/actions in
`src/server/`.

**Agent docs:** orientation in `AGENTS.md` (Claude: thin pointer in `CLAUDE.md`);
enforceable rules in `.cursor/rules/` (always-on: product, domain, quality;
file-scoped: analysis, server, UI, AI, TypeScript). Keep durable architecture
here — do not re-paste stack/layout into agent markdown.

**Current connectors:** GitHub OAuth / GitHub App repo connect only.
**Persistence:** **Postgres via Drizzle** (`DATABASE_URL` required) for domain state, encrypted GitHub tokens, and webhook delivery ids. Evidence is append-only (insert-only). Writers use `withDbWrite` / `withWorkspaceWrite`.

**Load shape:** Request paths do **not** select the whole database into memory. `getWorkspace` / `withWorkspaceWrite` resolve the viewer's org + project ids, then load catalog (frameworks/controls) plus that tenant slice. Workspace reads keep a bounded evidence window (`WORKSPACE_EVIDENCE_LIMIT`); the evidence UI and exports page via SQL (`listEvidencePageForProject` / `listAllEvidenceForProject`). Assessment workers load a single project scope. Persist prune is **scope-aware**: a partial `Db.loadScope` never deletes rows outside that org/project set. Full replace-all sync remains available for explicit `mode: "full"` loads.

**Tenancy:** organizations + memberships with role RBAC (`src/core/rbac.ts`); active org via cookie; projects carry `orgId`. Source trees are ephemeral temp clones per job (`src/server/repo-checkout.ts`). See `docs/deploy.md`.
**Observability:** `@sentry/nextjs` via `src/instrumentation.ts` (Node/Edge) and `src/instrumentation-client.ts` (browser). Product code still calls `reportError` / `reportWarning`. GitHub webhook payloads are typed with `@octokit/webhooks`.

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
- **Framework adapters**: RGAA and WCAG share one unique control catalog
  (`src/adapters/rgaa/controls.ts`; WCAG codes live on `secondaryCode`). A
  project assesses exactly one framework + level preset (Full / AA / AAA);
  topical subsets are display groupings on the requirements page, not intake
  scope. WCAG registers framework + presets only — it does not duplicate
  control ids.
- **Analysis engine:** dual deterministic engines — TypeScript AST checks (`src/analysis/checks/`, 29 checks) for local/CI/auto-fix, using `aria-query` / `axobject-query` for role and focusability tables, and optional **runtime DOM audits** (Playwright + axe-core injected from `axe.min.js` on disk in `src/analysis/runtime/`) when `project.runtimeBaseUrl` is set. Composition-sensitive rules use runtime as status truth when it runs. Runtime-only rules (16 checks: contrast, document title, bypass, landmarks, nested interactive, target size, tables, page heading, …) stay `unable_to_verify` until axe runs. Axe → check mapping lives in `axe-map.ts` (~60+ rules). Do not add `@axe-core/playwright` — it injects the `axe-core` `source` string, which Next/webpack rewrites (`module is not defined`). Runtime URL SSRF uses isomorphic `ssrf-guard` plus Node DNS, port allowlist (80/443), and redirect hop limits — never `ssrf-guard/node` (undici 8 breaks Next SSR). Framework adapters register in `src/adapters/registry.ts`. AI never sets requirement status.
- **AI services**: explanation and remediation suggestions; typed, provenance-tagged, never statuses.
- **Repo connectors**: GitHub OAuth / App clone; webhooks re-pull and re-assess; PR Check Runs via Octokit.

## Key Flows

1. **Assessment**: AST scan of the connected tree; if a preview URL is configured, also audit routes with axe. Merge findings (runtime owns composition-sensitive checks). Runtime-only checks stay `unable_to_verify` until axe runs. Update requirement statuses + append-only evidence. Manual controls stay `unable_to_verify` until human pass or exception.
2. **Remediation**: finding → suggestion → human approve → apply/PR (source findings with fixes) or call-site handoff (DOM findings) → re-check with the same engine → `verified` → evidence.
3. **Continuous monitoring**: webhook or re-assess → snapshot diff → **scoped re-scan of changed JSX when possible** (full tree otherwise) + optional runtime re-audit → regression alerts + optional Check Run on PR heads.

## Data Invariants

- Evidence is append-only; decisions and exceptions are historized, never hard-deleted.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- GitHub tokens at rest are encrypted with `AUTH_SECRET`; webhook deliveries are idempotent by `x-github-delivery`.

## Analysis checks (current)

Three authority classes:

**AST (29)** — local/CI/`complyloop-check` source of truth:
img-alt, button-name, anchor-name, html-lang, positive-tabindex, input-label,
heading-order, empty-heading, iframe-title, autoplay-media, duplicate-id,
form-error-association, aria-hidden-focusable, aria-role, aria-props,
aria-required-attr, no-autofocus, keyboard-interaction, meta-viewport,
list-structure, autocomplete-valid, pointer-gesture, pointer-cancellation,
motion-actuation, focus-context-change, input-context-change,
sensory-characteristics, image-of-text, error-suggestion.

**Runtime-only (16)** — axe via Playwright when `runtimeBaseUrl` is set; otherwise
`unable_to_verify` (never passed from an empty AST scan):
color-contrast, document-title, bypass, landmark-one-main, nested-interactive,
target-size, table-headers, page-heading, content-region, label-in-name,
lang-parts, aria-roledescription, presentation-role, no-auto-refresh,
no-orientation-lock, landmark-unique.

**Composition-sensitive (8)** — AST still runs (and gates CI), but when a runtime
audit succeeds these defer to the rendered DOM for requirement status:
input-label, button-name, anchor-name, form-error-association, heading-order,
empty-heading, aria-hidden-focusable, duplicate-id.

**Requirements intake:** each project assesses exactly one framework + level
preset (RGAA or WCAG × Full / AA / AAA). Connect defaults to Full RGAA.
Topical groups on the Requirements page are display-only, not intake scope.
Dashboard, findings, and exports filter to the active target.

CI gate: `npx complyloop-check` / `@complyloop/check` (AST only).

## Unit test coverage

`npm run test:coverage` enforces high gates on the product surface (`src/core`, `src/adapters`, `src/analysis`, `src/ai`, `src/hooks`, most of `src/server`). Excluded from the unit gate (covered by e2e / worker / fixture paths instead): Postgres loaders (`db-store`), Playwright browser driver (`runtime/scan.ts`), live GitHub/git checkout I/O, and a few thin Next Auth/workspace glue modules. See `vitest.config.mts`.
