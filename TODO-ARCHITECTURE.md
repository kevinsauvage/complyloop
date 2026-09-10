# TODO — Architecture Review

**Project:** Compliance Engineering Platform (RGAA/WCAG compliance engineering)  
**Method:** Graft-backed end-to-end review of packages, `src/core`, `src/server`, `src/ai`, `src/app`, docs, and ESLint boundaries. No application code changed.  
**Companion:** Next.js-specific UI/router items live in `TODO-NEXTJS-ARCHITECTURE.md` — this file covers **system architecture** (domain, modules, dependency direction, ownership).

**Verdict:** The project already has a coherent spine — **contract → analysis / db / app**, durable assessment jobs, sticky human decisions, append-only evidence, and Server Actions as the mutation edge. It does **not** need Clean/Hexagonal ceremony. The real problems are **misplaced type ownership** (persistence package exporting domain entities), a **kitchen-sink `src/core`**, and a few **doc/ESLint lies** about boundaries that no longer exist. Fix ownership and naming; do not add layers.

---

## Current architecture (as built)

```text
UI / Route Handlers / Server Actions     src/app, src/components, src/server/actions
            ↓
Application orchestration                src/server (workspace, assessment*, github*, jobs, writes)
            ↓
Mixed “app core”                         src/core (domain rules + UX policy + formatting)  ← muddled
            ↓
Domain contract + analysis engine        packages/analysis-core/{contract,checks,runtime,scan,…}
            ↑
Persistence + job tables                 packages/db (schema, repo/, workspace-load, types)
External edges                           GitHub, Auth.js, Playwright/axe (via analysis-core), AI SDK
```

**What is already solid (preserve):**

- `packages/analysis-core/src/contract/` — statuses, requirement derivation, locations, `PublicError`, job enums.
- Analysis engines isolated in `analysis-core`; CI surface in `@complyloop/check`.
- `packages/db/repo/*` + `persistProjectRows` / stale-write guards / advisory locks — real concurrency value.
- App enqueue → `assessment_jobs` → worker (`assessment-worker.ts`) → `runAssessment` → apply — correct durability boundary.
- `src/core` ESLint fence vs analysis engines / server / app (contract-only for analysis-core).
- Client-safe splits already done well: `src/core/action-state.ts` vs `src/server/action-state.ts`; `src/core/assessment-jobs.ts` (zod) vs server persistence.
- AI never authoritatively sets requirement statuses (product rule held in structure).

---

## P0 — Critical

- [x] **Move persisted domain entities out of the infrastructure type bag** — done: entities live in `packages/analysis-core/src/contract/entities.ts`, `FindingCluster` in `src/core/finding-cluster.ts`, `packages/db/src/types.ts` keeps only `Db`/`emptyDb` + compat re-exports.
  - Why: `Finding`, `Remediation`, `Assessment`, `EvidenceKind`, `FindingCluster`, etc. live in `packages/db/src/types.ts`, so “domain” and UI/`src/core`/`src/ai` all depend on the **database package** for business vocabulary. That inverts the intended dependency direction (`contract → db`) and makes persistence the source of truth for domain shape.
  - Where: `packages/db/src/types.ts`; consumers across `src/core/lifecycle.ts`, `src/core/display.ts`, `src/core/filter-params.ts`, `src/ai/*`, `src/server/**`, `src/components/**`, `src/app/**`.
  - Current: Contract holds statuses/locations/`RawFinding`; db `Finding` extends `RawFinding` with ids, project/control/assessment linkage, lifecycle fields, and stale-write `updatedAt`. Clustering UI type `FindingCluster` is also declared in db types.
  - Problem: Changing a column concern and a domain rule look the same (“edit db/types”). Core cannot stay framework-agnostic while importing `@complyloop/db/types`. Onboarding answer to “where is Finding defined?” points at infrastructure.
  - Change: Promote **entity interfaces** (Finding, Remediation, Assessment, EvidenceRecord, EvidenceKind, org/project persistence-facing fields that are really domain) into `packages/analysis-core/src/contract/` (or a thin `packages/domain` only if contract package boundaries fight you — prefer extending contract). Keep **Drizzle row mappers / SQL types** in `packages/db`. `FindingCluster` is presentation/application clustering — move next to clustering code (`src/core` split below), not db.
  - Boundary: Domain types ← owned by contract; db may import contract and map to/from rows; app/core/ai import contract, not db, for entity shapes.
  - Impact: True dependency direction; db becomes replaceable at the type level; “where does Finding live?” has one answer.
  - Risk: high (wide import churn; do in a dedicated PR with typecheck+tests)

---

## P1 — High

- [ ] **Split `src/core/lifecycle.ts` — stop the god module**
  - Why: ~790 lines mixing **domain transitions** (`advanceRemediation`, `canTransition`, `refreshSuggestion`), **assessment presentation math** (`clusterFindings`, `prioritizeFindings`, `unableToVerifyReason`), **finding UX state machine** (`findingAct` and beat variants), and **formatting** (`formatDateTime*`). One file owns too many reasons to change.
  - Where: `src/core/lifecycle.ts` (and its tests); callers in `src/server/assessment.ts`, `src/server/actions/*`, `src/app/(app)/**`, components.
  - Current: Everything exported from one module; server conventions correctly say status changes go through these helpers — but UI policy rides along.
  - Problem: Changing a toast label risk-adjacent to remediation legality; hard to test domain rules without pulling UX; unclear what “core” means.
  - Change: Split by responsibility **without new layers**:
    - `src/core/remediation-lifecycle.ts` — transitions / history / suggestion refresh (domain).
    - `src/core/finding-priority.ts` (or similar) — cluster + prioritize + unable-to-verify reasons (application policy over domain data).
    - `src/core/finding-act.ts` — UI beat model for the finding page.
    - `src/core/datetime.ts` or fold formatters into `display.ts`.
    Keep a short `lifecycle.ts` re-export only if needed for a one-release compat shim, then delete.
  - Boundary: Domain transition rules stay framework-free; UI beat model may stay in core but must not be imported by the worker/assessment engine path except where already required.
  - Impact: Clear ownership; safer refactors; matches “where does this go?” for remediation vs UI.
  - Risk: medium

- [ ] **Rename / redefine what `src/core` is**
  - Why: Docs say “RBAC, finding UX (contract only)” but the folder is the dumping ground for RBAC, filters, display maps, job zod schemas, remediation law, and finding-page choreography. The name promises “domain core”; the contents are “shared app kernel.”
  - Where: `src/core/*`; `docs/ai/architecture.md` Modules table; ESLint comment in `eslint.config.mjs`.
  - Current: ESLint blocks analysis engines/server/app — good. Db types still allowed — bad (see P0). Name oversells purity.
  - Problem: Developers put both pure rules and UI policy in the same bucket; artificial DDD expectations creep in.
  - Change: Pick one honest model and document it:
    - **Preferred (boring):** Keep folder `src/core` as **shared application kernel** (no Next, no Drizzle, no GitHub). Subfolders: `rbac/`, `remediation/`, `findings-ux/`, `filters/`, `display/`. Or
    - Rename to `src/shared/` / `src/app-model/` if “core” keeps misleading people.
    Do **not** introduce `domain/application/infrastructure` folder theater.
  - Boundary: Kernel may depend on contract (+ eventually contract entities from P0); must not depend on db drivers, Next, or GitHub.
  - Impact: Onboarding clarity; stops random new “services” folders.
  - Risk: low (docs + light moves) to medium (rename)

- [ ] **Fix false boundary documentation (`src/adapters/registry.ts`)**
  - Why: `eslint.config.mjs` claims “server/app integrate core via `src/adapters/registry.ts`” but **`src/adapters` does not exist**. Catalog “adapters” live under `packages/analysis-core/src/adapters/` (RGAA/WCAG data — not hexagonal ports). Stale words create fake architecture.
  - Where: `eslint.config.mjs` (comment ~L23–27); any docs echoing an app-level adapters registry.
  - Current: Integration is direct: pages/actions → `src/server` → `packages/db` / `analysis-core`.
  - Problem: Agents and humans search for a layer that isn’t there; “adapter” means two different things.
  - Change: Update the ESLint comment and architecture doc to describe the real graph. Optionally rename analysis-core `adapters/` → `catalog/` in a dedicated rename if the word keeps causing hexagonal cargo-cult (P2 if costly).
  - Boundary: Documentation matches code; “adapter” = catalog packaging inside analysis-core, not an app DI layer.
  - Impact: Stops misguided “add an adapters layer” refactors.
  - Risk: low (docs); medium if renaming catalog path

- [ ] **Decouple `src/ai` from `src/server` observability**
  - Why: `src/ai/ai-call.ts` imports `reportError` from `@/server/observability`, pulling AI “pure-ish” generation toward the server app shell. AI is supposed to be an optional edge that never sets statuses — dependency should point inward to contract, not sideways into server.
  - Where: `src/ai/ai-call.ts` (+ tests); `src/server/observability.ts`; action callers already in `src/server/actions/remediation-ai.ts`, `ai-fix.ts`.
  - Current: AI modules take contract/db Finding types and call server reporting on failures.
  - Problem: Circular pressure (server → ai → server); harder to unit-test AI without server mocks; blurs “AI is a library used by application.”
  - Change: Have AI throw `PublicError` / return `Result`; let **actions** call `reportError`. Or pass an optional `onError` hook from the server caller. After P0, AI should import Finding from contract, not db.
  - Boundary: `src/ai` → contract (+ node fs helpers it already needs); `src/server` → `src/ai`.
  - Impact: Cleaner edge; matches “AI never authoritative” structurally.
  - Risk: low

- [ ] **Keep write orchestration in application — but document it as the write model**
  - Why: `withProjectWrite` / `ProjectWritePayload` / `cloneProjectRows` look like “extra abstraction” but encode real locking + stale-write + evidence append rules. The risk is **not** the pattern existing — it is people bypassing it with raw `getDrizzle()` in actions (`alerts.ts`, `org.ts`, `pr.ts`) without a clear rule for when that is allowed.
  - Where: `src/server/workspace-write.ts`, `project-rows.ts`; exceptions in `src/server/actions/alerts.ts`, `org.ts`, `pr.ts`; persistence story in `docs/ai/architecture.md`.
  - Current: Most mutations use write helpers; some actions talk to Drizzle directly.
  - Problem: Two write styles → uncertain ownership of authz, locks, and evidence.
  - Change: Document the rule: **project compliance mutations** → `withProjectWrite` / finding-scoped helpers; **tenancy/org/connect** → `withOrgWrite` / `withConnectWrite`; **narrow operational updates** (alert read flags, PR metadata) may use repo helpers **only** when they cannot violate stale-write/evidence invariants — list them explicitly. Do not invent a generic Unit-of-Work framework.
  - Boundary: Application owns transaction + authz policy; `packages/db/repo` owns SQL.
  - Impact: Fewer accidental lock/evidence bugs; easier code review.
  - Risk: low

---

## P2 — Medium

- [ ] **Group `src/server` by domain folders (no new layers)**
  - Why: Flat `src/server` mixes assessment pipeline, GitHub, workspace, reporting, webhooks, AI fix persistence — discoverability cost as the file count grows.
  - Where: `src/server/assessment*.ts`, `github*.ts`, `workspace*.ts`, `report*`, `webhook*.ts`, `actions/`.
  - Current: Conventions file helps; filenames prefix by domain.
  - Problem: Not incorrect — just hard to navigate; invites random new top-level files.
  - Change: Physical folders `server/assessment/`, `server/github/`, `server/workspace/`, `server/reporting/`, keep `actions/` as the HTTP/UI mutation edge. **No** ports/adapters/interfaces unless replacing GitHub genuinely needs a second implementation.
  - Boundary: Same dependency rules; clearer homes.
  - Impact: Faster “where does webhook idempotency live?”
  - Risk: medium (import paths)

- [ ] **Clarify catalog naming vs hexagonal “adapters”**
  - Why: `packages/analysis-core/src/adapters/` holds shipped RGAA/WCAG catalog/presets — domain reference data — not infrastructure adapters. The name fights the rest of the architecture vocabulary.
  - Where: `packages/analysis-core/src/adapters/**`; docs table in `docs/ai/architecture.md`.
  - Current: Works; ESLint treats it as a forbidden import for core (good).
  - Problem: Encourages “we should add adapters for GitHub too” confusion.
  - Change: Rename to `catalog/` (or `frameworks/`) when cheap; update graft/docs.
  - Boundary: Catalog is analysis-core reference data depended on by app/server, not a port.
  - Impact: Vocabulary alignment.
  - Risk: medium (import path churn)

- [ ] **Extract finding-page UX policy from domain lifecycle imports in the worker path**
  - Why: `runAssessment` imports `latestAssessmentFor`, `countByStatus`, `advanceRemediation` from `lifecycle.ts`. After the split (P1), ensure the worker/assessment pipeline only depends on **remediation/status domain helpers**, not `findingAct` / clustering.
  - Where: `src/server/assessment.ts`, `assessment-status.ts`, `assessment-findings.ts`, `assessment-worker.ts`.
  - Current: Assessment orchestration correctly lives in application; dependency on the god module is broader than needed.
  - Problem: Risk of UI policy leaking into batch jobs via barrel imports.
  - Change: After split, tighten imports; add an ESLint restriction if useful (`assessment*` cannot import `finding-act`).
  - Boundary: Worker/application assessment → domain transitions + analysis-core; not finding-page beats.
  - Impact: Safer batch path; smaller mental load when changing UI.
  - Risk: low

- [ ] **Single owner for validation parsing**
  - Why: Zod schemas live in `src/core/filters.ts`, `src/core/assessment-jobs.ts`, action files, and some route handlers — mostly fine, but entity id / form parsing sometimes duplicates.
  - Where: `src/core/filters.ts`, `src/core/filter-params.ts`, `src/server/actions/*`, `src/app/api/**`.
  - Current: `parseInput` / `parseForm` + `PublicError` is a good pattern.
  - Problem: Mild drift risk, not a structural crisis.
  - Change: Keep **shared zod primitives** in `src/core/filters.ts`; action-specific schemas stay next to actions. Avoid a separate “validation layer” package.
  - Boundary: Shared parsers in kernel; use-case schemas at the edge.
  - Impact: Consistency without indirection.
  - Risk: low

- [ ] **Treat `packages/db/types` `Db` in-memory slice as an application read model name**
  - Why: The in-memory `Db` type (arrays of projects/findings/…) is a convenient workspace slice for writes/tests — powerful but easy to mistake for “the database.”
  - Where: `packages/db/src/types.ts` (`Db`, `emptyDb`); `workspace-load.ts`; `project-rows.ts`.
  - Current: Documented indirectly via architecture persistence section.
  - Problem: Name `Db` collisions with “Drizzle db” in conversation; new code may mutate slice without going through payloads.
  - Change: Rename type to `WorkspaceSlice` / `ProjectSlice` bag (you already have `ProjectSlice` for stale writes) over time; keep behavior.
  - Boundary: Slice = application/persistence read model; Drizzle = driver.
  - Impact: Clearer reviews.
  - Risk: medium (rename)

---

## P3 — Low

- [ ] **Align evidence display doc references**
  - Why: Comment in `packages/db/src/types.ts` points at `src/core/status-display.ts` for evidence labels; actual maps live in `src/core/display.ts`.
  - Where: `packages/db/src/types.ts` EvidenceKind comment; `src/core/display.ts`.
  - Current: Stale path in a critical vocabulary comment.
  - Problem: Wastes search time.
  - Change: Fix the comment path.
  - Boundary: n/a
  - Impact: Tiny clarity win.
  - Risk: low

- [ ] **Keep RBAC in the shared kernel — don’t “domain-ify” it further**
  - Why: `src/core/rbac.ts` is small, contract-typed, and used via `projectCapabilities` / action guards. Moving it into analysis-core would couple a product permission matrix to the analysis package.
  - Where: `src/core/rbac.ts`, `src/server/project-capabilities.ts`, `src/server/actions/shared.ts`.
  - Current: Good split (pure rbac vs server capability façade).
  - Problem: None serious — temptation to over-abstract permissions.
  - Change: Leave as-is; document “RBAC is app kernel, not analysis-core.”
  - Boundary: Already correct.
  - Impact: Prevents busywork.
  - Risk: low

- [ ] **Avoid introducing DI containers / repository interfaces “for testability”**
  - Why: Tests already inject runtime scanners / DNS lookups on `runAssessment` and mock at module boundaries. A DI container would not pay rent.
  - Where: `src/server/assessment.ts` options; vitest mocks across `src/server/*.test.ts`.
  - Current: Explicit optional injection for expensive edges.
  - Problem: Future “clean architecture” PRs may add interfaces per repo function.
  - Change: Reject new abstract repositories unless a second infrastructure implementation exists. Prefer function params and package seams you already have.
  - Boundary: Concrete `packages/db/repo` is the persistence API.
  - Impact: Stays boring and navigable.
  - Risk: low

---

## Target Architecture

Converge on this **boring, explicit** shape — same boxes as today, clearer ownership:

```text
src/app + src/components          UI / Route Handlers (composition, no business rules)
        ↓
src/server/actions                Mutation edge (authz, PublicError, call application)
src/server/<domain>/              Application: workspace, assessment pipeline, github,
                                  jobs/worker, reporting, write orchestration
        ↓
src/core/<area>/                  Shared app kernel (no Next/Drizzle/GitHub):
                                  rbac, remediation transitions, finding UX policy,
                                  filters, display maps, client-safe zod
src/ai/                           Optional generation library (contract in, Result/PublicError out)
        ↓
packages/analysis-core/contract   Domain vocabulary + pure status derivation
packages/analysis-core/*          Analysis engines + catalog (rename adapters→catalog when ready)
        ↑
packages/db                       Schema, repo SQL, mappers, locks — imports contract entities
packages/check                    CI CLI over analysis-core
```

**Rules of thumb**

1. **Types:** Entity shapes live in **contract**; SQL lives in **db**.
2. **Rules:** Remediation/requirement legality lives in **kernel/contract**; orchestration in **server**; pixels in **app/components**.
3. **Jobs:** HTTP only enqueues; worker owns clone/scan/persist.
4. **Integrations:** GitHub/Auth/AI are edges called by server — not imported by kernel.
5. **No new layers** unless a second implementation or security boundary demands one.

A developer should answer quickly:

- Finding entity? → `analysis-core/contract`
- Finding row upsert? → `packages/db/repo`
- Advance remediation? → `src/core/remediation-lifecycle` (after split)
- Run a scan? → `src/server/assessment` + analysis-core
- Button submit? → `src/server/actions/*`

---

## Biggest Architectural Wins

1. **Promote Finding/Remediation/Assessment/Evidence types to contract** — fix the dependency inversion through `packages/db/types`.  
2. **Split `src/core/lifecycle.ts`** into remediation domain, priority/clustering, finding-act UX, formatting.  
3. **Tell the truth about `src/core`** (shared kernel) and delete the phantom `src/adapters/registry.ts` story.  
4. **Make `src/ai` depend only on contract (+ local helpers)** — report errors at the action boundary.  
5. **Document when raw Drizzle in actions is allowed** vs `withProjectWrite` — protect locks/evidence without a UoW framework.  
6. **Folder-group `src/server` by domain** for navigation (assessment / github / workspace / reporting).  
7. **Rename analysis-core `adapters/` → `catalog/`** when cheap — vocabulary hygiene.  
8. **Tighten assessment pipeline imports** so jobs never see finding-page UX modules.  
9. **Rename in-memory `Db` slice** toward `WorkspaceSlice` language over time.  
10. **Preserve** jobs, sticky human decisions, append-only evidence, and package seams — do not Clean-Architecture the repo.

---

*Prefer explicit modules and dependency direction over additional abstractions. Cross-check UI/router simplifications in `TODO-NEXTJS-ARCHITECTURE.md`.*
