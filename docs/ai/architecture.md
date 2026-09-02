# Architecture (AI-facing)

How ComplyLoop is shaped. **Orientation:** [`AGENTS.md`](../../AGENTS.md). **Enforceable rules:** [`.cursor/rules/`](../../.cursor/rules/).

## At a glance

| Piece       | Location          | Role                                       |
| ----------- | ----------------- | ------------------------------------------ |
| Domain core | `src/core/`       | Statuses, transitions — framework-agnostic |
| Adapters    | `src/adapters/`   | RGAA/WCAG catalog, presets, guidance       |
| Analysis    | `src/analysis/`   | AST checks + optional runtime audits       |
| AI          | `src/ai/`         | Explain / remediate — never sets status    |
| Server      | `src/server/`     | Postgres, jobs, GitHub, actions            |
| App         | `src/app/`        | Next.js UI + API routes                    |
| CI          | `packages/check/` | `npx complyloop-check` (AST only)          |

**Connectors today:** GitHub only. **Persistence:** Postgres via Drizzle (`DATABASE_URL`). Evidence is **append-only**. GitHub tokens encrypted at rest.

## System diagram

```
┌─────────────────────────────────────────┐
│           Next.js App (UI + API)         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│     Core (requirements, findings, …)     │
└───┬──────────────┬──────────────┬───────┘
    │              │              │
┌───▼───┐    ┌─────▼─────┐  ┌────▼────┐
│Adapter│    │ Analysis  │  │   AI    │
│RGAA/  │    │ AST +     │  │ optional│
│WCAG   │    │ runtime   │  │         │
└───────┘    └─────┬─────┘  └─────────┘
                   │
            ┌──────▼──────┐
            │ GitHub clone │
            │ (ephemeral)  │
            └─────────────┘
```

## Persistence & tenancy

- **Postgres** — frameworks, controls, orgs, projects, assessments, findings, evidence, encrypted tokens, webhook delivery ids.
- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`); projects belong to orgs.
- **Load shape** — request paths load a tenant slice, not the whole DB. Evidence reads are bounded (`WORKSPACE_EVIDENCE_LIMIT`) or paginated in SQL.
- **Clones** — shallow git checkout per job into OS temp; deleted after (`src/server/repo-checkout.ts`). See [`docs/deploy.md`](../deploy.md).
- **Observability** — Sentry via `src/instrumentation.ts`; product code uses `reportError` / `reportWarning`.

## Module boundaries

```
src/core/          ← no imports from adapters, analysis, server, app
src/analysis/      ← no imports from src/server/
src/server/, app/  ← integrate core + analysis via src/adapters/registry.ts
```

**Finding merge:** `filterAstFindingsForAuthority` in `src/analysis/merge-findings.ts` — runtime owns composition-sensitive checks when both engines run.

## Analysis engines

Two deterministic engines; AI is separate and never authoritative.

### 1. AST (`src/analysis/checks/`)

- Runs on source in CI, local dev, and `complyloop-check`.
- **78 checks** registered in `registry.ts`.
- Text heuristics (confirm labels, CAPTCHA cues, vague links) live in `patterns/multilingual.ts` with accent folding for FR/EN/ES/DE.
- Safe auto-fixes and verified AI patches target AST findings.

### 2. Runtime (`src/analysis/runtime/`)

Runs when `project.runtimeBaseUrl` is set (Playwright + axe from `axe.min.js` on disk).

| Piece         | Path             | Role                                                         |
| ------------- | ---------------- | ------------------------------------------------------------ |
| Axe mapping   | `axe-map.ts`     | ~122 axe rule → check id mappings                            |
| Custom checks | `custom-checks/` | Contrast, reflow, focus, error-prevention, CAPTCHA, media, … |
| Site-level    | `site-level/`    | Cross-route consistency (nav, help, titles)                  |

**Do not** add `@axe-core/playwright` — webpack breaks on axe `source` string.

**Runtime URL safety:** `ssrf-guard` + DNS/port checks + redirect limits (`src/analysis/runtime/`). Never import `ssrf-guard/node` in app code.

### Check authority (`src/analysis/check-authority.ts`)

| Class                     | Behavior                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **Runtime-only**          | `unable_to_verify` until page audit runs — never `passed` from empty AST           |
| **Composition-sensitive** | AST runs in CI; runtime wins for status when both run (labels, names, headings, …) |
| **Heuristic AST**         | Empty scan → `unable_to_verify`, not `passed` (pertinence-style rules)             |
| **Site-level**            | Subset of runtime-only; needs ≥2 preview routes                                    |

**Source of truth for ids:** `check-authority.ts` and `registry.ts` — do not duplicate long id lists in docs.

### Requirements intake

Each project stores a **`defaultPresetId`** (set on connect, editable in Settings). Assessments always use that default. The Requirements page accepts an optional **`?presetId=`** URL param to browse other presets (shareable links); status filters use **`?status=`** and preserve `presetId`. Connect defaults to Full RGAA. Topical groups on the Requirements page are **display only**, not intake scope.

## Key flows

### Assessment

1. AST scan of connected tree (changed JSX only on re-assess when possible).
2. If preview URL set → Playwright audit per route + site-level checks.
3. Merge findings; runtime wins for composition-sensitive rules.
4. Manual controls stay `unable_to_verify` until human pass or exception.

### Remediation

| Finding type      | Path                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Source (AST)**  | Deterministic fix or constrained AI patch → ComplyLoop re-scan → draft PR → merge → re-assess → `verified` |
| **Runtime (DOM)** | Guidance → approve → implement in app → re-audit or manual verify                                          |

Finding page UX: [`finding-flow.md`](./finding-flow.md).

### Continuous monitoring

Webhook or manual re-assess → scoped JSX re-scan + optional runtime → regression alerts + optional PR Check Run.

## Data invariants

- Evidence append-only; exceptions and decisions keep history.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- Webhook deliveries idempotent on `x-github-delivery`.

## Adding a framework

1. `src/adapters/<name>/` — metadata, presets, controls (or reuse a catalog like WCAG does with RGAA).
2. Register in `src/adapters/registry.ts`.
3. Wire `guidanceFor` through `src/adapters/guidance.ts`.
4. Server/app import adapters **only** via registry — not `adapters/rgaa/*` directly.

## Tests

| Command                 | What                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run test`          | Vitest unit/integration                                                             |
| `npm run test:coverage` | Gates on `src/core`, `src/adapters`, `src/analysis`, `src/ai`, most of `src/server` |
| `npm run test:e2e`      | Playwright (gated harness)                                                          |

Excluded from unit coverage gate: `db-store`, `runtime/scan.ts`, live GitHub/git I/O — see `vitest.config.mts`.

## Related

- [Finding page flow](./finding-flow.md)
- [Deploy](../deploy.md)
- [All docs](../README.md)
