# TODO — Architecture Review

**Project:** Compliance Engineering Platform (RGAA/WCAG compliance engineering)  
**Date:** 2026-09-14  
**Method:** Fresh Graft-backed review of the **current** tree (`packages/*`, `src/core`, `src/server/{assessment,github,workspace,reporting,actions}`, `src/ai`, `src/app`, docs, ESLint). No application code changed.  
**Companion:** UI/App Router items (if any) belong in `TODO-NEXTJS-ARCHITECTURE.md` — this file is **system architecture** only.

**Verdict:** After the recent boundary refactors, the architecture is **coherent and maintainable**. The spine is right: **contract entities → analysis / db / shared kernel / server domains / UI**. Do **not** introduce Clean/Hexagonal/DDD ceremony. Remaining work is **naming debt, dead shims, a few misplaced pure rules, and oversized presentation modules** — not missing layers.

---

## Current architecture (as built)

```text
UI / Route Handlers / Server Actions     src/app, src/components, src/server/actions
            ↓
Application by domain                    src/server/{assessment,github,workspace,reporting}
            ↓
Shared app kernel                        src/core/*  (no Next / Drizzle / GitHub)
Optional AI library                      src/ai/*    (contract in; onError hook out)
            ↓
Domain contract + engines                packages/analysis-core/{contract,checks,runtime,scan,…}
                                         contract/entities.ts = Finding, Remediation, Assessment, Evidence, Alert
            ↑
Persistence                              packages/db (schema, repo/, workspace-load; types.ts = Db slice + re-exports)
CI edge                                  packages/check
Auth composition root                    src/auth.ts + src/auth-secret.ts + src/proxy.ts
```

### What is already solid (preserve — do not “simplify” away)

- **Entity ownership fixed:** `Finding` / `Remediation` / `Assessment` / `Evidence*` / `Alert` live in `packages/analysis-core/src/contract/entities.ts`. `packages/db/src/types.ts` mostly holds the in-memory `Db` write slice + re-exports. `src/core` and `src/ai` import contract, not db drivers.
- **`src/core` split:** `remediation-lifecycle`, `assessment-helpers`, `finding-priority`, `finding-act`, `finding-cluster`, `datetime`, `display`, `filters`, `rbac` — with ESLint blocking `finding-act` from `src/server/assessment/*`.
- **`src/server` domain folders:** `assessment/`, `github/`, `workspace/`, `reporting/` + `actions/` mutation edge.
- **AI edge:** `src/ai` does not import `@/server/*`; failures report via injected `onError`.
- **Write model documented:** `withProjectWrite` / `withOrgWrite` / `withConnectWrite`; raw `getDrizzle()` in actions limited to alerts / org-export reads / PR evidence read (`docs/ai/architecture.md`).
- **Jobs:** HTTP enqueues → `assessment_jobs` → worker → `runAssessment` → `applyAssessmentPayload`; sticky human decisions; append-only evidence.
- **Catalog naming called out in docs:** `analysis-core/src/adapters/` = catalog packaging, not hexagonal ports; no phantom `src/adapters/registry.ts`.
- **Validation/errors:** `PublicError` + `parseForm` / `parseInput` in kernel; `runAction` at the edge.

---

## P0 — Critical

_None identified in the current tree._  

No structural correctness/security inversions remain at the level of “domain types owned by db” or “AI imports server” or “assessment imports finding-page UX.” Keep the fences; do not invent P0 work for ceremony.

---

## P1 — High

- [x] **Delete the dead `src/core/lifecycle.ts` compat shim**
  - Done (2026-09-14): Deleted; no remaining callers. Focused modules only.
  - Risk: low

- [x] **Move pure human-determination rules into the shared kernel**
  - Done (2026-09-14): Now `src/core/requirement-human-determination.ts` (+ test); actions import from `@/core/...`.
  - Risk: low

- [x] **Rename the in-memory `Db` slice to match its real job**
  - Done (2026-09-14): `Db` → `WorkspaceSlice`, `emptyDb` → `emptyWorkspaceSlice` in `packages/db/src/types.ts` + callers.
  - Risk: medium (mechanical rename)

- [x] **Split oversized presentation kernels (`display.ts`, `filter-params.ts`)**
  - Done (2026-09-14): `src/core/display/{status,evidence,report-tones,must-get}.ts` + thin `display.ts` barrel; `src/core/filter-params/{findings,evidence,requirements,pagination,href}.ts` + thin `filter-params.ts` barrel. Public symbol names stable.
  - Risk: medium

- [x] **Clarify `src/auth.ts` as composition root (split only what’s tangled)**
  - Done (2026-09-14): `getGitHubAccessToken` → `src/server/github/access-token.ts`; callers + action mocks updated. `isGitHubAuthConfigured` stays on `@/auth`. NextAuth composition root unchanged (still wires tokens + personal-org on sign-in). No AuthPort/DI.
  - Risk: medium

---

## P2 — Medium

- [ ] **Finish dropping entity re-exports from `packages/db/types`**
  - Why: Entities already live in contract; db `types.ts` still re-exports them “for compat.” Most app code already imports contract; remaining db/types imports are for `Db` / `emptyDb`.
  - Where: `packages/db/src/types.ts`; any stray `import type { Finding } from "@complyloop/db/types"`.
  - Current: Re-export block + slice interface.
  - Problem: Two legal import paths for Finding → weak single source of truth.
  - Change: After slice rename (P1), export **only** the slice helpers from db/types (or `packages/db/src/slice.ts`). Ban entity imports from `@complyloop/db/types` via ESLint.
  - Boundary: contract = entities; db = SQL + slice.
  - Impact: Impossible to “accidentally” treat db as domain home again.
  - Risk: low

- [ ] **Rename `packages/analysis-core/src/adapters/` → `catalog/` when cheap**
  - Why: Docs already say these are catalog/presets, not ports. The folder name still invites hexagonal cargo-cult (“add a GitHub adapter here”).
  - Where: `packages/analysis-core/src/adapters/**`; docs/ESLint references.
  - Current: Works; ESLint forbids core from importing it.
  - Problem: Vocabulary mismatch only — but it keeps biting agents.
  - Change: Rename directory + update imports/docs/graft. No behavior change.
  - Boundary: Catalog = reference data inside analysis-core.
  - Impact: Cleaner mental model.
  - Risk: medium (import path churn)

- [ ] **Thin `assessment-status.ts` orchestration comments/structure without moving derive logic**
  - Why: ~372 lines correctly **apply** contract `deriveRequirementStatus` + sticky human gates + evidence. It’s application orchestration, not a second domain. Still dense for newcomers.
  - Where: `src/server/assessment/assessment-status.ts`.
  - Current: `statusFromFindings` wraps contract derivation; `refreshRequirementForControl` mutates working maps + evidence.
  - Problem: Looks like duplicated domain; risk of future “simplify” PRs inlining derive into db triggers or UI.
  - Change: Keep derive in contract. Optionally extract sticky/manual-control branches into named helpers in the same folder. Add a 5-line module doc: “Orchestrates contract derivation over project rows; does not redefine status law.”
  - Boundary: Law in contract; apply/refresh in assessment application.
  - Impact: Protects the good split from well-meaning refactors.
  - Risk: low

- [ ] **Keep raw Drizzle action exceptions on a short allow-list (enforce)**
  - Why: Docs list `alerts.ts` / `org.ts` / `pr.ts` as the only raw `getDrizzle()` action exceptions. Pattern is good; enforcement is social.
  - Where: `src/server/actions/{alerts,org,pr}.ts`; `docs/ai/architecture.md`.
  - Current: Three files; other actions use write helpers / reporting loaders.
  - Problem: Next action author may copy-paste `getDrizzle()` for a compliance mutation and skip locks/stale-write.
  - Change: ESLint `no-restricted-imports` on `@complyloop/db/postgres` inside `src/server/actions/**` with an allow-list override for those three files (or a `actions/_raw-db/` escape hatch folder).
  - Boundary: Actions default to write helpers; raw db is explicit exception.
  - Impact: Prevents regression of the write model.
  - Risk: low

- [ ] **Shrink mega client leaves that concentrate product workflow**
  - Why: `src/components/github-repo-picker.tsx` (~314) still concentrates search/pagination/connect UX. Architecture is fine (server panel + client picker); file grain hurts change.
  - Where: `src/components/github-repo-picker.tsx` (and similarly large findings client lists if still growing).
  - Current: Justified client island for typeahead against `/api/github/repos`.
  - Problem: Workflow + presentation in one client module → risky edits.
  - Change: Split list UI vs search-state hook vs connect confirm — still client leaves, no new layer.
  - Boundary: UI only; connect mutations stay Server Actions.
  - Impact: Safer connect UX changes.
  - Risk: low

---

## P3 — Low

- [ ] **Prefer direct imports over any new barrels in `src/core`**
  - Why: The deleted god-module lesson: barrels become magnets.
  - Where: `src/core/*`.
  - Current: Focused modules; lifecycle shim is the last barrel.
  - Problem: Future “index.ts for convenience” undoes clarity.
  - Change: Norm in AGENTS.md / architecture.md: no `src/core/index.ts`.
  - Boundary: n/a
  - Impact: Prevents regression.
  - Risk: low

- [ ] **Keep RBAC in the app kernel (explicit non-goal)**
  - Why: Temptation exists to move `src/core/rbac.ts` into analysis-core “because domain.”
  - Where: `src/core/rbac.ts`, `src/server/workspace/project-capabilities.ts`.
  - Current: Correct — product permission matrix ≠ analysis package.
  - Problem: Wrong “domain purity” refactor would couple CI/analysis publishes to app roles.
  - Change: Document as frozen decision (already hinted in architecture.md); no code move.
  - Boundary: RBAC = kernel; analysis-core = compliance analysis.
  - Impact: Avoids a harmful cleanup.
  - Risk: low

- [ ] **Reject DI containers / repository interfaces unless a second implementation exists**
  - Why: Tests already inject runtime scanners / DNS on `runAssessment`; `packages/db/repo` is the persistence API.
  - Where: Future PRs around github/db.
  - Current: Concrete modules + optional function params.
  - Problem: Clean-architecture drive-bys add interfaces per repo function with one impl.
  - Change: Review norm only.
  - Boundary: Concrete > abstract until replaceability is real.
  - Impact: Stays boring.
  - Risk: low

---

## Target Architecture

Converge on the structure **you largely already have** — polish ownership, don’t redraw boxes:

```text
src/app + src/components           UI composition (RSC + small client leaves)
src/server/actions                 Mutation edge (authz, PublicError, write helpers)
src/server/assessment|github|
         workspace|reporting       Application orchestration by domain
src/core/*                         Shared kernel: rbac, remediation + human-determination
                                   transitions, finding priority/act, filters, display maps
src/ai/*                           Optional generation (contract in → Result/PublicError out)
packages/analysis-core/contract    Domain vocabulary + pure status derivation + entities
packages/analysis-core/{checks,    Analysis engines + catalog/ (today: adapters/)
  runtime,scan,catalog}
packages/db                        Drizzle schema, repo SQL, locks, WorkspaceSlice
packages/check                     CI CLI over analysis-core
src/auth.ts                        NextAuth composition root only
```

**Rules of thumb (enforce in review)**

1. **Entities** → `contract/entities` only.  
2. **Status law** → `contract/requirement-status` (+ authority); assessment **applies**, does not redefine.  
3. **Remediation / human overrides** → `src/core/*lifecycle*`.  
4. **Finding-page beats** → `finding-act` only; never assessment/worker.  
5. **SQL / locks** → `packages/db` + workspace write helpers.  
6. **GitHub / Auth / AI** → edges composed by server/auth; kernel never imports them.  
7. **No new layers** without a second implementation or a security boundary.

A developer should answer quickly:

| Question | Home |
| --- | --- |
| What is a Finding? | `contract/entities` |
| How does requirement status derive? | `contract/requirement-status` |
| Advance remediation? | `src/core/remediation-lifecycle` |
| Human pass / exception? | `src/core/requirement-human-determination` |
| Run a scan job? | `src/server/assessment/*` |
| Upsert rows under lock? | `workspace-write` + `packages/db/repo` |
| Connect a repo button? | `actions/connect` + github edge |
| Badge copy / evidence tone? | `src/core/display/*` |

---

## Biggest Architectural Wins

1. ~~**Delete `src/core/lifecycle.ts`**~~ — done.  
2. ~~**Move human-determination into `src/core`**~~ — done.  
3. ~~**Rename `Db` → `WorkspaceSlice`**~~ — done.  
4. ~~**Split `display.ts` / `filter-params.ts` by vocabulary**~~ — done.  
5. ~~**Clarify auth composition vs token vault imports**~~ — done (`access-token.ts`).  
6. **ESLint-ban entity imports from `@complyloop/db/types`** — lock the P0 fix permanently.  
7. **Rename `adapters/` → `catalog/`** — vocabulary hygiene when cheap.  
8. **Allow-list raw `getDrizzle()` in actions** — protect the write model mechanically.  
9. **Document assessment-status as apply-not-law** — prevent “dedupe” regressions.  
10. **Do not add Clean/Hex/DI layers** — the current boring spine is the target.

---

*This review deliberately avoids re-litigating completed boundary work. Prefer preserving the contract→kernel→server→UI dependency direction over aesthetic redesigns.*
