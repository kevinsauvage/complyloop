# TODO — Simplicity

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

### 25. Personal-org provision still on GET (fast-path exists) — **~20–40** (move, not delete)

**What**
`getWorkspace` still can provision/claim personal org. `isPersonalOrgProvisioned` already skips the heavy path in steady state.

**Why**
Side effect on read is surprising; the fast path limits damage.

**How**
Move remaining provision/claim to auth/sign-in (or first write). Keep the indexed fast-path check until then. If moving off GET is unsafe for users who never re-sign-in, keep the one indexed read — do not load a full workspace to provision.

**Files**
`src/server/workspace.ts`, `src/server/orgs.ts`, `src/auth.ts`, `packages/db/src/repo/orgs.ts`
