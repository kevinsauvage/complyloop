# Architecture

**Orientation:** [`AGENTS.md`](../../AGENTS.md) (commands, graft). **Product scope:**
[`compliance-engineering-product-spec.md`](../compliance-engineering-product-spec.md).
**Enforceable rules:** [`.cursor/rules/`](../../.cursor/rules/).

## Modules

| Piece    | Location                               | Role                                                          |
| -------- | -------------------------------------- | ------------------------------------------------------------- |
| Contract | `packages/analysis-core/src/contract/` | Statuses, findings, org/project/requirement types, job enums |
| Analysis | `packages/analysis-core/src/`          | AST checks + optional runtime audits                          |
| DB       | `packages/db/src/`                     | Drizzle schema, `repo/`, workspace-load                       |
| Adapters | `packages/adapters/src/`               | RGAA/WCAG catalog, presets, guidance                          |
| App core | `src/core/`                            | RBAC, finding UX (contract only)                              |
| AI       | `src/ai/`                              | Explain / remediate — never sets status                       |
| Server   | `src/server/`                          | Jobs, GitHub, actions                                         |
| App      | `src/app/`                             | Next.js UI + API                                              |
| CI       | `packages/check/src/`                  | `npx complyloop-check` (AST only)                             |

`src/core` must not import adapters, db, or analysis-core beyond `contract/*`
(ESLint). Dependency direction: `contract → { db, adapters, app }`.

Workspace packages export `src/*.ts`. Next transpiles them; `dist/` is
publish-only. `@complyloop/check` bundles analysis-core; Playwright stays
external.

**Connectors:** GitHub only. **State:** Postgres (`DATABASE_URL`). Evidence is
append-only. Tokens AES-256-GCM at rest. Assessments are durable jobs
(`npm run worker` in prod).

```
App (enqueue only) → assessment_jobs → Worker (clone → scan → persist)
                                         ↓
                         Core + contract → Adapter / Analysis / AI
                                         ↓
                                   GitHub clone (ephemeral)
```

## Persistence

- **Tenancy** — orgs + RBAC (`src/core/rbac.ts`). Roles
  `owner|admin|member|viewer`. Workspace load is membership-org + active
  project.
- **Reads** — `getWorkspace()` loads orgs, project switcher, and runtime for
  the **active project only**. The compliance catalog is compile-time data
  (`shippedCatalog()` from `@complyloop/adapters/catalog`) — not a field on
  the workspace `Db` and not stored in Postgres. File hashes live in
  `assessment_snapshots` and load only for `runAssessment`. Evidence pages
  query Postgres directly (`queries.ts`).
- **Writes** — `withProjectWrite` / `withOrgWrite` / `withProjectLock` in
  `src/server/workspace-write.ts`. A project write returns
  `{ result, payload }`; `persistProjectRows` upserts the explicit
  `ProjectWritePayload`. Org writes return `{ insertOrgs, upsertMemberships,
  deleteMembershipIds, deleteOrgIds }` — no JSON-diff of the in-memory
  slice. Structural entities go through `repo/*`. `runAssessment` returns
  `{ assessment, evidence, findings, remediations, requirements }`; the
  worker persists via `applyAssessmentPayload`. Stale-write guards take a
  single `loadedSlice` (`ProjectSlice`); `persistProjectRows` derives the
  per-entity `updatedAt` maps. Project-scoped filtering is shared via
  `projectScopedSlice` (used by `snapshotProjectSlice`, assessment scratch
  clones, and `buildAssessmentApplyPayload`).
- **Locks** — job claim `FOR UPDATE SKIP LOCKED`; interactive writes and
  apply take `project-write:{projectId}`. Requirement, finding and remediation
  upserts skip rows whose DB `updatedAt` is newer than the loaded slice
  (`repo/upsert-guard.ts`), so a stale apply cannot revert a concurrent human
  decision.
- **Latest assessment** — `latestAssessmentFor` compares `completedAt`.
  Do not use `.at(-1)` (loaders return newest-first).
- **Jobs** — 30-min lease, 3 attempts, serial per project. HTTP only
  enqueues. Dev/e2e drain in-process.
- **Clones** — shallow temp checkout per job; deleted after. See
  [`deploy.md`](../deploy.md).

## Analysis

Three deterministic engines. AI is separate and never authoritative.

**AST** (`checks/` + jsx-a11y) — 75 check ids from source. Safe auto-fixes
and verified AI patches target AST findings.

**Runtime** (when `runtimeBaseUrl` is set) — Playwright + axe from disk.
Navigate with `domcontentloaded` + settle, not `networkidle`. Never add
`@axe-core/playwright`. Never import `ssrf-guard/node` in app code.
`linkinator`, `playwright`, `axe-core`, `html-validate` are server
externals in `next.config.ts`.

Engine containment: a throwing custom probe is recorded on
`probeFailures` and the rest of the pass continues. html-validate
failures are non-fatal. An axe crash still fails the scan.

**html-validate** — structural HTML for RGAA 8.2 / 10.1 only
(`markup-nesting`, `css-for-presentation`). Those stay `unable_to_verify`
until `htmlValidateRan`. Duplicate ids stay on axe + AST.

**Merge:** when runtime ran, drop composition-sensitive / runtime-only /
package-twin AST findings (`merge-findings.ts`). Dedupe priority:
axe > html-validate > playwright-custom > site-level > linkinator > ast > jsx-a11y.

### Check authority (`check-authority.ts`)

| Class                 | Behavior                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| Runtime-only          | `unable_to_verify` until page audit — never `passed` from empty AST      |
| Composition-sensitive | AST in CI; runtime findings replace AST when both run                    |
| Heuristic AST         | Empty scan → `unable_to_verify`, not `passed`                            |
| Site-level            | Needs `runtimeRan` + ≥2 preview routes                                   |
| Standard              | Empty AST scan → `passed`                                                |

Precedence: site_level → runtime_only → heuristic → standard.
Composition-sensitive uses `standard` authority; runtime override is merge,
not a separate class. Do not duplicate id lists in docs — the source is
`check-authority.ts` + `checks/registry.ts`.

**Adding a check id:** `CHECK_IDS` → registry or jsx-a11y map → authority
list → runtime map if needed → catalog `checkId` → `guidance.ts`. Tests:
`check-authority.test.ts`, `catalog-coverage.test.ts`.

### Status derivation (`contract/requirement-status.ts`)

1. Sticky human decisions (never overwritten; temp exceptions expire via
   `clearExpiredExceptions`).
2. Open findings → `failed` / `needs_review`.
3. Applicability (runtime absence) → `not_applicable`.
4. Authority gates → `unable_to_verify` or `passed`.

Manual controls (`checkId: null`) stay `unable_to_verify` until a human
pass or exception.

Assessments always use the project's `defaultPresetId`. Requirements page
`?presetId=` is browse-only.

## Key flows

**Assessment:** enqueue → worker clones + scans → `detectChanges` (depth-1
clone: author is HEAD) → AST → optional Playwright → merge → re-derive
statuses → `verifyDraftPrRemediation` (uses `approvalAction` on the
remediation, not historical evidence). Only a **default-branch** scan (or a
manual assessment) is authoritative: it persists findings/statuses and may
auto-verify. A **pull-request head** scan is a preview — it runs the same
analysis to post a Check Run but never resolves findings, flips statuses, or
auto-verifies, and persists nothing to the project store.

**Remediation:** source = patch → ComplyLoop → draft PR → merge → re-assess
→ `verified`. Runtime = guidance → approve → implement → re-audit. Verify
fails closed on HTTP errors, redirects away from the finding URL, or an
empty document. Site-level findings re-run the site audit; source findings
are not verified by applying a local patch. A successful runtime verify
forwards `runtimeRan` (and site-level / html-validate flags when those
engines ran) so the requirement can close. Runtime/DOM/site findings are
never resolved unless `runtimeRan`.

**Monitoring:** webhook enqueues only (`idempotency_key` from delivery id).
Only pushes to the project's **live** default branch
(`repository.default_branch`, persisted onto `project.github.defaultBranch`
when it changes) are enqueued as authoritative assessments; feature-branch
pushes are ignored. PR events post a Check Run. Failures become
`assessment_job_failed` evidence.

**Reports:** `report-model.ts` + markdown/HTML renderers; routes load via `loadReportInput` in `report.ts`.

## Invariants

- Evidence append-only; decisions keep history.
- Every status records `automated` vs `human_review`.
- `verified` only via deterministic re-check.
- Webhook assessments idempotent via job `idempotencyKey`.

## Tests

Commands: [`AGENTS.md`](../../AGENTS.md). Coverage excludes and thresholds:
`vitest.config.mts`. Vitest resolves workspace packages to **source**.
