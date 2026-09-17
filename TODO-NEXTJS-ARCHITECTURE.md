## P3 — Low

- [ ] **Drop `"use client"` from the two trivially-convertible leaves (`role-select`, `github-repo-picker-empty`)**
  - Why: neither uses hooks, browser APIs, or handlers — `src/components/role-select.tsx:1` is a pure `<select defaultValue>` over `ORG_ROLE_OPTIONS`; `src/components/github-repo-picker-empty.tsx:1` is presentational (`<Button asChild><a Install App>` + conditional text). The directives are harmless (tiny leaves inside the picker dialog) but teach the wrong default.
  - Where: `src/components/role-select.tsx:1`, `src/components/github-repo-picker-empty.tsx:1`.
  - Current: client leaves that could render on the server.
  - Change: remove both directives; keep them imported by client parents as server-rendered children where possible. If a parent's client boundary forces them client anyway, leave a one-line comment saying so.
  - Next.js principle: no `"use client"` without a client capability (state, effects, handlers, browser APIs).
  - Impact: negligible bundle change; meaningful as a linter-grade example.
  - Risk: low.

- [ ] **Fold the single-const / tiny modules into their consumers (`form-classes`, `filter-params/href`, `filter-params/params`, `db.ts` re-export, `active-project-page`)**
  - Why: each is defensible alone; together they are jump-to-definition tax. `src/components/form-classes.ts:1-3` is one `nativeSelectClass` string with one importer (`auto-submit-select-form.tsx:7`). `src/core/filter-params/href.ts:1-12` (12-line `href()`) and `params.ts:9-26` (`firstParam`, `trimmedQuery`) are two primitives as separate modules under the `filter-params.ts:10-56` barrel. `src/server/workspace/db.ts:12-29` is a justified 29-line leaf, but `workspace-write.ts:203` re-exports `withProjectLock` from it — a needless hop. `src/server/workspace/active-project-page.ts:13-23` is a 23-line `getWorkspace + projectCapabilities` wrapper called identically by every loader.
  - Where: files above; callers `project-view.ts:138,374,577,681`, `auto-submit-select-form.tsx:7`.
  - Current: ~5 modules that each save a few lines at the cost of a file boundary.
  - Change: fold `nativeSelectClass` into `auto-submit-select-form.tsx` (or `ui/`); fold `href`/`params` into `filter-params.ts` or the findings/evidence modules that use them; import `withProjectLock` from `db.ts` directly and delete the re-export line; inline `loadActiveProjectPage` into a `view-shared.ts` (see P1 split) or keep it only if the split lands there anyway. Do not chase line count — fold only these named modules.
  - Next.js principle: fewer files with clear ownership beat many one-idea files; barrels should not hide two-line primitives.
  - Impact: fewer hops per read; smaller `src/core`/`workspace` surface.
  - Risk: low.

- [ ] **Relocate the misplaced hooks (`use-github-repo-search`, `use-github-repo-connect`) from `components/` to `hooks/`**
  - Why: the repo's own layout says hooks live in `src/hooks/` (today: `use-action-toast.ts`, `use-copy.ts`), but the two GitHub-picker hooks live in `src/components/`: `use-github-repo-search.ts:34-162` (162-line fetch + debounce + abort + pagination) and `use-github-repo-connect.ts:16-36` (dual `useActionState` + toasts). Readers looking in `hooks/` miss them; readers in `components/` expect components.
  - Where: `src/components/use-github-repo-search.ts`, `src/components/use-github-repo-connect.ts`; canonical home `src/hooks/` (`use-action-toast.ts:13-16,27-64`, `use-copy.ts:13-32`).
  - Current: split-brain hook location.
  - Change: move both files to `src/hooks/` with import-path updates only. Optionally inline `use-github-repo-connect.ts:12-13,17-24` into the picker (it is a near-trivial `useActionState` pairing) — but the move alone is the win; inlining is optional.
  - Next.js principle: project structure should group by responsibility (hooks with hooks), not by first consumer.
  - Impact: one place to find client state logic; no behavior change.
  - Risk: low.

- [ ] **Unify the duplicated repo-search validation (`github-repo-search.ts` vs `core/validate.ts`)**
  - Why: `src/components/github-repo-search.ts:1-8` deliberately stays out of `src/core` to keep the picker zod-free, so `use-github-repo-search.ts:5-9` hand-rolls `parseGitHubRepoSearchResponse`. That leaves two validators for the same shape by design (bundle motive documented) — but the duplication is invisible unless you read both comments.
  - Where: `src/components/github-repo-search.ts`, `src/components/use-github-repo-search.ts:5-9`, `src/core/validate.ts` (`entityIdSchema`, `parseForm`/`parseInput`/`parseEntityId`).
  - Current: hand-rolled parser + shared zod primitives, same shape, two owners.
  - Change: keep the zod-free constraint, but add one comment in each file pointing at the other ("shape mirror of X — update both"), or extract the shape to a zod-free `*.types.ts` both import. No bundle change; documentation-grade fix.
  - Next.js principle: client-bundle constraints are real, but mirrored shapes must be visibly linked or they drift.
  - Impact: the next schema change updates both parsers instead of one.
  - Risk: low.

- [ ] **Clarify the `remediation.ts` vs `verified-fix.ts` naming overlap in `src/ai/`**
  - Why: `src/ai/remediation.ts` and `src/ai/verified-fix.ts:11-24,54-83` both propose/verify fixes, and `verified-fix.ts` is both implementation (`generatePatchCandidate`) and barrel (re-exports `patch-types`/`patch-apply`/`patch-gate`). New readers cannot tell which module to reach for.
  - Where: `src/ai/verified-fix.ts:11-24`, `src/ai/remediation.ts`, `src/ai/patch*.ts`.
  - Current: two fix-related entry points + barrel mixing.
  - Change: rename or re-scope so one module owns "propose" and the other owns "verify", and move the barrel re-exports to a dedicated `patch.ts` or delete them if callers can import directly. Rename-only; no logic change.
  - Next.js principle: file names should mirror responsibility; a module should not be both implementation and barrel.
  - Impact: obvious import target for AI-fix work.
  - Risk: low.

- [ ] **Audit the generic-component layer for over-abstraction (`page-primitives`, `StatusBadge` family, `badge-with-description`, `formatted-datetime`)**
  - Why: none of these is individually wrong — `src/components/page-primitives.tsx:18-250` (`PageHeader/PageSection/PageContent/EmptyState/NoProjectNotice/PageActionLink/MetaTile`), `src/components/badges.tsx:38-176` (`StatusBadge` + 7 thin per-status wrappers over `core/display`), `badge-with-description.tsx:11-31` (31-line tooltip wrapper that lets `badges.tsx:14` stay server), `formatted-datetime.tsx:3-4` (thin `formatDateTime` wrapper with intentional client-TZ comment `:9-21`). Together they push every page toward the same hero glow (`page-primitives.tsx:15-16`) and a 1:1 wrapper per enum value. Worth a periodic review, not a rewrite.
  - Where: files above; `STATUS_TONE_BADGE` tables in `src/core/display/`.
  - Current: justified generic kit with mild boilerplate drift.
  - Change: no change now. Next time a page needs a non-standard header or a new status appears, prefer a local variant over extending the universal renderer, and note the decision in the PR. Revisit in one quarter.
  - Next.js principle: composition over universal renderers; generic kits earn their keep only while every consumer genuinely shares the design.
  - Impact: prevents slow convergence on one-size-fits-all UI.
  - Risk: low (observation, not a diff).

---
