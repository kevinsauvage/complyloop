# Architecture (AI-facing)

How ComplyLoop is shaped. **Orientation:** [`AGENTS.md`](../../AGENTS.md). **Enforceable rules:** [`.cursor/rules/`](../../.cursor/rules/).

## At a glance

| Piece       | Location                              | Role                                                              |
| ----------- | ------------------------------------- | ----------------------------------------------------------------- |
| Domain core | `src/core/`                           | Product helpers, RBAC, finding UX — framework-agnostic            |
| Contract    | `packages/analysis-core/src/contract/` | Statuses, findings, requirement derivation — shared with analysis |
| Adapters    | `src/adapters/`                       | RGAA/WCAG catalog, presets, guidance                              |
| Analysis    | `packages/analysis-core/src/`         | AST checks + optional runtime audits                              |
| AI          | `src/ai/`                             | Explain / remediate — never sets status                           |
| Server      | `src/server/`                         | Postgres, jobs, GitHub, actions                                   |
| App         | `src/app/`                            | Next.js UI + API routes                                           |
| CI          | `packages/check/`                     | `npx complyloop-check` (AST only)                                 |

`src/core/statuses.ts`, `finding-types.ts`, `requirement-status.ts`, `public-error.ts`, and `assessment-limits.ts` are **re-export shims** of the analysis-core contract so the app keeps `@/core/…` imports.

**Connectors today:** GitHub only. **Persistence:** Postgres via Drizzle (`DATABASE_URL`). Evidence is **append-only** (no FKs — rows outlive project disconnect and org deletion). GitHub tokens encrypted at rest. Assessments run as **durable jobs** (`npm run worker` in prod).

## System diagram

```
┌─────────────────────────────────────────┐
│     Next.js App (UI + API + actions)     │
│     enqueue only — no clone/scan here    │
└──────────────────┬──────────────────────┘
                   │ assessment_jobs
┌──────────────────▼──────────────────────┐
│  Worker (assessment-worker.ts)           │
│  lease → ephemeral clone → scan → persist│
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Core + contract (requirements, findings)│
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

- **Postgres** — frameworks, controls, orgs, memberships, projects, requirements, assessments, findings, remediations, alerts, evidence, encrypted GitHub tokens, webhook delivery ids, `assessment_jobs`, rate-limit buckets, `app_meta`. Domain rows store typed JSONB payloads (`src/server/db-store/schema.ts`).
- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`); projects belong to orgs.
- **Load shape** — request paths load a tenant slice, not the whole DB. Evidence reads are bounded (`WORKSPACE_EVIDENCE_LIMIT`) or paginated in SQL.
- **Writes** — `withDbWrite`: process mutex + Postgres advisory lock around load → mutate → save so concurrent writers cannot clobber each other.
- **Jobs** — queued in DB; worker leases, retries ×3, serial per project; triggers `manual` \| `webhook`. HTTP paths only enqueue (`src/server/assessment-jobs.ts`). In `next dev` and the Playwright harness, the action drains the queue in-process (`assessment-job-drain.ts`).
- **Clones** — shallow git checkout per job into OS temp; deleted after (`src/server/repo-checkout.ts`). See [`docs/deploy.md`](../deploy.md).
- **Observability** — Sentry via `src/instrumentation.ts`; product code uses `reportError` / `reportWarning`.

## Module boundaries

```
src/core/                ← no imports from adapters, analysis, server, app
packages/analysis-core/  ← no imports from src/server/ or src/app/
                           contract/ is the shared status/finding types
src/server/, app/        ← integrate core + analysis via src/adapters/registry.ts
```

WCAG reuses the RGAA control catalog (`wcag` adapter registers presets only). Server/app import adapters **only** via `registry.ts`.

**Finding merge:** `filterAstFindingsForAuthority` — when runtime ran, drop composition-sensitive, runtime-only, and package-twin source findings.

## Analysis engines

Three deterministic engines; AI is separate and never authoritative.

### 1. AST (`packages/analysis-core/src/checks/`)

- Runs on source in CI, local dev, and `complyloop-check`.
- Custom AST checks registered in `registry.ts`, plus `eslint-plugin-jsx-a11y` on the same files (`jsx-a11y-scan.ts`).
- Text heuristics (confirm labels, CAPTCHA cues, vague links) live in `patterns/multilingual.ts` with accent folding for FR/EN/ES/DE.
- Safe auto-fixes and verified AI patches target AST findings.

### 2. Runtime (`packages/analysis-core/src/runtime/`)

Runs when `project.runtimeBaseUrl` is set (Playwright + axe from `axe.min.js` on disk).

Navigation uses `domcontentloaded` plus a brief settle (`gotoForRuntimeAudit`) — not
`networkidle`, which SPAs with analytics or HMR often never reach. Axe is injected
once per page; theme, viewport, and pointer condition passes call `axe.run` only.

| Piece          | Path                    | Role                                                                 |
| -------------- | ----------------------- | -------------------------------------------------------------------- |
| Axe mapping    | `axe-map.ts`            | axe / `complyloop-*` probe id → catalog check id                     |
| Theme pass     | `theme-conditions.ts`   | Re-runs theme-sensitive axe + custom checks under `browserConditions`. Assessments default to `dark` + `light` via `DEFAULT_THEME_CONDITIONS`. |
| Viewport pass  | `viewport-conditions.ts` | Target-size at 320×568 and under `pointer: coarse` (touch emulation). |
| Custom checks  | `custom-checks/`        | Focus, widgets, contrast, reflow, media, hover, live regions, …      |
| Applicability  | `applicability.ts`      | Absence probes (media, CAPTCHA, layout tables) → `not_applicable`    |
| Site-level     | `site-level/`           | Cross-route consistency (nav, help, titles) + `link-check.ts` (linkinator, same-origin broken links) |

**Do not** add `@axe-core/playwright` — webpack breaks on axe `source` string.

`linkinator`, `playwright`, `axe-core`, and `html-validate` are **server externals** in `next.config.ts` (dynamic `import()` / Node APIs at runtime; do not bundle with Turbopack).

**Runtime URL safety:** `ssrf-guard` + DNS/port checks + redirect limits (`packages/analysis-core/src/runtime/`). Never import `ssrf-guard/node` in app code.

### 3. html-validate (rendered structural, `packages/analysis-core/src/runtime/`)

`html-validate` (npm) validates **structural HTML evidence for RGAA 8.2 and 10.1
only** — invalid nesting, duplicate attributes/ids, deprecated presentational
markup — on the **generated DOM** of a page, inside the existing runtime audit.
It is not a second accessibility scanner: landmarks, labels, ARIA, and broken
idrefs stay on axe / custom Playwright checks.

- **`runtime/html-validate-runtime.ts`**, `engine: "runtime"`. Serializes
  `document.documentElement` in the page (recording node→offset), validates the
  exact string in-process, and builds `dom` locations (selector + snippet). A
  clean audit is a real rendered-document verdict — it can *pass* a requirement.
- Curated rules (7): `element-permitted-content`, `element-permitted-order`,
  `close-order`, `no-implicit-close`, `no-dup-attr`, `no-deprecated-attr`,
  `deprecated`. Do not enable `html-validate:recommended` or `@html-validate/wcag`.
  Duplicate ids are **not** checked here — axe owns `duplicate-id` on the
  rendered DOM; AST owns source duplicate ids in CI.
- Check-id mapping (`runtime/html-validate-map.ts`): nesting/order/close/dup-attr
  → `markup-nesting` (`ctl-markup-validity`, RGAA 8.2); deprecated
  attrs/elements → `css-for-presentation` (RGAA 10.1). Interactive nesting is
  axe's job on the generated DOM (the browser auto-repairs it, so it never
  reaches html-validate).

Runs only when `runtimeBaseUrl` is set (needs a browser). The `@complyloop/check`
CLI / source scan does **not** use html-validate.

**html-validate-owned gate:** `markup-nesting` and `css-for-presentation` stay
`unable_to_verify` until html-validate succeeded on at least one page
(`htmlValidateRan`) — an axe-only runtime pass is not enough.

**Analyzer provenance:** `RawFinding` / persisted `Finding` carry optional
`analyzerId`, `analyzerRuleId`, `analyzerVersion`, and `contributingAnalyzers`
(when runtime dedupe merges the same dom node). Coarse `engine: "ast" | "runtime"`
is unchanged for remediation routing. `finding_detected` evidence stores the same
fields in `detail`. Per-page dedupe (`runtime/dedupe-runtime-findings.ts`) priority:
axe > html-validate > playwright-custom > site-level > linkinator > ast > jsx-a11y
when the same check id hits the same node.
html-validate check ids (`markup-nesting`, `css-for-presentation`) do not
overlap axe — exclusive ownership, not dedupe. `duplicate-id` is axe + AST only.

### Check authority (`packages/analysis-core/src/check-authority.ts`)

| Class                     | Behavior                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **Runtime-only**          | `unable_to_verify` until page audit runs — never `passed` from empty AST           |
| **Composition-sensitive** | AST runs in CI; runtime wins for status when both run (labels, names, headings, …) |
| **Heuristic AST**         | Empty scan → `unable_to_verify`, not `passed` (pertinence-style rules)             |
| **Site-level**            | Subset of runtime-only; needs ≥2 preview routes                                    |

**Source of truth for ids:** `check-authority.ts` and `registry.ts` — do not duplicate long id lists in docs.

Classifier precedence in `authorityForCheck`: site_level → runtime_only → heuristic → composition_sensitive → standard.

### Status derivation (`packages/analysis-core/src/contract/requirement-status.ts`)

`deriveRequirementStatus` is the single source of truth. The server adapter
(`src/server/assessment-status.ts`) maps catalog `checkId` → authority class and
feeds scan flags. Precedence:

1. **Sticky human decisions** — exception or human pass (`determination: "human_review"`) is never overwritten by a new assessment. Temporary exceptions expire via `clearExpiredExceptions` (historized, not deleted).
2. **Open findings** — any `violation` → `failed`; otherwise `needs_review`.
3. **Applicability** — when runtime ran and every audited page confirmed absence for that check id → `not_applicable` (fact stored on `requirement_status_changed` evidence). Observables today: temporal/nontemporal media, CAPTCHA, layout tables (`runtime/applicability.ts`).
4. **Authority gates** — manual and heuristic stay `unable_to_verify`; runtime-only needs `runtimeRan` (and `htmlValidateRan` for html-validate-owned ids); site-level needs `runtimeRan` + `siteLevelChecksRan`; standard / composition-sensitive with no open findings → `passed`.

Controls with `checkId: null` stay `unable_to_verify` until a human pass or exception.

### Requirements intake

Each project stores a **`defaultPresetId`** (set on connect, editable in Settings). Assessments always use that default. The Requirements page accepts an optional **`?presetId=`** URL param to browse other presets (shareable links); status filters use **`?status=`** and preserve `presetId`. Connect defaults to Full RGAA. Topical groups on the Requirements page are **display only**, not intake scope.

## Key flows

### Assessment

1. UI / webhook **enqueues** an `assessment_jobs` row. The worker (or inline drain in dev/e2e) leases it, clones, and scans — never in the request path.
2. AST scan of connected tree (changed JSX only on re-assess when possible).
3. If preview URL set → Playwright audit per route: axe + custom checks + html-validate + applicability probes + viewport/pointer target-size + theme conditions; then site-level + link check.
4. Merge findings; runtime wins for composition-sensitive rules.
5. Re-derive requirement statuses (sticky humans, applicability, authority gates).
6. Manual controls stay `unable_to_verify` until human pass or exception.

### Remediation

| Finding type      | Path                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Source (AST)**  | Deterministic fix or constrained AI patch → ComplyLoop re-scan → draft PR → merge → re-assess → `verified` |
| **Runtime (DOM)** | Guidance → approve → implement in app → re-audit or manual verify                                          |

Finding page UX: [`finding-flow.md`](./finding-flow.md).

### Continuous monitoring

Webhook or manual re-assess → scoped JSX re-scan + optional runtime → regression alerts + optional PR Check Run.

**Webhook-driven re-assessment** (`src/app/api/github/webhook` → `src/server/webhook.ts` → `assessment-jobs` → worker) is validated and idempotent on `x-github-delivery`. It never clones or scans in the request path — it only enqueues a durable job that the worker (`assessment-worker.ts`) runs, collecting `compliance_regression` alerts and, for PR events, posting a GitHub Check Run (`github-checks.ts`). Full coverage lives in `e2e/webhook.spec.ts`, which drives signed push/PR deliveries through the real app. In the Playwright harness the app's Octokit is pointed at a local fixture GitHub API via `GITHUB_API_BASE_URL` (defaults to `api.github.com` in prod; also useful for GitHub Enterprise Server).

### Reports

HTML exports from `/evidence/report/html`: engineering (`report-html/engineering.ts`) for developers, audit (`report-html/audit.ts`) for reviewers. Markdown assembly in `src/server/report.ts` is excluded from the unit coverage gate.

## Data invariants

- Evidence append-only; exceptions and decisions keep history.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- Webhook deliveries idempotent on `x-github-delivery`.
- Human exceptions / human passes are sticky until explicitly cleared or a temporary exception expires.

## Adding a framework

1. `src/adapters/<name>/` — metadata, presets, controls (or reuse a catalog like WCAG does with RGAA).
2. Register in `src/adapters/registry.ts` (optional `guidanceFor` on the adapter).
3. Server/app import adapters **only** via registry — not `adapters/rgaa/*` directly.

## Tests

| Command                 | What                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run test`          | Vitest unit/integration                                                             |
| `npm run test:coverage` | Gates on `src/core`, `src/adapters`, `packages/analysis-core`, `src/ai`, `src/hooks`, most of `src/server` |
| `npm run test:e2e`      | Playwright (gated harness)                                                          |

Excluded from unit coverage gate (`vitest.config.mts`): `src/server/db-store/**`, `runtime/scan.ts`, live GitHub/git I/O, Auth/cookie/workspace glue, markdown `report.ts`, `remediation-verify.ts`. HTML reports are covered by `report-html` tests.

## Related

- [Finding page flow](./finding-flow.md)
- [Analysis strategy](../analysis-strategy.md)
- [Deploy](../deploy.md)
- [All docs](../README.md)
