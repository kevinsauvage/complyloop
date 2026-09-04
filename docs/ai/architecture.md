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

`src/core/statuses.ts`, `finding-types.ts`, `requirement-status.ts`, `public-error.ts`, and `assessment-limits.ts` are **re-export shims** of the analysis-core contract so the app keeps `@/core/…` imports. They are the one sanctioned exception to "core imports nothing from analysis" (the ESLint boundary rule does not catch `@complyloop/analysis-core/*` — see [`TODO.md`](../../TODO.md)).

**Connectors today:** GitHub only. **Persistence:** Postgres via Drizzle (`DATABASE_URL`). Evidence is **append-only** (no FKs — rows outlive project disconnect and org deletion). GitHub tokens encrypted at rest (AES-256-GCM). Assessments run as **durable jobs** (`npm run worker` in prod).

**Build coupling:** the app and tests import `@complyloop/analysis-core/*` through the workspace symlink, whose `package.json` `exports` point at **`packages/analysis-core/dist`**. `dist/` is gitignored and only produced by `npm run build:core` (`predev` / `prebuild`). On a fresh clone, `lint`, `typecheck`, and `test` fail until `build:core` has run, and after editing `packages/analysis-core/src` the app-side tests keep running against the stale `dist` until it is rebuilt. `@complyloop/check` is different: `scripts/build-check.mjs` bundles the CLI from **source** via an esbuild alias.

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

- **Postgres** — frameworks, controls, orgs, memberships, projects, requirements, assessments, `assessment_snapshots`, findings, remediations, alerts, evidence, encrypted GitHub tokens, webhook delivery ids, `assessment_jobs`, rate-limit buckets. Domain rows store typed JSONB payloads (`src/server/db-store/schema.ts`) plus a few indexed columns (`project_id`, `status`, …). Catalog is seeded on deploy (`npm run seed` / `db:migrate`), not rewritten on every user action. One hand-written init migration (`drizzle/0000_init.sql`).
- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`); projects belong to orgs.
- **Reads** — `getWorkspace()` loads the catalog, the viewer's orgs/memberships, the project switcher list for those orgs, and **runtime for the active project only** (requirements, assessments **without** file-hash snapshots, findings, remediations, alerts, evidence window). File hashes live in `assessment_snapshots` and are loaded only for `runAssessment` (`loadProjectAssessmentDb`). Evidence pages/exports/finding detail query SQL directly (`postgres-queries.ts`).
- **Writes** — actions use `withProjectWrite` / `withOrgWrite` (`workspace.ts`): load the scoped slice, mutate in memory, persist **changed rows** via `src/server/db-store/repo/*` (upserts by id, evidence insert-only). Project field changes (`runtimeBaseUrl`, `defaultPresetId`, …) update the project row. There is no replace-all sync or prune of untouched rows.
- **Assessments** — the worker clones and scans **outside** a store transaction, then `applyAssessmentPayload` upserts findings/requirements/remediations and inserts the assessment + snapshot + evidence in one short transaction (`assessment-worker.ts`). `runAssessment` still mutates a project-scoped in-memory `Db` for the duration of the scan; that is the apply payload, not a tenant-wide rewrite.
- **Locks** — job enqueue/claim still share one global advisory lock (`write-lock.ts`, `TODO.md` P0-2). Rate limits use per-key named locks. Workspace writes use a normal Drizzle transaction, not the global store lock.
- **Latest assessment** — `latestAssessmentFor` (`src/core/assessment-latest.ts`) compares `completedAt`. Do not use `.at(-1)` on `db.assessments` (loaders return newest-first).
- **Jobs** — queued in DB; worker leases (30 min), **3 attempts total** with exponential backoff, serial per project; triggers `manual` \| `webhook`. HTTP paths only enqueue (`src/server/assessment-jobs.ts`). In `next dev` and the Playwright harness, the action drains the queue in-process (`assessment-job-drain.ts`).
- **Clones** — shallow git checkout per job into OS temp; deleted after (`src/server/repo-checkout.ts`). See [`docs/deploy.md`](../deploy.md).
- **Observability** — Sentry via `src/instrumentation.ts`; product code uses `reportError` / `reportWarning`.

## Module boundaries

```
src/core/                ← no imports from adapters, analysis, server, app
packages/analysis-core/  ← no imports from src/server/ or src/app/
                           contract/ is the shared status/finding types
src/server/, app/        ← integrate core + analysis via src/adapters/registry.ts
```

WCAG reuses the RGAA control catalog (`wcag` adapter registers framework metadata + presets; `wcag/presets.ts` reads `rgaaControls` directly). Server/app are meant to import adapters **only** via `registry.ts`; in practice `src/adapters/control-theme.ts` is also imported directly by pages, `report.ts`, and `report-html/*`, and nothing enforces the rule.

**Finding merge:** `filterAstFindingsForAuthority` (`merge-findings.ts`) — when runtime ran, drop composition-sensitive, runtime-only, and package-twin source findings. This is where "runtime wins for composition-sensitive checks" is implemented; `deriveRequirementStatus` treats `composition_sensitive` exactly like `standard`.

## Analysis engines

Three deterministic engines; AI is separate and never authoritative.

### 1. AST (`packages/analysis-core/src/checks/`)

- Runs on source in CI, local dev, and `complyloop-check`.
- **58** custom AST checks registered in `checks/registry.ts` (`allChecks`), plus `eslint-plugin-jsx-a11y` on the same files (`jsx-a11y-scan.ts`; 30 plugin rules mapped to 20 check ids in `jsx-a11y-map.ts`). Together they can emit **77** distinct check ids. The `CheckId` union and the catalog's non-null `checkId`s are both **138** (the rest are runtime/axe/html-validate/site-level ids); **25** catalog controls are manual (`checkId: null`).
- Text heuristics (confirm labels, CAPTCHA cues, vague links) live in `patterns/multilingual.ts` with accent folding for FR/EN/ES/DE.
- Safe auto-fixes and verified AI patches target AST findings.

### 2. Runtime (`packages/analysis-core/src/runtime/`)

Runs when `project.runtimeBaseUrl` is set (Playwright + axe from `axe.min.js` on disk).

Navigation uses `domcontentloaded` plus a brief settle (`gotoForRuntimeAudit`) — not
`networkidle`, which SPAs with analytics or HMR often never reach. Axe is injected
from disk; `runAxeOnPage` re-injects if viewport/CDP emulation cleared `window.axe`.

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
| **Composition-sensitive** | AST runs in CI; runtime findings replace AST findings when both run (labels, names, headings, …); status derivation itself = standard |
| **Heuristic AST**         | Empty scan → `unable_to_verify`, not `passed` (pertinence-style rules)             |
| **Site-level**            | Needs `runtimeRan` + ≥2 preview routes. Mostly runtime-only ids, but `consistent-lang` and `consistent-page-heading` are site-level without being in the runtime-only list |
| **Standard**              | Everything else: empty AST scan → `passed`. Note this includes `video-caption`, `audio-caption`, `media-controls-present`, which AST cannot see for client-rendered media |

**Source of truth for ids:** `check-authority.ts` and `checks/registry.ts` — do not duplicate long id lists in docs.

Classifier precedence in `authorityForCheck`: site_level → runtime_only → heuristic → composition_sensitive → standard. A check id may appear in several lists; today the only dual-listed id is `label-adjacent` (runtime-only **and** heuristic). Because `findingsFromAxeHits` downgrades any heuristic id to `kind: "warning"`, `label-adjacent` runtime hits can only ever yield `needs_review`, never `failed` (`TODO.md`).

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

1. UI / webhook **enqueues** an `assessment_jobs` row. The worker (or inline drain in dev/e2e) leases it, clones (depth-1 fetch of the ref), and scans — never in the request path.
2. `detectChanges` hashes every source file into `assessment_snapshots.fileHashes` (not on the assessment list payload) and diffs against the previous run's snapshot; changed files are attributed with `git log -1 -- <file>`, which on a depth-1 clone always returns the HEAD commit, so `author` / `commitSha` on `FileChange` and regression alerts is the tip commit, not the real last author.
3. AST scan of connected tree (changed JSX only on re-assess when possible).
4. If preview URL set → Playwright audit per route: axe + custom checks + html-validate + applicability probes + viewport/pointer target-size + theme conditions; then site-level + link check.
5. Merge findings; runtime wins for composition-sensitive rules.
6. Re-derive requirement statuses (sticky humans, applicability, authority gates).
7. Manual controls stay `unable_to_verify` until human pass or exception.
8. `verifyDraftPrRemediation` is meant to move an `approved` (via draft PR) remediation to `verified` when its finding is no longer detected. The worker loads draft-PR approval from evidence SQL (`hasDraftPrApproval`) before the scan; do not rely on historical `db.evidence` in the write snapshot (`TODO.md` P0).

### Remediation

| Finding type      | Path                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Source (AST)**  | Deterministic fix or constrained AI patch → ComplyLoop re-scan → draft PR → merge → re-assess → `verified` |
| **Runtime (DOM)** | Guidance → approve → implement in app → re-audit or manual verify                                          |

Finding page UX: [`finding-flow.md`](./finding-flow.md).

### Continuous monitoring

Webhook or manual re-assess → scoped JSX re-scan + optional runtime → regression alerts + optional PR Check Run.

**Webhook-driven re-assessment** (`src/app/api/github/webhook` → `src/server/webhook.ts` → `assessment-jobs` → worker) is signature-validated. `x-github-delivery` is recorded in `webhook_deliveries`, but a duplicate delivery is still handled (the response only carries `duplicate: true`); actual idempotency comes from the `assessment_jobs.idempotency_key` derived from the delivery id. It never clones or scans in the request path — it only enqueues a durable job that the worker (`assessment-worker.ts`) runs, collecting `compliance_regression` alerts and, for PR events, posting a GitHub Check Run (`github-checks.ts`). Clone failures surface as `assessment_job_failed` evidence, not as a webhook response code. Full coverage lives in `e2e/webhook.spec.ts`, which drives signed push/PR deliveries through the real app. In the Playwright harness the app's Octokit is pointed at a local fixture GitHub API via `GITHUB_API_BASE_URL` (unset → Octokit's own `api.github.com` default; also useful for GitHub Enterprise Server).

### Reports

HTML exports from `/evidence/report/html`: engineering (`report-html/engineering.ts`) for developers, audit (`report-html/audit.ts`) for reviewers. Markdown assembly in `src/server/report.ts` is excluded from the unit coverage gate.

## Data invariants

- Evidence append-only; exceptions and decisions keep history.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check or recorded human verification.
- Webhook-triggered assessments idempotent via the job `idempotencyKey` (derived from `x-github-delivery`).
- Human exceptions / human passes are sticky until explicitly cleared or a temporary exception expires.

## Adding a framework

1. `src/adapters/<name>/` — metadata, presets, controls (or reuse a catalog like WCAG does with RGAA).
2. Register in `src/adapters/registry.ts` (optional `guidanceFor` on the adapter).
3. Server/app import adapters **only** via registry — not `adapters/rgaa/*` directly.

## Tests

| Command                 | What                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run test`          | Vitest unit/integration                                                             |
| `npm run test:coverage` | Gates on `src/core`, `src/adapters`, `packages/analysis-core`, `src/ai`, `src/hooks`, most of `src/server` (lines 96 / functions 96 / branches 85 / statements 94) |
| `npm run test:e2e`      | Playwright (gated harness)                                                          |

Excluded from the unit coverage gate (`vitest.config.mts`): `src/server/db-store/**` (Drizzle/Postgres integration), `packages/analysis-core/src/runtime/scan.ts`, `active-cookies.ts`, `workspace.ts`, `db.ts`, `repo-checkout.ts`, `github-tokens.ts`, `github-app.ts`, `octokit.ts`, `github.ts`, `connect-github.ts`, `pr.ts`, `webhook-deliveries.ts`, `github-repo.ts`, `report.ts`, `actions/remediation-verify.ts`. Several excluded modules (`pr.ts`, `github.ts`, `webhook-deliveries.ts`, `remediation-verify.ts`) do have unit tests. HTML reports are exercised through `report.test.ts` and `report-html/shared.test.ts`; `audit.ts` / `engineering.ts` have no colocated tests.

`npm run test` resolves `@complyloop/analysis-core/*` to the compiled `dist/` (see *Build coupling* above).

## Related

- [Finding page flow](./finding-flow.md)
- [Analysis strategy](../analysis-strategy.md)
- [Deploy](../deploy.md)
- [All docs](../README.md)
