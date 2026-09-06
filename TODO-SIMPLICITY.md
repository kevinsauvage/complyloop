# TODO — Simplicity

Audit date: 2026-09-07 · Code is the source of truth.
Scope: the whole repo, judged by “same result with fewer concepts / files / moving parts.”
Constraint: do not drop stale-write protection, evidence append-only, fail-closed verify, RBAC, advisory locks, or analysis correctness.

## Verdict

The analysis engines (AST, jsx-a11y, axe, html-validate, Playwright probes) are large because RGAA coverage is large. That size is mostly **necessary**.

The accidental complexity is elsewhere: the app still behaves like an in-memory document store. Almost every write **loads arrays, mutates them, optionally remembers the mutation in a collector, then persists**. That protocol has two persist APIs, two evidence-insert styles, a compile-time catalog glued onto every `Db`, and a workspace module that has to understand all of it.

Assessment already has the simpler shape (`applyAssessmentPayload`). Interactive writes should look the same: **compute rows → upsert those rows**.

**How reductions are counted.** Each heading shows **net lines** after the change (deleted minus the smaller replacement). Moves that only relocate code are **~0**. Overlapping items say “included in #N” — do not sum those twice. Unique total if done in the suggested order: **~1,575 lines** of application/test/docs (plus ~100 package ceremony already in that figure), not 3,600 of catalog data.

---

## Leave alone

These look heavy and are not worth flattening:

| Mechanism                                           | Why it stays                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@complyloop/analysis-core` + `@complyloop/check`   | Real publish/CI boundary. The CLI must not pull Next/Drizzle.                             |
| Check authority classes + `deriveRequirementStatus` | Correctness. Empty AST must not pass runtime-only controls.                               |
| Advisory locks + `updatedAt` stale-write guards     | Prevents webhook apply from reverting a human decision.                                   |
| Evidence as a real insert-only table                | Product invariant.                                                                        |
| `getWorkspace` vs `getWorkspaceContext`             | Performance: layout must not load findings/evidence. Rename if unclear; do not merge.     |
| Dual GitHub auth (user OAuth + App installation)    | Product: selected-repo tokens in prod, `repo` scope in laptop demo.                       |
| Custom Playwright probes                            | Cover RGAA gaps axe does not. Review overlap before _adding_ more; do not delete the set. |
| jsx-a11y + custom AST                               | Engine rule: do not reimplement jsx-a11y.                                                 |
| Finding-act beats (`source_*` / `runtime_*`)        | The two remediation paths are the product.                                                |
| Inline job drain in dev/e2e                         | Local DX. Worker stays required in prod.                                                  |
| JSONB payloads for Finding/Remediation/Requirement  | Nested shapes would explode columns. Keep JSONB; treat indexed columns as projections.    |
| `controls.ts` / `guidance.ts` size                  | Catalog data, not abstraction.                                                            |

---

## P0 — Critical

### 1. Mutable in-memory `Db` is the write model — **~500 lines**

**What is unnecessarily complex**
Server code treats `Db` as a live store: handlers `find` on arrays, mutate objects, push evidence, and hope a side channel persists the change.

There are three incompatible write styles:

1. **Interactive project writes** — `withProjectWrite` loads a slice, handlers mutate `db.*` _and/or_ call `writes.upsert*()`, then `persistProjectWrite(writes.snapshot())`.
2. **Assessment apply** — `runAssessment` mutates the same arrays, then `persistProjectSlice(loaded, after, evidence)` upserts the whole slice.
3. **Org writes** — `withOrgWrite` mutates `db.organizations` / `db.memberships`, then diffs with `JSON.stringify` to decide insert/update/delete.

Forgetting the collector silently drops a write. Mutating without the collector does the same. Tests mock the whole protocol (`register-action-workspace-mock.ts`) because it is hard to exercise for real.

**Why it is a problem**
Every new action has to know the protocol. The domain helpers (`refreshRequirementStatuses`, `reconcileControlFindings`, `persistPatchCandidate`, `replaceRemediation`) take `Db` and mutate it. Persistence, locking, and business logic are coupled. This is more concepts than “update these rows.”

**How to simplify**
Keep locks and stale-write guards. Change the _shape_ of writes:

- Assessment: `runAssessment(input) → AssessmentApplyPayload`, then `applyAssessmentPayload`. Stop mutating a workspace `Db` to build the payload.
- Interactive: `withProjectWrite` gives a transaction + the loaded rows (or keep the lock helper and call repo functions). Return or pass the rows to upsert. No collector, no in-place array edits.
- Org: return `{ insertOrgs, upsertMemberships, deleteMembershipIds, deleteOrgIds }` instead of mutating arrays and JSON-diffing.

`Db` can remain a **read model** for pages (arrays are fine for rendering). It should not be a write API.

**Files**
`src/server/workspace.ts`, `packages/db/src/project-write.ts`, `packages/db/src/repo/apply.ts`, `src/server/assessment.ts`, `src/server/assessment-status.ts`, `src/server/assessment-findings.ts`, `src/server/ai-fix.ts`, `src/server/actions/shared.ts`, `src/server/actions/remediation*.ts`, `src/server/actions/requirements.ts`, `src/test-fixtures/register-action-workspace-mock.ts`

**Reduced code:** ~100 collector + ~50 org `JSON.stringify` diff + ~80 write-scope/stale-guard ceremony + ~70 action-workspace mocks + ~200 dual mutate-and-collect call sites/tests. Replacement payloads are shorter than the protocol they replace. Includes most of #2 and #18.

---

## P1 — High

### 2. Two persist APIs that do the same upserts — **~150 lines** (included in #1 if sequenced)

**What**
`persistProjectSlice` and `persistProjectWrite` both upsert findings / remediations / requirements and insert alerts / evidence. The difference is “before/after slice” vs “explicit payload + stale maps.” `addEvidence(db)` (in-memory push) and `writes.addEvidence` / `insertEvidenceRecords` are a third path.

**Why**
Callers must pick the right persist function. Assessment and UI writes look unrelated but write the same tables. Drift risk is real (`packages/db/src/repo/apply.test.ts` tests both).

**How**
One function: `persistProjectRows(tx, { findings, remediations, requirements, alerts, evidence, project }, staleGuards)`. Assessment and actions both call it. Delete the collector. `addEvidence` becomes “build an evidence record and put it on the payload,” not “push onto `db.evidence`.”

**Files**
`packages/db/src/repo/apply.ts`, `packages/db/src/project-write.ts`, `packages/db/src/repo/evidence.ts`, `src/server/db.ts`

**Reduced code:** ~30 `persistProjectWrite` + ~40 `persistProjectSlice` wrapper uniqueness + ~80 duplicate `describe` blocks in `apply.test.ts`. Standalone ~150; with #1, do not add again.

### 3. Compile-time catalog is glued onto every `Db` — **~100 lines**

**What**
Frameworks and controls are not in Postgres (good). Then every load reattaches them via `withShippedCatalog` so `db.controls` / `db.frameworks` look like stored data. `controlById(db, id)` searches that array. Empty catalog placeholders exist in `workspace-load.ts` only to be overwritten.

**Why**
A static list is treated as workspace state. Loaders, writes, and tests all thread `Db` just to reach catalog rows. `src/server/catalog.ts` exists only for this lie.

**How**
`Db` / workspace load return org + project runtime only. Import `shippedCatalog()` (or `controlById` from adapters) at the use site. Delete `withShippedCatalog`. Pages that need controls call the catalog once.

**Files**
`src/server/catalog.ts`, `src/server/db.ts`, `src/server/workspace.ts`, `packages/db/src/types.ts` (`Db.frameworks` / `Db.controls`), `packages/db/src/workspace-load.ts`

**Reduced code:** delete `catalog.ts` (10), `withShippedCatalog` wrappers/calls (~40), `emptyCatalog` placeholders (~15), `Db.frameworks`/`controls` + `emptyDb` fields (~15), `controlById(db)` indirection (~20).

### 5. `@complyloop/adapters` is a workspace package with one consumer — **~100 lines** (package ceremony; catalog data is a move)

**What**
Adapters is a published-shaped package (`dist/`, `publishConfig`, own `package.json`) imported only by this Next app, e2e, and scripts. Analysis-core and `complyloop-check` do not need it. Next must `transpilePackages` it.

**Why**
A fourth package (plus `db`) for static catalog data. Extra tsconfig, exports map, and mental “which package owns this?”

**How**
Move catalog/presets/guidance to `src/catalog/` (app-only). Keep `@complyloop/analysis-core` and `@complyloop/check`. `@complyloop/db` can stay if the worker/tests benefit from a persistence library — do not invent a fifth package.

**Files**
`packages/adapters/**`, `next.config.ts`, `package.json` workspaces

**Reduced code:** `package.json` / tsconfig.build / `transpilePackages` / extra `catalog.ts` + `catalog-ids` wrappers (~100). The ~3,600-line catalog/guidance **moves**, it does not shrink.

### 6. GitHub client split across nine modules — **~50 lines**

**What**
`octokit.ts` (33 lines), `github.ts`, `github-repo.ts`, `github-access.ts`, `github-tokens.ts`, `github-app.ts`, `github-checks.ts`, `repo-checkout.ts`, `connect-github.ts`.

**Why**
Listing a repo, minting a token, and cloning are one connector. Nine files make the connect/assess path harder to follow than the work it does.

**How**
Merge the thin client pieces:

- `octokit.ts` + `github.ts` + `github-repo.ts` + `github-access.ts` → `github.ts`
- Keep `github-tokens.ts` (crypto), `github-app.ts` (installations), `github-checks.ts` (Check Runs), `repo-checkout.ts` (temp clone), `connect-github.ts` (project connect/disconnect)

Do not merge token encryption into Octokit helpers.

**Files**
`src/server/octokit.ts`, `src/server/github.ts`, `src/server/github-repo.ts`, `src/server/github-access.ts`, and the keep-separate files above

**Reduced code:** merge 233 lines in 4 files into one module — save re-exports, duplicate Octokit construction, and file headers (~50). Logic stays.

### 7. Adding a check id touches six places — **~100 lines**

**What**
Architecture already lists the ceremony: `CHECK_IDS` → registry or jsx-a11y map → authority list → runtime map → catalog `checkId` → `guidance.ts`.

**Why**
Easy to ship a check that never affects status, or a catalog row with no engine. The lists (`RUNTIME_ONLY_CHECK_IDS`, `COMPOSITION_SENSITIVE_CHECK_IDS`, `HTML_VALIDATE_OWNED_CHECK_IDS`, package twins) are parallel sources of truth.

**How**
One registry entry per check:

```ts
{ id, authority, analyzers?: AnalyzerId[], catalogControlId?: string }
```

Guidance copy can stay beside the catalog. Tests stay on `catalog-coverage` + authority. Do not collapse authority _classes_ — only the registration lists.

**Files**
`packages/analysis-core/src/check-ids.ts`, `packages/analysis-core/src/check-authority.ts`, `packages/analysis-core/src/checks/registry.ts`, `packages/analysis-core/src/jsx-a11y-map.ts`, `packages/analysis-core/src/runtime/axe-map.ts`, `packages/adapters/src/rgaa/controls.ts`, `packages/adapters/src/rgaa/guidance.ts`

**Reduced code:** duplicate id lists (`CHECK_IDS` + authority arrays + maps). One registry object replaces the parallel arrays (~100). Guidance copy and check implementations stay.

### 8. Finding provenance is three overlapping fields — **~50 lines**

**What**
A finding carries `engine` (`ast` \| `runtime`), `analyzerId` (7 analyzers), and `contributingAnalyzers[]`. Architecture already says `engine` is derived from `analyzerId`. Merge/dedupe still copies all three.

**Why**
Callers branch on `engine`, then again on `analyzerId`. UI filters expose `ast`/`runtime` while evidence talks about axe vs html-validate.

**How**
Store `analyzerId` (and contributors for dedupe). Derive `engine` at the boundary (`analyzerId === "ast" | "jsx-a11y"` → ast). Keep `AssessmentEngines` on the assessment (what ran), not duplicated on every finding.

**Files**
`packages/analysis-core/src/contract/finding-types.ts`, `packages/analysis-core/src/types.ts` (`RawFinding`), `packages/db/src/types.ts` (`Finding`), `packages/analysis-core/src/runtime/dedupe-runtime-findings.ts`, `src/core/finding-list-filter.ts`

**Reduced code:** drop stored `engine` on findings + copy/merge branches (~40) and add one `engineFromAnalyzer` helper (~10). Net ~50.

---

## P2 — Medium

### 9. `workspace.ts` mixes session load, org provision, and write transactions — **~40 lines** (split is a move)

**What**
514 lines: cookie/session workspace, personal-org provision on GET, project write locks, targeted entity loads, org write JSON-diff.

**Why**
Hard to change one path without reading all three. Provision-on-read is a side effect hidden in `getWorkspace`.

**How**
After P0, split into `workspace-load.ts` (getWorkspace\*) and `workspace-write.ts` (locks + persist). Provision personal org from the auth/sign-in path, not every workspace read (the fast-path `isPersonalOrgProvisioned` already exists — move the remainder off the GET render).

**Files**
`src/server/workspace.ts`, `src/server/orgs.ts`, `src/auth.ts`

**Reduced code:** splitting the file is **~0**. Moving personal-org provision off GET saves the provision block from the read path (~40). Most write shrinkage is already in #1.

### 10. Dashboard is an 860-line page — **~0 lines** (extract, not delete)

**What**
`src/app/(app)/dashboard/page.tsx` inlines stats, alerts, evidence, changes, connect empty states, and job status. Several dashboard components already exist beside it.

**Why**
The first screen is the hardest file to change. Logic (counts, latest assessment, capabilities) sits in the route.

**How**
Route: load workspace → pass props. Move sections into `src/components/dashboard/` (the folder already has chips/checklist/counts). Keep data loading in the page or a `dashboard-data.ts` next to it — no new “dashboard manager.”

**Files**
`src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`

**Reduced code:** ~0 net — sections move into `components/dashboard/`. The route should drop to ~150–200; the rest relocates.

### 11. Report pipeline is eight modules for two formats — **~60 lines**

**What**
`report.ts` (load) + `report-model.ts` (shape) + `report-view.ts` (query param) + `report-markdown.ts` + `report-html/{shared,audit,engineering,requirements-section,evidence-section}.ts`.

**Why**
Two outputs (markdown/HTML) × two views (audit/engineering) do not need a folder of section files plus a separate view-param module.

**How**
`report-model.ts` (input + view type + hrefs). One `report-markdown.ts`. One `report-html.ts` (or `shared` + `audit`/`engineering` if HTML stays large). Delete `report-view.ts` by moving three functions into the model.

**Files**
`src/server/report.ts`, `src/server/report-model.ts`, `src/core/report-view.ts`, `src/server/report-markdown.ts`, `src/server/report-html/*`

**Reduced code:** delete `report-view.ts` (18) and HTML section file wrappers (`requirements-section` 46 + `evidence-section` 27 + extra imports). Renderers stay (~1,200 lines of HTML/markdown).

### 12. `src/core` is many one-purpose modules — **~60 lines**

**What**
Tiny files that only wrap `parseEnumParam` / `buildHref`: `requirement-status-filter.ts` (18), `evidence-kind-filter.ts` (28), `report-view.ts` (18), `query-param.ts` (29), `requirements-page.ts` (32), `assessment-latest.ts` (21), `evidence-links.ts` (23), `format-datetime.ts` (23), `runtime-coverage.ts` (43).

**Why**
A filter or href change means hunting a file named for one page. The split does not isolate risk — these are 10–40 line helpers.

**How**
`src/core/query.ts` — `firstParam`, `parseEnumParam`, `buildHref`, and the page href helpers. `src/core/assessment.ts` — `latestAssessmentFor` + `runtimeCoverageSummary`. Leave `rbac.ts`, `remediation.ts`, `status-display.ts`, `finding-act.ts`, `finding-list-filter.ts`, `root-cause.ts` as they are (real logic).

**Files**
`src/core/query-param.ts`, `src/core/requirement-status-filter.ts`, `src/core/evidence-kind-filter.ts`, `src/core/report-view.ts`, `src/core/requirements-page.ts`, `src/core/assessment-latest.ts`, `src/core/evidence-links.ts`, `src/core/runtime-coverage.ts`

**Reduced code:** ~8 file headers + duplicate `parseEnumParam`/`buildHref` wrappers (~60). Helpers themselves stay (~200). `report-view.ts` counted in #11 — do not add 18 twice.

### 13. Status display is parallel maps per enum — **~100 lines**

**What**
360 lines: for each enum, a Label record, a Description record, sometimes a Tone record, plus `lookupExhaustive` wrappers. Evidence kinds special-case `detail.event` / `detail.phase` on top.

**Why**
Adding a status means editing 2–4 tables and hoping they stay aligned. Tone and label are the same concept (how this value appears).

**How**
One record per enum: `{ label, description, tone }`. One helper `display(record, key)`. Keep exhaustive lookup. Do not invent a generic “status framework.”

**Files**
`src/core/status-display.ts`, `src/core/unable-to-verify-reason.ts`

**Reduced code:** one `{ label, description, tone }` per enum collapses ~360 + 57 into ~280 (~100 wrappers/duplicate records gone).

### 14. Evidence kinds keep growing — **~30 lines** (stop adding; no historical rewrite)

**What**
23 `EvidenceKind` values. Several are the same event with a different noun (`requirement_exception_set` / `_cleared`, `requirement_human_passed` / `_cleared`, `remediation_*`). Labels already branch on `detail` for `finding` and `assessment_job`.

**Why**
Each kind needs a label, a tone, sometimes a filter chip, and a mapper. New product events add another union member.

**How**
Do not migrate old rows (append-only). Stop adding kinds: reuse `requirement_status_changed` / `finding` / `assessment_job` with a `detail` discriminant. Filter chips stay a short allow-list (`EVIDENCE_KIND_FILTER_ORDER`), not the full union.

**Files**
`packages/db/src/types.ts`, `src/core/status-display.ts`, `src/core/evidence-kind-filter.ts`

**Reduced code:** fewer union members in label/tone tables (~30). Existing rows stay. The win is not adding ~15 lines per new kind.

### 15. `RawFinding` and `Finding` duplicate the same fields — **~40 lines**

**What**
`packages/analysis-core/src/types.ts` (`RawFinding`) and `packages/db/src/types.ts` (`Finding`) both have checkId, kind, severity, confidence, reason, location, engine, analyzer\*, fix. `createFinding` copies one into the other.

**Why**
Two types for “an observation.” Persistence fields (id, projectId, status, explanations) belong on Finding; the rest is the scan result.

**How**
`Finding` = persistence envelope + `RawFinding` (or `Omit` + ids). One place for analyzer fields. Do not put `Db` types into analysis-core.

**Files**
`packages/analysis-core/src/types.ts`, `packages/db/src/types.ts`, `src/server/assessment-findings.ts`

**Reduced code:** `Finding` becomes envelope + `RawFinding`; `createFinding` field-copy shrinks (~40). Types, not runtime bulk.

### 16. Two ways to refresh after a Server Action — **~25 lines**

**What**
`refresh()` in `actions/shared.ts` calls `revalidatePath("/", "layout")`. `StatefulActionForm` also has `refreshOnSuccess` → client `router.refresh()`. Forms pick one or both.

**Why**
Unclear which is required for a given action. Extra client component (`RefreshAfterSuccess`) for something the server already does.

**How**
Default: server `refresh()` on success. Use client refresh only if a specific action cannot revalidate (document why). Remove the prop from forms that already revalidate.

**Files**
`src/server/actions/shared.ts`, `src/components/stateful-action-form.tsx`

**Reduced code:** `RefreshAfterSuccess` + `refreshOnSuccess` prop (~20) and 3 form call sites. Server `refresh()` stays.

### 17. `PublicError` lives in analysis-core and is re-exported as “canonical” from db — **~10 lines**

**What**
`packages/analysis-core/src/contract/public-error.ts` — comment in `packages/db/src/types.ts` explains this is to avoid a cycle because runtime audits throw it. App code imports from `@complyloop/db/types`.

**Why**
A UI/HTTP error type is in the scan engine. Two import paths. The cycle argument is the leftover of treating analysis-core as the shared kernel for everything.

**How**
Keep the class in analysis-core (runtime already throws it) **or** move it to `packages/analysis-core/src/contract/` and import that from app/db (already the case). Pick **one** import: `@complyloop/analysis-core/contract/public-error`. Stop re-exporting from db.

**Files**
`packages/analysis-core/src/contract/public-error.ts`, `packages/db/src/types.ts`, app imports of `PublicError`

**Reduced code:** re-export + comment in `packages/db/src/types.ts` (~10). Import paths change; the class stays.

### 18. Assessment orchestration is six files that all mutate `Db` — **~0 extra** (included in #1)

**What**
`assessment.ts`, `assessment-findings.ts`, `assessment-status.ts`, `assessment-jobs.ts`, `assessment-worker.ts`, `assessment-job-drain.ts`. Status + findings modules are ~300 lines of array mutation around a 30-line `deriveRequirementStatus` call.

**Why**
File split is fine; the shared `Db` parameter is the cost (P0). After writes are payloads, these files become “pure functions over findings/requirements” + “job table CRUD” — keep the split.

**How**
Do not merge the six files. After P0, `assessment-status.ts` / `assessment-findings.ts` should take arrays (or a `ProjectSlice`) and return new arrays, not mutate `db`.

**Files**
`src/server/assessment*.ts`

**Reduced code:** 0 beyond #1. Do not merge the six files. Mutation-to-payload is the #1 reduction.

### 19. Indexed columns + full JSONB payload — **~0 lines** (document only)

**What**
Every domain table stores `payload jsonb` _and_ copies `id` / `status` / `projectId` / … into columns. `*ToRow` mappers keep them in sync.

**Why**
Mental model: “which is source of truth?” Bugs are “column says open, payload says dismissed.”

**How**
Keep the pattern (indexes need columns). Make repo functions the only writers: callers pass the domain object; mappers always derive columns from payload. Never construct a row by hand. Document in `packages/db/src/schema.ts` (already half-said). No full normalization.

**Files**
`packages/db/src/schema.ts`, `packages/db/src/repo/mappers.ts`

**Reduced code:** ~0. Keep JSONB. A comment in `schema.ts` is the change.

---

## P3 — Low

### 20. Thin app facades over packages — **~40 lines** (after #3 and #6)

**What**
`src/server/db.ts` re-exports `Db`, `emptyDb`, `addEvidence` and wraps loaders. `src/server/catalog.ts` is 11 lines. `src/server/finding-list-context.ts` is 27 lines wrapping core filters. `src/server/octokit.ts` is 33 lines.

**Why**
An extra hop to find the real function. Fine as a temporary app entry; not worth as a permanent layer once P1 #3 and #6 land.

**How**
Import `@complyloop/db/workspace-load` and `@complyloop/db/types` from server code. Delete facades that only re-export.

**Files**
`src/server/db.ts`, `src/server/catalog.ts`, `src/server/finding-list-context.ts`, `src/server/octokit.ts`

**Reduced code:** leftover `db.ts` wrappers + `finding-list-context.ts` (27). `catalog.ts` and `octokit.ts` are already in #3 / #6 — do not add 10+31 again. Standalone (if done first) ~120.

### 21. `projectCapabilities` vs `canOnProject` — **~90 lines**

**What**
`project-capabilities.ts` maps four booleans by calling `canOnProject` four times. UI then reads `canRemediate` instead of the permission string.

**Why**
Two APIs for the same RBAC. Small, but new screens invent a fifth boolean.

**How**
Call `canOnProject(..., "project.remediate")` at the use site, or keep one `projectCapabilities` and delete other wrappers. Do not add both.

**Files**
`src/server/project-capabilities.ts`, `src/core/rbac.ts`, dashboard/findings pages

**Reduced code:** delete the wrapper (49) + its test (91); inline `canOnProject` at a few call sites (~+20). Net ~90.

### 22. Dual form parsers — **~0 lines**

**What**
`src/core/boundary.ts` has `parseUnknown` + Zod field helpers. `src/server/boundary.ts` has `parseForm`, `parseFormState`, `parseInput` — three ways to fail a form.

**Why**
Actions mix throw-`PublicError` and return-`ActionMessageState`. The split is justified (core must not import server). The three server parsers are one idea.

**How**
Keep `parseForm` (throw) and `parseFormState` (return state). Make `parseInput` a thin alias or delete if unused. Leave core Zod helpers.

**Files**
`src/server/boundary.ts`, `src/core/boundary.ts`

**Reduced code:** ~0. `parseInput` is used by actions and API routes — do not delete it. No extra parser to add.

### 23. AI stack is already small — do not add layers — **~10 lines**

**What**
`src/ai/{ai-call,model,schemas,explainer,remediation,patch,verified-fix,warn}.ts` plus `src/server/ai-fix.ts` plus `src/server/actions/ai-fix.ts` / `remediation-ai.ts`.

**Why**
The layering is correct (generate → persist → action). `ai-call.ts` is a useful 60-line shell. Further “AI gateway” helpers would be speculative.

**How**
No new AI abstraction. If anything, fold `warn.ts` into `ai-call.ts`.

**Files**
`src/ai/*`, `src/server/ai-fix.ts`

**Reduced code:** fold `warn.ts` (24) into `ai-call.ts` (~10 net). Do not add new AI helpers.

### 24. Agent/docs overlap — **~80 lines**

**What**
`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*`, `docs/ai/architecture.md` repeat stack, loop, and module maps.

**Why**
Agents get conflicting short lists. Not runtime complexity, but it produces duplicate “source of truth.”

**How**
Pointers only in `AGENTS.md` / `CLAUDE.md` (already the intent). Architecture stays the system map. Do not add another overview.

**Files**
`AGENTS.md`, `CLAUDE.md`, `docs/ai/architecture.md`

**Reduced code:** duplicate stack/loop/module lists in `AGENTS.md` / `CLAUDE.md` (~80). Architecture stays. Docs, not runtime.

### 25. Test fixture factories — **~70 lines** (included in #1 if sequenced)

**What**
`src/test-fixtures/{project,finding,workspace,membership,control,action-workspace-mocks}.ts` plus `packages/db/src/test-fixtures/`. The action mocks exist because of P0.

**Why**
Two fixture systems (app vs db integration). After writes are repo calls, action tests can use db fixtures or thin object literals.

**How**
Do not add more factories. Prefer one object literal in the test. Delete `register-action-workspace-mock` when P0 removes `withProjectWrite`’s collector.

**Files**
`src/test-fixtures/*`, `packages/db/src/test-fixtures/*`

**Reduced code:** delete `register-action-workspace-mock.ts` (37) + `action-workspace-mocks.ts` (31) after #1. Other factories stay. Included in #1.

---

## Totals (unique, suggested order)

Do not add overlapping items (#2, #18, #25 into #1; #20 catalog/octokit into #3/#6).

| Priority         | Unique net | What that is                                                                                |
| ---------------- | ---------: | ------------------------------------------------------------------------------------------- |
| P0               |       ~500 | Write protocol + persist APIs + action mocks                                                |
| P1               |       ~490 | Catalog-in-Db, adapter registry, package ceremony, GitHub merge, check lists, `engine`      |
| P2               |       ~365 | Provision-off-GET, reports, core hrefs, status-display, evidence kinds, RawFinding, refresh |
| P3               |       ~220 | Leftover facades, `projectCapabilities`, `warn.ts`, agent-doc overlap                       |
| **Unique total** | **~1,575** | Application + test + docs. Catalog **data** (~3,600) is a move, not a cut.                  |

Dashboard (#10) and JSONB (#19) are ~0. File splits without deletion are ~0.

## Suggested order

1. **P0 #1 + P1 #2** — ~500 lines. One write path. Biggest drop in concepts.
2. **P1 #3** — ~100. Catalog out of `Db`.
3. **P1 #4–#5** — ~190. Adapters become app catalog data.
4. **P1 #6–#8** — ~200. GitHub merge, check registry, derive `engine`.
5. **P2** — ~365. Reports, hrefs, status-display. Dashboard extract is ~0 net.
6. **P3** — ~220. Delete leftover facades.

Do not start with file-merges in `src/core` or report HTML. Those save files, not concepts. The write protocol is the concept to remove.
