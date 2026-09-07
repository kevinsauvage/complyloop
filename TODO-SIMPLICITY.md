# TODO — Simplicity

Audit date: 2026-09-07 (re-audited against live code; completed end-to-end) · Code is the source of truth — do not trust docs over `src/` / `packages/`.
Scope: whole repo, judged by “same result with fewer concepts / files / moving parts.”
Constraint: do not drop stale-write protection, evidence append-only, fail-closed verify, RBAC, advisory locks, or analysis correctness.

## Verdict

The analysis engines (AST, jsx-a11y, axe, html-validate, Playwright probes, linkinator) are large because RGAA coverage is large. That size is mostly **necessary**.

Accidental complexity that **remains** is mostly P1+: evidence still has three creation styles (`addEvidence` / `evidenceEntry` / `insertEvidence*`), connect bypasses `withProjectWrite`, check registration is parallel id lists, adapters package ceremony.

**P0 write path is done:** Assessment and interactive actions compute rows → upsert. `runAssessment` does not mutate the loaded `Db`. Status refresh has one return shape. **P2 report HTML merge is done** — `report-html/` is two files (`report.ts` + `shared.ts`).

**How reductions are counted.** Each heading shows **net lines** after the change (deleted minus smaller replacement). Moves that only relocate code are **~0**. Overlapping items say “included in #N” — do not sum those twice. Unique total if done in the suggested order: **~900–1,100 lines** of application/test/docs (plus ~100 package ceremony), not counting catalog/guidance **data** (~2,900 lines: `controls.ts` 1,803 + `guidance.ts` 836 + presets/themes/registry ≈ 290) — a move, not a cut.

**Stale plan note.** `docs/superpowers/plans/2026-09-07-simplicity.md` still maps an older TODO numbering (#1–#25 with collector/FrameworkAdapter items). Treat this file as the spec; rewrite or delete that plan before implementing.

---

## Already done (do not re-open)

Verified in code; prior TODO / plan items that are obsolete:

| Former claim                                                                   | Current state                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Collector / `writes.snapshot()` / `persistProjectWrite`                        | Deleted. Interactive path returns `ProjectWritePayload` → `persistProjectRows`.                                      |
| Catalog glued onto every `Db` / `withShippedCatalog` / `src/server/catalog.ts` | Gone. `Db` has no `frameworks`/`controls`. Catalog is `shippedCatalog()` from adapters.                              |
| Org writes via `JSON.stringify` diff                                           | Gone. `withOrgWrite` returns `OrgWritePayload`.                                                                      |
| `workspace.ts` as one 500+ line load+write module                              | Split: `workspace.ts` (~221 read/provision) + `workspace-write.ts` (~288).                                           |
| Tiny `src/core/*-filter.ts` / `report-view.ts` modules                         | Merged into `src/core/query.ts`. Orphan _test file names_ remain (they import `./query`).                            |
| `packages/db/src/project-write.ts`                                             | Does not exist.                                                                                                      |
| Frameworks/controls Postgres tables                                            | Init migration comment: catalog lives in adapters, not schema.                                                       |
| Status enum duplication across packages                                        | Single source: `packages/analysis-core/src/contract/statuses.ts`.                                                    |
| `src/ai/warn.ts` module                                                        | Folded into `ai-call.ts`. Only `warn.test.ts` name remains.                                                          |
| `refreshOnSuccess` / `RefreshAfterSuccess` on forms                            | Gone from `stateful-action-form.tsx`.                                                                                |
| Assessment mutates live `Db` then returns arrays (P0 #1)                       | `runAssessment` clones into `ProjectRows`; returns apply-shaped result; worker applies directly.                     |
| Interactive mutate + payload hybrid (P0 #2)                                    | Actions clone onto payload; refresh returns `{ requirements, evidence }`; `persistPatchCandidate` requires payload.  |
| Report HTML thin section files (P2 #15)                                        | `report-html/` is now `report.ts` + `shared.ts`; the two renderers and four section files collapsed into one module. |

---

## Leave alone

These look heavy and are not worth flattening:

| Mechanism                                                                    | Why it stays                                                                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@complyloop/analysis-core` + `@complyloop/check`                            | Real publish/CI boundary. CLI must not pull Next/Drizzle.                                                                                         |
| `@complyloop/db` as a workspace package                                      | Shared by Next app, worker, scripts, and tests. Unlike adapters, this is a real persistence boundary — keep the package; do not fold into `src/`. |
| Check authority classes + `deriveRequirementStatus`                          | Correctness. Empty AST must not pass runtime-only controls.                                                                                       |
| Advisory locks + `updatedAt` stale-write guards                              | Prevents webhook apply from reverting a human decision.                                                                                           |
| Evidence as a real insert-only table                                         | Product invariant.                                                                                                                                |
| `getWorkspace` vs lighter context loads                                      | Layout must not load findings/evidence. Rename if unclear; do not merge.                                                                          |
| Dual GitHub auth (user OAuth + App installation)                             | Product: selected-repo tokens in prod, `repo` scope in laptop demo.                                                                               |
| Custom Playwright probes + linkinator                                        | Cover RGAA gaps axe does not. Review overlap before _adding_ more.                                                                                |
| jsx-a11y + custom AST                                                        | Engine rule: do not reimplement jsx-a11y.                                                                                                         |
| Finding-act beats (`source_*` / `runtime_*`)                                 | The two remediation paths are the product.                                                                                                        |
| Inline job drain in dev/e2e                                                  | Local DX. Worker stays required in prod.                                                                                                          |
| Assessment job queue (enqueue/claim/retry/idempotency)                       | Needed for durable webhook + manual assess outside request timeouts.                                                                              |
| JSONB payloads + indexed column projections                                  | Nested shapes would explode columns. Keep JSONB; treat indexed columns as projections.                                                            |
| `controls.ts` / `guidance.ts` size                                           | Catalog data, not abstraction.                                                                                                                    |
| Marketing `(marketing)` vs app `(app)`                                       | Correct Next route-group split.                                                                                                                   |
| shadcn `components/ui/*`                                                     | Real consumers; not decorative wrappers.                                                                                                          |
| AI stack (`ai-call` + typed schemas + verified-fix)                          | Thin and status-safe. Do not add an “AI gateway” layer.                                                                                           |
| Server actions split by domain                                               | Matches “one domain file, no barrels”; fine once writes are pure.                                                                                 |
| `finding-list-filter.ts` (~236)                                              | Real list UX (tabs, filters, queue prev/next). Do not split for aesthetics.                                                                       |
| Dual `navAttentionCounts` (in-memory) + `navAttentionForProject` (SQL)       | Matches hydrated workspace vs layout-without-findings.                                                                                            |
| Zod: `src/core/boundary.ts` schemas + `src/server/boundary.ts` parse helpers | Correct core/server split.                                                                                                                        |
| Clustering / prioritization (`root-cause`, `prioritization`)                 | Used by findings list, dashboard, reports.                                                                                                        |

---

## P0 — Critical

### ~~1. Assessment still mutates a live `Db`, then returns those arrays~~ — **DONE**

Landed: `runAssessment` clones project rows into `ProjectRows`, mutates only the scratch, returns apply-shaped `{ assessment, findings, remediations, requirements, evidence }`. Worker applies that payload directly (no `buildAssessmentApplyPayload` filter). Tests use `materializeAssessmentRun` for in-memory continuity.

### ~~2. Interactive writes are hybrid: mutate object + remember on payload~~ — **DONE**

Landed: actions clone findings/requirements/remediations onto the payload; `refreshRequirementStatuses*` returns `{ requirements, evidence }` with no `Db` mutation and no optional `payload` branch; `persistPatchCandidate` requires an explicit payload. Helpers: `mergeRefreshIntoPayload`, `findingsWithPayloadOverrides`.

---

## P0 (historical detail — kept for context)

## P1 — High

### 3. Three evidence creation styles — **~40–60**

**What**

1. `addEvidence(db)` — in-memory `db.evidence.push` (assessment, connect-github, ai-fix, project-preset, status refresh without payload).
2. `evidenceEntry(payload)` — UI actions (`actions/shared.ts`).
3. `insertEvidence` / `insertEvidenceRecords` — worker, connect action loops, `persistProjectRows`.

Also `newEvidenceRecord` already exists in mappers — the missing piece is using it everywhere.

**Why**
One append-only concept, three APIs. Assessment evidence is “slice from `db.evidence` after mutations”; UI evidence is “list on payload”; connect loops `db.evidence.slice(evidenceStart)`.

**How**
One builder: `newEvidenceRecord` → put on payload / pass to `insertEvidenceRecords`. Delete `addEvidence`. Stop re-exporting it from `src/server/db.ts`. Connect/assessment stop using `evidenceStart` slices.

**Files**
`packages/db/src/repo/evidence.ts`, `src/server/actions/shared.ts`, `src/server/db.ts`, `src/server/connect-github.ts`, `src/server/assessment*.ts`, `src/server/ai-fix.ts`, `src/server/project-preset.ts`

**Reduced code:** `addEvidence` + `evidenceStart` bookkeeping (~40–60). Overlaps #1/#4 call-site cleanups.

---

### 4. Connect/disconnect is a third write style — **~40–70**

**What**
`connect-github.ts`: `db.projects.push` + `addEvidence`.
`project-cascade.ts`: filters in-memory `db.*` arrays (only useful for the mutate-Db protocol).
`actions/connect.ts`: load workspace → mutate → `insertProject` / `deleteProject` + loop `insertEvidence` on `db.evidence.slice(evidenceStart)`. Bypasses `withProjectWrite` / `persistProjectRows`.

**Why**
Same tables, third protocol. Easy to miss evidence or project fields when the payload path evolves. Cascade helpers become dead once writes stop mutating `Db`.

**How**
Connect returns `{ project, evidence }`; disconnect returns `{ deleteProjectId, evidence, nextProjectId }` (SQL deletes for scoped rows, not in-memory filter). One TX helper (lock + insert/delete + `insertEvidenceRecords`). No in-memory project list mutation for persistence. Delete or shrink `removeProjectScopedRecords` once unused.

**Files**
`src/server/connect-github.ts`, `src/server/actions/connect.ts`, `src/server/project-cascade.ts`

---

### 5. `withProjectWrite` ceremony beyond locks — **~80–120**

**What** (`workspace-write.ts` ~288)
Justified: advisory lock, preferred-project → reload if cookie stale, entity stale maps.
Extra:

- Dual `touch: "project" | "entities"` with different loaders (`loadTargetedProjectWriteDb` ~80 LOC in `packages/db/src/workspace-load.ts`).
- Callers still receive a full mutable `Workspace` / `Db`.
- `touch: "project"` auto-detects project changes via `JSON.stringify(projectBefore/After)` (~15 LOC) — the org-diff smell, reintroduced for projects.

**Why**
Scope typing helps perf but couples every action to load semantics. JSON-diff means a handler can mutate `workspace.project` and “forget” `payload.project` — still works, so the payload contract is optional for projects.

**How**
Require explicit `payload.project` (delete stringify auto-persist). Keep targeted SQL load as a pure loader. Prefer “lock + load rows + return rows to upsert” over a fake mini-store. Do not remove locks or stale maps.

**Files**
`src/server/workspace-write.ts`, `packages/db/src/workspace-load.ts`

---

### 6. Check registration is many parallel id lists — **~100**

**What**
Adding a check id touches: `CHECK_IDS` → registry or jsx-a11y map → authority lists (`RUNTIME_ONLY_*`, `COMPOSITION_SENSITIVE_*`, `HTML_VALIDATE_OWNED_*`, site-level, heuristic, package twins) → runtime/axe map → catalog `checkId` → `guidance.ts`.

**Why**
Easy to ship a check that never affects status, or a catalog row with no engine. Parallel sources of truth.

**How**
One registry entry per check:

```ts
{ id, authority, analyzers?: AnalyzerId[], catalogControlId?: string }
```

Guidance copy stays beside the catalog. Keep authority _classes_ and `deriveRequirementStatus` — collapse only the registration lists. Coverage tests stay.

**Files**
`packages/analysis-core/src/check-ids.ts`, `packages/analysis-core/src/check-authority.ts`, `packages/analysis-core/src/checks/registry.ts`, `packages/analysis-core/src/jsx-a11y-map.ts`, `packages/analysis-core/src/runtime/axe-map.ts`, `packages/adapters/src/rgaa/controls.ts`, `packages/adapters/src/rgaa/guidance.ts`

**Reduced code:** duplicate id lists (~100). Implementations and guidance data stay.

---

### 7. `@complyloop/adapters` is a workspace package with one real consumer class — **~80–100** (ceremony; data is a move)

**What**
Published-shaped package (`dist/`, `publishConfig`, own `package.json` / tsconfig) imported by the Next app, e2e, and scripts. Analysis-core and `complyloop-check` do **not** need it. Next must transpile it.

**Why**
Fourth package (plus `db`) for static catalog data. Extra mental “which package owns this?”

**How**
Move catalog/presets/guidance to `src/catalog/` (app-only), **or** keep the folder but drop publish/dist ceremony. Keep `@complyloop/analysis-core`, `@complyloop/check`, and `@complyloop/db`. Do not invent a fifth package.

**Files**
`packages/adapters/**`, `next.config.ts`, `package.json` workspaces

**Reduced code:** package ceremony (~80–100). The ~2,900-line catalog/guidance **moves**, it does not shrink.

---

## P2 — Medium

### 8. `persistProjectSlice` is production-dead weight — **~80–150** (mostly tests)

**What**
`persistProjectSlice` (~20 LOC) wraps `persistProjectRows`. Production worker uses `applyAssessmentPayload` only. Still has parallel describes in `apply.test.ts` and a dedicated `persist-project-slice.integration.test.ts` (~441).

**Why**
Looks like a second persist API. Docs and callers can drift toward the wrong entry point.

**How**
Delete `persistProjectSlice`, or keep one integration suite on `persistProjectRows` / `applyAssessmentPayload`. Collapse duplicate test describes. Move any unique stale-write cases onto `persistProjectRows` tests.

**Files**
`packages/db/src/repo/apply.ts`, `packages/db/src/repo/apply.test.ts`, `packages/db/src/persist-project-slice.integration.test.ts`

---

### 9. Finding provenance: `engine` + `analyzerId` + contributors — **~40–50**

**What**
Findings store `engine`, `analyzerId`, and `contributingAnalyzers[]`. `engineFromAnalyzer` already exists. Filters still branch on stored `engine` with fallback (`finding-list-filter.ts`).

**Why**
Callers double-branch; merge/dedupe copies redundant fields.

**How**
Persist `analyzerId` (+ contributors for dedupe). Derive `engine` at UI/filter boundaries. Keep `AssessmentEngines` on the assessment (what ran), not duplicated on every finding.

**Files**
`packages/analysis-core/src/types.ts`, `packages/analysis-core/src/contract/finding-types.ts`, `packages/db/src/types.ts`, `packages/analysis-core/src/runtime/dedupe-runtime-findings.ts`, `src/core/finding-list-filter.ts`, `src/server/assessment-findings.ts`

---

### 10. `RawFinding` and `Finding` duplicate observation fields — **~40**

**What**
Both types carry checkId, kind, severity, confidence, reason, location, engine, analyzer\*, fix. `createFinding` copies one into the other.

**Why**
Two types for “an observation.” Persistence fields belong on Finding; the scan result is RawFinding.

**How**
`Finding` = persistence envelope + `RawFinding` (or `Omit` + ids). One place for analyzer fields. Do not put `Db` types into analysis-core.

**Files**
`packages/analysis-core/src/types.ts`, `packages/db/src/types.ts`, `src/server/assessment-findings.ts`

---

### 11. Status display is parallel maps per enum — **~80–100**

**What**
`status-display.ts` (~360): for each enum, separate Label / Description / Tone records + `lookupExhaustive` wrappers. Evidence kinds special-case `detail.event` / `detail.phase`.

**Why**
Adding a status means editing 2–4 tables. Tone and label are the same concept (how this value appears).

**How**
One record per enum value: `{ label, description, tone? }`. One `display(record, key)` helper. Keep exhaustive lookup. Do not invent a generic “status framework.”

**Files**
`src/core/status-display.ts`, `src/core/unable-to-verify-reason.ts`

---

### 12. Evidence kinds keep growing — **~30** (stop adding; no historical rewrite)

**What**
21 `EvidenceKind` values. Noun-pairs: `requirement_exception_set` / `_cleared`, `requirement_human_passed` / `_cleared`, multiple `remediation_*`. Labels already branch on `detail` for `finding` and `assessment_job`.

**Why**
Each kind needs a label, a tone, sometimes a filter chip. New product events add another union member.

**How**
Do not migrate old rows (append-only). Stop adding kinds: reuse `requirement_status_changed` / `finding` / `assessment_job` with a `detail` discriminant. Filter chips stay a short allow-list (`EVIDENCE_KIND_FILTER_ORDER` in `query.ts`).

**Files**
`packages/db/src/types.ts`, `src/core/status-display.ts`, `src/core/query.ts`

---

### 13. Dashboard is an 862-line page — **~0** (extract, not delete)

**What**
`src/app/(app)/dashboard/page.tsx` inlines stats, alerts, evidence, changes, connect empty states, job status. `src/components/dashboard/` already has chips/checklist/counts.

**Why**
The first screen is the hardest file to change. Logic and presentation sit in the route.

**How**
Route: load workspace → pass props. Move sections into `components/dashboard/`. No new “dashboard manager.”

**Files**
`src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`

---

### 18. `packages/db/src/queries.ts` is a grab-bag — **~40–60** (move, not delete)

**What**
One 275-line module holds: evidence row mappers (`evidenceToRow` / `rowToEvidence`), evidence list/export queries, assessment lists, GitHub project lookup, org id lists, and nav attention SQL. `repo/evidence.ts` imports mappers from `queries.ts` — inverted vs the rest of `repo/`.

**Why**
“Where do I put a new DB read?” has two answers (`queries` vs `repo/*`). Mappers belong next to other mappers.

**How**
Move evidence mappers into `repo/mappers.ts` (or `repo/evidence.ts`). Keep list helpers, but group by domain under `repo/` (or rename `queries.ts` to something honest like `evidence-queries.ts` + small focused modules). Do not add an abstraction layer — just put functions where their peers live.

**Files**
`packages/db/src/queries.ts`, `packages/db/src/repo/evidence.ts`, `packages/db/src/repo/mappers.ts`, `packages/db/src/workspace-load.ts`

---

## P3 — Low

### 19. Leftover catalog fiction: `controlById(_db, id)` — **~15–25**

**What**
`workspace.ts`: `_db` unused; always `shippedCatalog()`. Call sites still pass `db`.

**Why**
Suggests controls live on the workspace store (the old lie).

**How**
`controlById(controlId)` from adapters/catalog; drop the `Db` arg.

**Files**
`src/server/workspace.ts`, call sites in actions / findings / dashboard

---

### 20. `projectCapabilities` vs `canOnProject` — **~70–90** (prefer keep one)

**What**
`project-capabilities.ts` maps four booleans by calling `canOnProject` four times. UI reads `canRemediate` instead of the permission string. Used widely (dashboard, findings, settings, connect, API).

**Why**
Two APIs for the same RBAC. New screens invent a fifth boolean.

**How**
**Prefer keep** `projectCapabilities` (already the shared UI shape) and do not add other wrappers. Only delete it if inlining at every site is fewer total lines — unlikely. Do not maintain both “capabilities object” and ad-hoc boolean helpers.

**Files**
`src/server/project-capabilities.ts`, `src/core/rbac.ts`, dashboard/findings/settings pages, `api/github/repos`

---

### 21. `PublicError` re-exported from db as “canonical” — **~10**

**What**
Class lives in analysis-core (runtime throws it). `packages/db/src/types.ts` re-exports it so the app imports from `@complyloop/db/types`.

**Why**
Two import paths. A UI/HTTP error type is framed as a db concern.

**How**
One import: `@complyloop/analysis-core/contract/public-error`. Stop re-exporting from db (grep + update imports).

**Files**
`packages/db/src/types.ts`, app imports of `PublicError`

---

### 22. Entire `badges.tsx` forced client — **~0–20**

**What**
`badges.tsx` (~169) is `"use client"` because of tooltip wrappers, so label maps enter the client bundle.

**Why**
Server Components cannot use plain status badges without a client boundary.

**How**
Server-render plain badges; wrap only `BadgeWithDescription` as client, or use native `title` / `aria-description`.

**Files**
`src/components/badges.tsx`, `src/components/badge-with-description.tsx`

---

### 23. Orphaned test filenames after merges — **~0** (rename)

**What**

- `evidence-kind-filter.test.ts`, `report-view.test.ts`, `requirement-status-filter.test.ts`, `requirements-page.test.ts` all import `./query` but keep old module names.
- `src/ai/warn.test.ts` imports `./ai-call` but implies a deleted `warn.ts`.
- `github-access.test.ts` tests `github.ts` (see #14).

**Why**
Misleading file map; looks like dead modules still exist.

**How**
Rename to match the module under test (`query.*.test.ts`, `ai-call.test.ts`, fold github-access into `github.test.ts`). No logic change.

**Files**
`src/core/*-filter.test.ts`, `src/core/report-view.test.ts`, `src/core/requirements-page.test.ts`, `src/ai/warn.test.ts`, `src/server/github-access.test.ts`

---

### 24. Thin server facades that only wire imports — **~20–40**

**What**

- `finding-list-context.ts` (~28): builds `FilterFindingsContext` from catalog + `findRemediationForFinding`.
- `src/server/db.ts` re-exports `emptyDb` / `addEvidence` and wraps three loaders that mostly forward to `@complyloop/db/workspace-load`.

**Why**
Extra hops without domain logic. `addEvidence` re-export keeps the old write style visible at the app boundary.

**How**
Inline `buildFindingFilterContext` into findings pages or `finding-list-filter.ts`. Keep real loaders (`loadWorkspaceDbForViewer`) if they encode evidence-limit defaults; drop pure re-exports. Delete `addEvidence` export as part of #3.

**Files**
`src/server/finding-list-context.ts`, `src/server/db.ts`, findings pages

---

### 25. Personal-org provision still on GET (fast-path exists) — **~20–40** (move, not delete)

**What**
`getWorkspace` still can provision/claim personal org. `isPersonalOrgProvisioned` already skips the heavy path in steady state.

**Why**
Side effect on read is surprising; the fast path limits damage.

**How**
Move remaining provision/claim to auth/sign-in (or first write). Keep the indexed fast-path check until then. If moving off GET is unsafe for users who never re-sign-in, keep the one indexed read — do not load a full workspace to provision.

**Files**
`src/server/workspace.ts`, `src/server/orgs.ts`, `src/auth.ts`, `packages/db/src/repo/orgs.ts`

---

### 26. AI / docs — do not add layers — **~10–20**

**What**
AI stack is already small. Agent docs (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `docs/ai/architecture.md`) still risk repeating stack/loop maps. The simplicity implementation plan uses obsolete TODO numbering.

**Why**
Docs overlap adds a second mental map. Stale plans send implementers after deleted APIs.

**How**
Keep docs as pointers; do not add another overview. Architecture stays the system map. Rewrite or delete `docs/superpowers/plans/2026-09-07-simplicity.md` to match this file before starting P0 work. Rename `warn.test.ts` (see #23).

**Files**
`src/ai/warn.test.ts`, `src/ai/ai-call.ts`, `AGENTS.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-09-07-simplicity.md`

---

## Totals (unique, suggested order)

Do not add overlapping items (#2/#16 into #1; #3 assessment sites into #1; #8 tests partly independent; #24 `addEvidence` into #3).

| Priority         |     Unique net | What that is                                                                                                                            |
| ---------------- | -------------: | --------------------------------------------------------------------------------------------------------------------------------------- |
| P0               |       ~400–500 | Assessment immutable payload + interactive mutate/payload hybrid                                                                        |
| P1               |       ~300–350 | Evidence one API, connect path, write ceremony, check registry, adapters ceremony                                                       |
| P2               |       ~250–300 | Slice dead API, provenance/`RawFinding`, status-display, evidence kinds, GitHub merge, `queries.ts` tidy, dashboard extract (~0), mocks |
| P3               |       ~120–180 | `controlById`, capabilities, PublicError import, badges boundary, thin facades, test renames, provision-off-GET, docs/plan              |
| **Unique total** | **~900–1,100** | Application + test + docs. Catalog **data** (~2,900) is a move, not a cut.                                                              |

Dashboard (#13) and JSONB (#17) are ~0. File renames (#23) are ~0.

## Suggested order

1. **P0 #1 + #2** — one write shape: compute rows → upsert. Biggest drop in concepts. Delete the half-migrated “return mutated arrays” shape.
2. **P1 #3 + #4** — one evidence path; connect joins it; cascade helpers go away.
3. **P1 #5** — explicit `payload.project`; less write ceremony.
4. **P1 #6–#7** — check registry; adapters ceremony.
5. **P2** — dead slice API, provenance, display, file merges, `queries.ts` mappers. Dashboard extract anytime (~0 net).
6. **P3** — leftover API lies, thin facades, import cleanup, plan/docs.

Do not start with `src/core` test renames. Those save files, not concepts. The remaining write hybrid is the concept to remove.

---

## Challenge checklist (used this audit)

For each area: _Can we achieve the same result with less code, fewer concepts, fewer dependencies, or fewer moving parts?_

| Area                                                | Answer                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| Analysis engines                                    | No — coverage cost is real.                              |
| `persistProjectRows`                                | Already the simple persist API — keep.                   |
| Mutating `Db` to build assessment/action writes     | Yes — return payloads / new rows.                        |
| `AssessmentRunResult` returning full mutated arrays | Yes — that is still mutation; make returns apply-shaped. |
| `addEvidence` + `evidenceEntry` + `insertEvidence*` | Yes — one builder + insert.                              |
| Connect’s private persist loop + `project-cascade`  | Yes — same TX/payload as other writes.                   |
| Catalog package vs `src/catalog`                    | Yes for ceremony; data size unchanged.                   |
| `@complyloop/db` package                            | No — real shared persistence boundary.                   |
| Parallel check id lists                             | Yes — one registry object.                               |
| Authority classes / deriveRequirementStatus         | No — correctness.                                        |
| Locks + stale `updatedAt`                           | No — concurrency safety.                                 |
| Finding-act source/runtime beats                    | No — product.                                            |
| Assessment job queue                                | No — durable work outside requests.                      |
| Status _types_ in one contract file                 | Already simple — leave.                                  |
| Status _display_ parallel maps                      | Yes — one record per value.                              |
| `queries.ts` mappers vs `repo/`                     | Yes — put mappers with mappers.                          |
| Thin `finding-list-context` / `db` re-exports       | Yes — inline or drop hops.                               |
| `persistProjectSlice`                               | Yes — production-dead; tests only.                       |
