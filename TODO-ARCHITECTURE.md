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

_Prefer explicit modules and dependency direction over additional abstractions. Cross-check UI/router simplifications in `TODO-NEXTJS-ARCHITECTURE.md`._
