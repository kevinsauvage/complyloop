# TODO — Next.js Architecture Audit

> Deep audit of the actual codebase (App Router, server/client boundaries, layers, React, data fetching).
> Principle applied throughout: **Next.js native → simple React → existing project abstraction → new abstraction**.
> No code changed — this file is the only output.

**Verdict up front:** the architecture is already idiomatic Next.js in the ways that matter most.
Pages are async RSCs, mutations are Server Actions, Route Handlers exist only for webhooks/polling/downloads/auth/health/worker,
`server-only` fencing holds, pages never import `@complyloop/db/repo/*` directly, and the server→slots→client-leaf
pattern (`AppShell`, `WorkspaceContext`, `ConnectProjectPanel`, `NavAttentionBadges`) is exemplary.
The problems below are therefore mostly **simplification opportunities, not framework misuse**.
There is exactly one P0 (a real dependency-direction violation); everything else is P1–P3.

---

## P1 — High

- [ ] **Stop shipping client JS to marketing pages (`TooltipProvider` + `Toaster` in root layout)**
  - Why: `src/app/layout.tsx:49-59` wraps _every_ route — including static `/`, `/login`, `/legal/*` — in `next-themes` + Radix tooltip + Sonner. Marketing pages pay client-JS cost for app-only interactivity. The repo already acknowledges this (`docs/ai/architecture.md:250-253`: "until marketing pages need zero client JS").
  - Where: `src/app/layout.tsx:49-59` (`ThemeProvider` at `:49-54`, `TooltipProvider` at `:55-58`, `Toaster` at `:57`); marketing shell `src/app/(marketing)/layout.tsx:8-30`, pages `src/app/(marketing)/page.tsx`, `src/app/(marketing)/login/page.tsx`, `src/app/(marketing)/legal/*/page.tsx`.
  - Current: one global provider shell for app + marketing.
  - Change: keep `ThemeProvider` in the root (it must stay high to avoid FOUC). Move `TooltipProvider` + `Toaster` into `src/app/(app)/layout.tsx` so only the authenticated shell ships them. Verify no marketing component uses `Tooltip`/`sonner` first (today: none — toasts live in `src/hooks/use-action-toast.ts`, used only by app forms).
  - Next.js principle: push client providers as far down as the routes that need them; keep the root layout server-only HTML shell.
  - Impact: marketing routes ship ~zero client JS; app behavior unchanged.
  - Risk: low (layout-only move; confirm with `next build` bundle + visual check of toasts/tooltips in `(app)`).

---

## P2 — Medium

- [ ] **Convert `GitHubRepoList` back to a Server Component (keep `ConfirmSubmitButton` as the island)**
  - Why: `src/components/github-repo-list.tsx:1` carries `"use client"` but contains zero hooks, zero browser APIs, zero handlers — just grouping + `<form action={…}>` + `<Badge>`/`<Button>`. The directive forces the entire repo list (group headers + rows) into the client bundle for no reason. `ConfirmSubmitButton` (`src/components/confirm-submit-button.tsx:1`, client via `useFormStatus` + `AlertDialog`) already works as a client island inside an RSC parent.
  - Where: `src/components/github-repo-list.tsx:1-133` (directive at `:1`; type-only server import at `:7`, erased at build); parent `src/components/github-repo-picker.tsx` (client); grandparent `src/components/connect-project-panel.tsx:108-113` (server).
  - Current: whole list renders client-side.
  - Change: delete the `"use client"` line; keep `ConfirmSubmitButton` imported as-is (client child of server parent — the sanctioned slots pattern, same as `badges.tsx` importing `BadgeWithDescription`). Verify `STATUS_TONE_BADGE` (`src/core/display`) stays client-safe (it is — pure tables). If the picker parent must stay client for search state, extract the list as an RSC child rendered with serialized props.
  - Next.js principle: Server Components by default; forms posting to Server Actions do not need `"use client"` — only the pending-state/confirm-dialog button does.
  - Impact: largest convertible client-bundle win in the repo (a whole list, not a button); pattern reference for future "does this file really need the directive?" checks.
  - Risk: low (leaf change; confirm dialog + form actions still work; cover with picker tests).

- [ ] **Add the four missing segment `error.tsx` boundaries (or record the fallback as intentional)**
  - Why: `dashboard` and `findings*` have granular `error.tsx`; `requirements`, `evidence`, `org`, `settings` do not and fall back to `(app)/error.tsx`. A failure in settings copy therefore unmounts the whole app shell instead of the segment. Either the fallback is intended (less code) or granularity is wanted — today it is accidental inconsistency.
  - Where: present `src/app/(app)/dashboard/error.tsx:5-23`, `src/app/(app)/findings/error.tsx:5-20`, `src/app/(app)/findings/[id]/error.tsx:5-20`; absent `src/app/(app)/requirements/error.tsx`, `src/app/(app)/evidence/error.tsx`, `src/app/(app)/org/error.tsx`, `src/app/(app)/settings/error.tsx` (all three have `loading.tsx` but no `error.tsx`).
  - Current: four segments inherit `(app)/error.tsx:5-20`.
  - Change: either (a) add the four thin `error.tsx` wrappers delegating to `ReportedError` like the existing ones (copy-paste, ~15 lines each), or (b) add one line to `docs/ai/architecture.md` stating the fallback is intentional to avoid boundary sprawl. Recommended: (a) — the existing wrappers are already trivial and the per-segment retry UX is better.
  - Next.js principle: `error.tsx` per segment that can fail independently; inherit only when the parent boundary is genuinely the right retry scope.
  - Impact: failures stay scoped to the segment; retry doesn't blow away the whole workspace shell.
  - Risk: low.

- [ ] **Remove the Sentry demo page + demo API from production (or gate behind dev)**
  - Why: `src/app/sentry-example-page/page.tsx:1-237` is the sole page-level `"use client"` in the app, uses legacy `next/head` (`:3,29-32`) instead of the `metadata` API, inlines 120 lines of `<style>` (`:113-234`), and fetches `src/app/api/sentry-example-api/route.ts:12-17` (intentionally throwing). It ships demo JS to prod and is the one file newcomers must be told "do not copy".
  - Where: `src/app/sentry-example-page/page.tsx:1-3` (directive + `next/head` + hooks), `src/app/api/sentry-example-api/route.ts:12-17`.
  - Current: live demo route in the production bundle.
  - Change: delete both files (Sentry stays wired via `src/instrumentation*.ts`, `src/sentry/`, `proxy.ts:100-107` tunnel — none of that depends on the demo). If the team wants a manual Sentry trigger, keep it dev-only (`process.env.NODE_ENV !== "production"` redirect or remove from `sitemap`/nav so it is unreachable).
  - Next.js principle: framework `metadata` API over `next/head`; no demo routes in the shippable tree.
  - Impact: less prod JS, one fewer "don't copy this" exception, cleaner `src/app/` listing.
  - Risk: low.

- [ ] **Consolidate the action idiom trio (`shared.ts` + `define-action.ts` + `refresh-routes.ts`)**
  - Why: parse → scoped-write → revalidate is spread over three files: `src/server/actions/shared.ts:35-81` (`refresh`, `requireOnActive`, `requireOnFindingProject`, `requireFindingContext`), `src/server/actions/define-action.ts:24-54` (`runFindingAction`, `runProjectAction`), `src/server/actions/refresh-routes.ts:10-15` (`COMPLIANCE_LOOP_ROUTES`). Readers assemble the canonical mutation shape from three jump-to-definitions. The 2-line `requireFindingContext` (`shared.ts:73-81`, just returns `{ finding, project }`) is the clearest delete candidate.
  - Where: the three files above; 12+ consumers in `src/server/actions/*.ts`.
  - Current: helpers + wrappers + route allow-list in separate modules.
  - Change: inline `requireFindingContext` into its callers (or into `define-action.ts`), and either fold `COMPLIANCE_LOOP_ROUTES` into `define-action.ts` or keep it only if a second consumer beyond `define-action.ts` + `shared.ts` needs it. Keep `runFindingAction`/`runProjectAction` — they are used widely enough to justify the wrapper. Goal is two files max (`shared.ts` guards + `define-action.ts` wrappers), not one mega-module.
  - > **Decided 2026-09-17: keep all three files.** `COMPLIANCE_LOOP_ROUTES` has 6 direct importers (not single-use); wrappers have 6 call sites. `requireFindingContext` deleted (zero callers). No further action.
  - Next.js principle: Server Action boilerplate should read top-to-bottom in one place; indirection across three files for one idiom is abstraction tax.
  - Impact: the mutation idiom fits in one screen; fewer files to open per action review.
  - Risk: low (mechanical; action tests cover it).

- [x] **Pick one canonical import for `ActionState` (kill the compat re-export)** — DONE 2026-09-17: re-export removed from `server/action-state.ts`; all 25 import sites canonicalized on `@/core/action-state` (the split was wider than this item assumed — relative `../action-state` imports across 12 action files + 11 test files).
  - Why: `src/server/action-state.ts:9-14` re-exports `ActionState`/`initialActionState`/`unexpectedActionMessage` from `@/core/action-state` "so existing callers keep importing from here" — but the migration never finished. Callers are split (`src/components/org-data-lifecycle.tsx:27` from core, `src/components/stateful-action-form.test.tsx:5` from server), so every reader must check both.
  - Where: `src/server/action-state.ts:9-14` (re-export), `src/core/action-state.ts:1-5` (client-safe canonical, deliberately kept out of server logging).
  - Current: two valid import paths for the same type.
  - Change: standardize on `@/core/action-state` for the type + pure helpers, `src/server/action-state.ts` only for `publicErrorMessage`/`runAction` (server behavior). Codemod the server-path type imports to core; leave the re-export or remove it once grep is clean.
  - Next.js principle: client-safe shared types live in one unfenced module; server-only behavior stays fenced — never two public paths for one type.
  - Impact: one import to remember; no more split-brain grep results.
  - Risk: low.

---

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

## What was checked and deliberately left alone

- `src/proxy.ts:90-159` (not `middleware.ts`) is the correct Next 16 convention — do not "restore" middleware.
- `force-dynamic` only on JSON Route Handlers (`api/github/repos`, `assessment-jobs`, `health`, `internal/jobs/run`) — no blanket `force-dynamic` on pages. Correct.
- Client `fetch()` to `/api/github/repos` (debounced search, abort, pagination in `use-github-repo-search.ts:21-24,112-135`) and to `/api/projects/[projectId]/assessment-jobs` (3s poll + `router.refresh()` in `assessment-job-status-live.tsx:48-62`) are both justified client dynamics — RSC and Server Actions cannot replace them without behavior loss.
- No server→server `fetch()` to own routes; external `fetch()` is only GitHub dispatches (`assessment-job-dispatch.ts:47-59`) and OAuth exchange (`github-tokens.ts:187`). Correct — do not route through `/api` proxies.
- `(app)` evidence download routes (`evidence/export/route.ts:9`, `report/route.ts:18`, `report/html/route.ts:7`) correctly live outside `/api` as browser `<a download>` targets via `reportHref` (`src/core/filter-params/evidence.ts:99-102`); they go through the `proxy.ts:111` login redirect rather than 401 JSON, which is correct for links.
- `server-only` fencing holds (56 carriers, zero client imports of fenced modules); client→`@/server` edges are only `"use server"` actions + erased `import type` (`github-types.ts` unfenced by design). `getDrizzle()` appears only in sanctioned loaders/repos, never in actions or pages. `raw getDrizzle()` in `api/health/route.ts:18-22` is the allowed health-probe exception.
- 56 `"use client"` files audited: ~51 justified (6 error boundaries incl. `app/error.tsx:1`, `global-error.tsx:1`; 10 Radix `ui/*` leaves; shell leaves `mobile-nav-sheet`, `pathname-focus`, `nav-links`, `theme-toggle` correctly slotted under server `AppShell`; 13 `useActionState`/`useFormStatus` form leaves; polling/search/keyboard/clipboard leaves). No page-level client except the Sentry demo (handled above).
- `ThemeProvider` must stay in the root layout (FOUC); only `TooltipProvider`/`Toaster` should move down.
- `packages/db/repo/*` concrete functions as the persistence API (no abstract repositories/DI) is correct — do not introduce interfaces-per-table.
- `src/core` stays pure/client-safe (no db/catalog imports; zod-free `filter-params.ts:1-8`, `action-state.ts:1-5`); `src/ai` never sets statuses. Both constraints hold — do not "simplify" by merging them.

---

## Biggest Architectural Wins (highest value first)

1. ~~**Fix the `workspace-write → actions/shared` inversion** — the only real layering violation; restores one-way `actions → workspace → db/repo`.~~ — DONE 2026-09-17.
2. ~~**Split `project-view.ts` per route + give settings its own loader** — the 769-line god-loader and its one exception (`settings/page.tsx:48`) are the biggest readability tax in the app layer.~~ — DONE 2026-09-17.
3. ~~**`Promise.all` the independent loader awaits** — free latency win on every dashboard/findings/requirements/evidence load.~~ — DONE 2026-09-17 (where genuinely independent).
4. **Move `TooltipProvider` + `Toaster` to `(app)/layout.tsx`** — marketing pages stop shipping app-only client JS; root stays a server shell.
5. ~~**Make `github-connector.ts` the enforced boundary or delete it** — ends the four-file "which github module?" chase.~~ — DONE 2026-09-17 (documented boundary, not enforced).
6. **Convert `GitHubRepoList` to RSC** — the biggest convertible client-bundle win; establishes the "forms don't need the directive" precedent.
7. ~~**Consolidate the action-idiom trio + canonicalize the `ActionState` import** — the mutation path reads top-to-bottom instead of across three files and two import paths.~~ — DONE 2026-09-17 (trio kept by decision above; `ActionState` canonicalized).
8. **Add the four missing segment `error.tsx` files; delete the Sentry demo** — scoped retries where they matter, and one fewer legacy-`Head` demo in prod.
