# Simplicity Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the in-memory `Db` write protocol and the extra layers listed in `TODO-SIMPLICITY.md`, without dropping stale-write protection, evidence append-only, fail-closed verify, RBAC, advisory locks, or analysis correctness.

**Architecture:** Interactive and assessment writes become “compute rows → `persistProjectRows`.” `Db` stays a read model for pages. Catalog is imported, not glued onto `Db`. Thin packages/files are folded.

**Tech Stack:** Next.js 16, TypeScript strict, Drizzle/Postgres, Vitest. Workspace packages `@complyloop/analysis-core`, `@complyloop/db`, `@complyloop/adapters` (folded in Task 4), `@complyloop/check`.

**Spec:** [`TODO-SIMPLICITY.md`](../../../TODO-SIMPLICITY.md) items #1–#25.

## Global Constraints

- Keep stale-write guards (`loadedUpdatedAtById` / `updatedAt` comparison in repo upserts).
- Keep evidence insert-only (never UPDATE/DELETE evidence rows).
- Keep fail-closed verify (do not revive apply-patch-then-locate for source findings).
- Keep advisory locks: `project-write:{projectId}` and org write lock.
- Keep RBAC (`owner|admin|member|viewer`) and `assertProjectPermission`.
- Do not change check authority *classes* or `deriveRequirementStatus` precedence.
- Do not delete custom Playwright probes or reimplement jsx-a11y.
- Do not merge `getWorkspace` and `getWorkspaceContext`.
- No `any`; no `as` casts to silence the compiler; exhaustive `switch` + `never`.
- Domain vocabulary: Finding, Requirement, Remediation, Evidence — no synonyms.
- Colocate tests as `*.test.ts(x)`. Definition of done per task: focused tests pass; after Task 7 run `npm run lint && npm run typecheck && npm run test && npm run build`.
- Do not add new abstractions “for later.” Prefer deleting code.
- Import from the defining module — no new barrel files.

---

## File map (locked)

| File | Responsibility after this plan |
| ---- | ------------------------------ |
| `packages/db/src/repo/apply.ts` | `persistProjectRows`, `applyAssessmentPayload`, slice snapshot helpers |
| `packages/db/src/project-write.ts` | **Deleted.** Types move to `apply.ts` |
| `src/server/workspace.ts` | Session load only (`getWorkspace`, `getWorkspaceContext`) after Task 6 |
| `src/server/workspace-write.ts` | `withProjectWrite`, `withOrgWrite`, `withProjectLock` (Task 6 split) |
| `src/server/assessment.ts` | `runAssessment` returns `AssessmentApplyPayload` pieces; does not mutate `Db` for persist |
| `src/catalog/` | Shipped catalog, presets, guidance (Task 4; was `packages/adapters`) |
| `src/server/github.ts` | Octokit + list/fetch/group repos + token resolve |
| `src/core/query.ts` | `firstParam`, `parseEnumParam`, `buildHref`, page href helpers |
| `src/core/status-display.ts` | One `{ label, description, tone }` record per enum |

---

### Task 1: One persist API — `persistProjectRows`

**Files:**
- Modify: `packages/db/src/repo/apply.ts`
- Modify: `packages/db/src/repo/apply.test.ts`
- Modify: `packages/db/src/project-write.ts` (re-export `persistProjectRows` as `persistProjectWrite` temporarily so Task 2 can delete it)
- Test: `packages/db/src/repo/apply.test.ts`

**Interfaces:**
- Consumes: existing `upsertFindings`, `upsertRemediations`, `upsertRequirements`, `insertAlerts`, `insertEvidenceRecords`, `updateProject`
- Produces:

```typescript
export interface ProjectWritePayload {
  findings?: Finding[];
  remediations?: Remediation[];
  requirements?: Requirement[];
  evidence?: EvidenceRecord[];
  alerts?: Alert[];
  project?: Project;
}

export interface PersistProjectRowsOptions {
  loadedRequirementUpdatedAtById?: ReadonlyMap<string, string>;
  loadedFindingUpdatedAtById?: ReadonlyMap<string, string>;
  loadedRemediationUpdatedAtById?: ReadonlyMap<string, string>;
}

export async function persistProjectRows(
  tx: DrizzleDb,
  payload: ProjectWritePayload,
  options: PersistProjectRowsOptions = {},
): Promise<void>
```

`persistProjectSlice(tx, loaded, after, evidence)` becomes a three-line wrapper that calls `persistProjectRows` with stale maps from `loaded`. `applyAssessmentPayload` keeps inserting the assessment then calls `persistProjectRows` (not the old slice function body).

- [ ] **Step 1: Write the failing test**

In `apply.test.ts`, add:

```typescript
describe("persistProjectRows", () => {
  it("upserts only provided rows and forwards stale guards", async () => {
    await persistProjectRows(
      tx,
      {
        findings: [finding],
        remediations: [remediation],
        requirements: [requirement],
        alerts: [alert],
        evidence,
      },
      {
        loadedRequirementUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
        loadedFindingUpdatedAtById: new Map([[finding.id, "2026-01-01"]]),
        loadedRemediationUpdatedAtById: new Map([[remediation.id, "2026-01-01"]]),
      },
    );
    expect(upsertFindings).toHaveBeenCalledWith(tx, [finding], {
      loadedUpdatedAtById: new Map([[finding.id, "2026-01-01"]]),
    });
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("no-ops when the payload is empty", async () => {
    await persistProjectRows(tx, {});
    expect(upsertFindings).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: undefined,
    });
    expect(updateProject).not.toHaveBeenCalled();
  });
});
```

Keep existing `persistProjectSlice` / `applyAssessmentPayload` tests; they must still pass via the wrapper.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/db/src/repo/apply.test.ts`
Expected: FAIL — `persistProjectRows` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add `persistProjectRows` in `apply.ts` with the same body as today’s `persistProjectWrite` (including `updateProject` when `payload.project` is set). Replace `persistProjectSlice` body with:

```typescript
export async function persistProjectSlice(
  tx: DrizzleDb,
  loadedSlice: ProjectSlice,
  after: ProjectSlice,
  evidence: ReadonlyArray<EvidenceRecord>,
): Promise<void> {
  await persistProjectRows(
    tx,
    {
      requirements: after.requirements,
      findings: after.findings,
      remediations: after.remediations,
      alerts: after.alerts,
      evidence: [...evidence],
    },
    {
      loadedRequirementUpdatedAtById: requirementUpdatedAtById(loadedSlice.requirements),
      loadedFindingUpdatedAtById: updatedAtById(loadedSlice.findings),
      loadedRemediationUpdatedAtById: updatedAtById(loadedSlice.remediations),
    },
  );
}
```

In `project-write.ts`, make `persistProjectWrite` call `persistProjectRows` (delete the duplicated upsert block).

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/db/src/repo/apply.test.ts packages/db/src/persist-project-slice.integration.test.ts`
Expected: PASS (skip integration if `DATABASE_URL` unset — unit file must pass).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repo/apply.ts packages/db/src/repo/apply.test.ts packages/db/src/project-write.ts
git commit -m "$(cat <<'EOF'
refactor: persist project rows through one function

Assessment slice apply and interactive writes were duplicating the same upserts.
EOF
)"
```

---

### Task 2: Drop the write collector — explicit payloads

**Files:**
- Modify: `src/server/workspace.ts` (`withProjectWrite`)
- Modify: `src/server/actions/shared.ts` (`replaceRemediation`)
- Modify: every `withProjectWrite(` caller listed below
- Modify: `src/server/workspace.test.ts`, `src/test-fixtures/action-workspace-mocks.ts`, `src/test-fixtures/register-action-workspace-mock.ts`
- Delete collector usage from `packages/db/src/project-write.ts` (`createProjectWriteCollector` + `ProjectWriteCollector`)
- Test: `src/server/workspace.test.ts`, `src/server/actions/remediation.test.ts`, `src/server/actions/remediation-workflow.test.ts`

**Interfaces:**
- Consumes: `persistProjectRows` from Task 1
- Produces:

```typescript
export async function withProjectWrite<T>(
  scope: ProjectWriteScope,
  fn: (workspace: Workspace) => Promise<{ result: T; payload: ProjectWritePayload }>,
): Promise<T>
```

Lock + targeted load + stale-guard capture stay. After `fn`, call `persistProjectRows(tx, payload, staleGuards)`. For `{ touch: "project" }`, if `payload.project` is omitted and `workspace.project` changed vs `structuredClone` before the fn, set `payload.project` (keep today’s safety net).

`replaceRemediation` becomes:

```typescript
export function replaceRemediation(
  payload: ProjectWritePayload,
  updated: ReturnType<typeof advanceRemediation>,
): void {
  payload.remediations = [...(payload.remediations ?? []), updated];
}
```

Call sites today (must all compile):

- `src/server/actions/assessment.ts`
- `src/server/actions/requirements.ts` (3)
- `src/server/actions/remediation.ts` (4)
- `src/server/actions/remediation-verify.ts` (3)
- `src/server/actions/remediation-ai.ts` (2)
- `src/server/actions/ai-fix.ts`
- `src/server/actions/pr.ts`
- `src/server/actions/runtime-audit.ts`
- `src/server/actions/project-preset.ts`
- `src/server/workspace.integration.test.ts`
- `src/server/workspace.test.ts`

Handlers must **not** mutate `db.findings` / `db.remediations` for persist. They may still *read* `workspace.db`. Build `payload` with the rows to upsert and evidence records (`newEvidenceRecord` / a small `evidenceEntry` helper that does not push onto `db.evidence`).

`addEvidence(db, …)` inside a write callback is forbidden after this task. Use `payload.evidence = [...(payload.evidence ?? []), record]`.

Mocks: `withProjectWrite(scope, fn)` calls `fn(workspace)` and ignores persist (tests that assert `persistProjectWrite` should assert `persistProjectRows` or the returned payload).

- [ ] **Step 1: Rewrite `workspace.test.ts` first** so it expects `fn` to return `{ result, payload }` and persist to be called with that payload (no collector).

- [ ] **Step 2: Run `npx vitest run src/server/workspace.test.ts`** — FAIL on signature.

- [ ] **Step 3: Change `withProjectWrite` and every caller.** Delete `createProjectWriteCollector`. Keep `ProjectWritePayload` exported from `apply.ts`.

- [ ] **Step 4: Run** `npx vitest run src/server/workspace.test.ts src/server/actions/remediation.test.ts src/server/actions/remediation-workflow.test.ts src/server/actions/requirements.ts src/server/actions/pr.test.ts src/server/actions/ai-fix.test.ts src/server/actions/runtime-audit.test.ts src/server/actions/connect.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: persist project writes from explicit payloads

Drop the in-memory collector so a write is the rows the handler returns.
EOF
)"
```

---

### Task 3: Assessment and org writes return payloads

**Files:**
- Modify: `src/server/assessment.ts`, `src/server/assessment-status.ts`, `src/server/assessment-findings.ts`, `src/server/ai-fix.ts`, `src/server/connect-github.ts`, `src/server/project-preset.ts`
- Modify: `src/server/workspace.ts` (`withOrgWrite`)
- Modify: `src/server/assessment-worker.ts` (apply returned payload)
- Test: `src/server/assessment.test.ts`, `src/server/assessment-status.test.ts`, `src/server/assessment-findings.test.ts`, `src/server/orgs.test.ts`, `src/server/actions/org-lifecycle.test.ts`

**Interfaces:**
- Consumes: `persistProjectRows`, `applyAssessmentPayload`, `buildAssessmentApplyPayload`
- Produces:

`runAssessment` still accepts a read-model `Db` for catalog/project/previous snapshot **or** (preferred) an input object `{ project, controls, requirements, findings, remediations, assessments }`. It **returns** `{ assessment, snapshot, evidence, findings, remediations, requirements, alerts }` — the worker persists via `applyAssessmentPayload`. In-memory `addEvidence(db)` and in-place `db.findings[i] =` during assessment are removed.

`refreshRequirementStatuses` / `reconcileControlFindings` take arrays (or a `ProjectSlice`) and **return** new arrays + evidence entries. They do not write to `db`.

`withOrgWrite`:

```typescript
export async function withOrgWrite<T>(
  fn: (ctx: {
    organizations: Organization[];
    memberships: OrgMembership[];
    userId: string;
    githubLogin: string | null;
  }) => Promise<{
    result: T;
    insertOrgs?: Organization[];
    upsertMemberships?: OrgMembership[];
    deleteMembershipIds?: string[];
    deleteOrgIds?: string[];
  }>,
): Promise<T>
```

Delete `JSON.stringify` before/after diffs.

- [ ] **Step 1:** Change `assessment-status.test.ts` / `assessment-findings.test.ts` so helpers return new arrays (TDD on one `refreshRequirementStatuses` case first).

- [ ] **Step 2:** Run the focused test — FAIL.

- [ ] **Step 3:** Implement return-value helpers; update `runAssessment` and the worker; update `withOrgWrite` callers in `src/server/actions/org.ts`.

- [ ] **Step 4:** Run `npx vitest run src/server/assessment.test.ts src/server/assessment-status.test.ts src/server/assessment-findings.test.ts src/server/assessment-worker.test.ts src/server/actions/org-lifecycle.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: assessment and org writes return rows to persist

Stop mutating the workspace Db to produce an assessment or org change.
EOF
)"
```

---

### Task 4: Catalog off `Db`; collapse adapters into `src/catalog/`

**Files:**
- Delete: `src/server/catalog.ts` (`withShippedCatalog`)
- Modify: `packages/db/src/types.ts` — `Db` has no `frameworks` / `controls`
- Modify: `packages/db/src/workspace-load.ts` — drop `emptyCatalog`
- Modify: `src/server/db.ts`, `src/server/workspace.ts` (`controlById` imports catalog)
- Move: `packages/adapters/src/**` → `src/catalog/` (controls, presets, guidance, registry)
- Delete: `packages/adapters/package.json` and adapter workspace; remove from root `workspaces` / `transpilePackages` / `build:adapters`
- Update all `@complyloop/adapters/...` imports to `@/catalog/...`
- Collapse `FrameworkAdapter`: one `shippedCatalog()`, `allFrameworkPresets()`, `guidanceFor(checkId)` — no adapter array, no empty WCAG `controls: []`
- Test: move `packages/adapters/src/*.test.ts` next to new modules; `catalog-coverage.test.ts` still passes

**Interfaces:**
- Consumes: Task 3 `Db` without needing catalog on the store
- Produces:

```typescript
// src/catalog/catalog.ts
export function shippedCatalog(): { frameworks: Framework[]; controls: Control[] }

export function controlById(controlId: string): Control  // throws PublicError if unknown

export function allFrameworkPresets(): FrameworkPreset[]
export function guidanceFor(checkId: CheckId): CheckGuidance
```

WCAG remains a `Framework` row + presets in `src/catalog/wcag/`.

- [ ] **Step 1:** Add `src/catalog/catalog.test.ts` asserting `controlById("ctl-img-alt")` works without a `Db`.

- [ ] **Step 2:** FAIL if function missing.

- [ ] **Step 3:** Move files, delete adapter package, strip `Db.frameworks/controls`, update imports.

- [ ] **Step 4:** Run `npx vitest run src/catalog src/server/workspace.test.ts` and `npx tsc --noEmit` until clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: load the compliance catalog from src/catalog

The catalog is compile-time data, not workspace state, and does not need a package.
EOF
)"
```

---

### Task 5: GitHub merge, check registry, derive `engine`

**Files:**
- Merge: `src/server/octokit.ts` + `src/server/github-repo.ts` + `src/server/github-access.ts` into `src/server/github.ts`; delete the three files; update imports
- Keep: `github-tokens.ts`, `github-app.ts`, `github-checks.ts`, `repo-checkout.ts`, `connect-github.ts`
- Modify: `packages/analysis-core/src/check-ids.ts`, `check-authority.ts`, `checks/registry.ts` — one registry entry `{ id, authority, analyzers?: AnalyzerId[] }` that authority lists are derived from. Do **not** change any check’s authority class.
- Modify: `RawFinding` / `Finding` — stop *requiring* stored `engine`; add `engineFromAnalyzer(analyzerId): AssessmentEngine` in `packages/analysis-core/src/contract/finding-types.ts`. UI filters call the helper. Keep `contributingAnalyzers`.
- Test: `packages/analysis-core/src/check-authority.test.ts`, existing github tests, `src/core/finding-list-filter.test.ts`

**Interfaces:**
- Produces:

```typescript
export function engineFromAnalyzer(analyzerId: AnalyzerId | undefined): AssessmentEngine {
  if (analyzerId === "axe" || analyzerId === "html-validate" || analyzerId === "playwright-custom" || analyzerId === "site-level" || analyzerId === "linkinator") {
    return "runtime";
  }
  return "ast";
}
```

Exhaustive `switch` with `never` default, not a boolean list.

- [ ] **Step 1:** Add `engineFromAnalyzer` tests for every `AnalyzerId`.

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement helper, derive engine in filter/UI, merge GitHub modules, derive authority lists from one registry. Snapshot current `authorityForCheck(id)` for every `CHECK_IDS` entry in a test so the registry move cannot flip a class.

- [ ] **Step 4:** `npx vitest run packages/analysis-core/src/check-authority.test.ts src/server/github.test.ts src/server/github-access.test.ts src/core/finding-list-filter.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: collapse GitHub helpers and derive finding engine

One GitHub client module, one check registry, engine from analyzerId.
EOF
)"
```

---

### Task 6: P2 — workspace split, query helpers, status-display, reports, dashboard

**Files:**
- Create: `src/server/workspace-write.ts` — move `withProjectWrite`, `withOrgWrite`, `withProjectLock` from `workspace.ts`
- Modify: `src/server/workspace.ts` — reads + `ensurePersonalOrgProvisioned` called only when `isPersonalOrgProvisioned` is false (already); move the provision *write* trigger to sign-in (`src/server/actions/auth.ts` or `src/auth.ts` after successful session) so GET does not provision. If moving off GET is unsafe for existing users who never hit sign-in again, keep the fast-path check on GET (one indexed read) — do **not** load a full workspace to provision.
- Create: `src/core/query.ts` — merge `query-param.ts`, `requirement-status-filter.ts`, `evidence-kind-filter.ts`, `report-view.ts`, `requirements-page.ts`, `evidence-links.ts` href helpers. Delete the old files; update imports.
- Create: `src/core/assessment.ts` — `latestAssessmentFor` + `runtimeCoverageSummary`. Delete `assessment-latest.ts`, `runtime-coverage.ts`.
- Modify: `src/core/status-display.ts` — one record per enum `{ label, description?, tone? }`; one `display()` helper. Keep exhaustive lookup.
- Modify: reports — move `report-view` hrefs into `report-model.ts` (if not already in `query.ts`); fold `report-html/requirements-section.ts` and `evidence-section.ts` into `report-html/shared.ts` or `audit.ts`/`engineering.ts`; delete the two tiny section files.
- Modify: `src/app/(app)/dashboard/page.tsx` — extract sections into `src/components/dashboard/` (stats, alerts, recent evidence, changes). Page loads data and composes. **Net new abstractions: zero.**
- Modify: `src/components/stateful-action-form.tsx` — remove `refreshOnSuccess` / `RefreshAfterSuccess`. Callers that set it must already call server `refresh()`; if one cannot, document in the action why and keep a single local `router.refresh()` in that form only (not a shared prop).
- Evidence kinds: do **not** migrate rows. Do not add kinds. No code change required unless a kind was added in this branch.
- Test: existing tests for moved modules; update import paths.

**Interfaces:**
- Re-export `withProjectWrite` from `workspace-write.ts` only. Update action imports.

- [ ] **Step 1:** Move one helper (`latestAssessmentFor`) to `src/core/assessment.ts` and fail/pass its existing test via new import.

- [ ] **Step 2–4:** Complete the merges; run `npx vitest run src/core src/server/workspace.test.ts src/server/report-model.test.ts src/server/report.test.ts src/components/dashboard src/components/stateful-action-form.test.tsx src/app/\(app\)/dashboard`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: split workspace writes and collapse display helpers

Read/write workspace modules and one query/status-display table per enum.
EOF
)"
```

---

### Task 7: P3 closeout — facades, types, docs, definition of done

**Files:**
- Delete leftover facades if unused: thin re-exports in `src/server/db.ts` (keep loaders that attach nothing), `src/server/finding-list-context.ts` (inline into findings page or `finding-list-filter.ts`)
- `projectCapabilities`: delete `src/server/project-capabilities.ts` and call `canOnProject` at use sites **or** keep the one helper and delete duplicate wrappers — pick **keep `projectCapabilities`** (used in many pages) and do not add another wrapper. If the file stays, skip deletion; only delete if inlining is fewer lines. Prefer **keep** if dashboard/findings already depend on the four booleans.
- `PublicError`: import from `@complyloop/analysis-core/contract/public-error` in new/touched files; remove re-export from `packages/db/src/types.ts` **only if** all app imports are updated (grep).
- `Finding` = persistence fields + `RawFinding` (intersection or `extends`). `createFinding` copies once.
- Fold `src/ai/warn.ts` into `src/ai/ai-call.ts`.
- `packages/db/src/schema.ts`: one comment that indexed columns are projections of `payload`; repo mappers are the only writers.
- Docs: trim duplicate stack lists in `AGENTS.md` / `CLAUDE.md` if they repeat `architecture.md`. Update `docs/ai/architecture.md` for persist + catalog + `src/catalog`.
- Delete `src/test-fixtures/register-action-workspace-mock.ts` and `action-workspace-mocks.ts` if Task 2 made them unused; otherwise slim them to `getWorkspace` only.
- Update `TODO-SIMPLICITY.md`: mark each item done with a one-line “landed in …” note.

**Interfaces:**
- `export type Finding = RawFinding & { id: string; projectId: string; … persistence fields }`

- [ ] **Step 1:** Grep `withShippedCatalog`, `createProjectWriteCollector`, `ProjectWriteCollector`, `@complyloop/adapters`, `refreshOnSuccess`, `src/server/octokit` — all must be gone.

- [ ] **Step 2:** `npm run lint && npm run typecheck && npm run test && npm run build`

- [ ] **Step 3:** Fix any fallout.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: finish simplicity closeout

Remove leftover facades, share RawFinding on Finding, and record the audit as done.
EOF
)"
```

---

## Spec coverage

| TODO item | Task |
| --------- | ---- |
| #1 write protocol | 2, 3 |
| #2 persist APIs | 1 |
| #3 catalog off Db | 4 |
| #4 FrameworkAdapter | 4 |
| #5 fold adapters package | 4 |
| #6 GitHub merge | 5 |
| #7 check registry | 5 |
| #8 derive engine | 5 |
| #9 workspace split / provision | 6 |
| #10 dashboard extract | 6 |
| #11 report modules | 6 |
| #12 core href files | 6 |
| #13 status-display tables | 6 |
| #14 evidence kinds (stop adding) | 6 (no migrate) |
| #15 RawFinding envelope | 7 |
| #16 refresh dual path | 6 |
| #17 PublicError import | 7 |
| #18 assessment files stay split | 3 (payloads only) |
| #19 JSONB comment | 7 |
| #20 facades | 4, 5, 7 |
| #21 projectCapabilities | 7 (keep if smaller) |
| #22 parseInput stays | 7 (no delete) |
| #23 fold warn.ts | 7 |
| #24 agent docs | 7 |
| #25 action mocks | 2, 7 |
