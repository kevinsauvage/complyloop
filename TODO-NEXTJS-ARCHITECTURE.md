# TODO — Next.js Architecture Audit

**Project:** Compliance Engineering Platform (Next.js 16.3 / React 19 / App Router)  
**Method:** Graft-backed inspection of `src/app`, `src/server`, `src/components`, `src/core`, packages — no application code changed.  
**Verdict:** The architecture is already largely idiomatic Next.js: Server Components + Server Actions, React `cache()` on loaders, slot composition around a thin client shell, and a justified package split (`analysis-core` / `db` / `check`). The main risks are **boundary discipline** (pages talking to Drizzle directly), **blanket `force-dynamic`**, and a few **client islands that are larger than their interactivity requires** — not a need for new framework layers.

---

## What is already solid

- **App Router shape** — Route groups `(app)` / `(marketing)`, nested `loading.tsx` / `error.tsx` / `not-found.tsx`, and thin layouts (`src/app/(app)/layout.tsx`, `src/app/(app)/findings/layout.tsx`).
- **Request dedupe** — `getWorkspace`, `getProjectRuntime`, `getSession`, and `loadNavAttention` use React `cache()` (`src/server/workspace.ts`, `src/server/project-runtime.ts`, `src/server/auth-session.ts`, `src/components/nav-attention-badges.tsx`).
- **Server Actions pattern** — `runAction` + `refresh` / `revalidatePath` (`src/server/action-state.ts`, `src/server/actions/shared.ts`) with client forms (`stateful-action-form.tsx`, `use-action-toast.ts`).
- **Client boundary via slots** — `(app)/layout.tsx` keeps `AppShell` client but passes server-rendered `workspaceContext`, `authControls`, and Suspense-streamed `navLinks` as `ReactNode` slots.
- **Next 16 proxy** — `src/proxy.ts` stays thin (JWT + path gates) and deliberately avoids importing heavy `@/auth` into the edge bundle.
- **Module boundaries** — Documented dependency direction (`docs/ai/architecture.md`): contract → db/catalog/app; `src/core` stays UI/RBAC contract without pulling analysis engines.
- **Justified API routes** — Webhooks (`api/github/webhook`), Auth.js (`api/auth/[...nextauth]`), health, internal job runner, and client polling (`api/projects/[projectId]/assessment-jobs`, `api/github/repos`) are real HTTP needs, not fake BFF layers for Server Components.

---

## P0 — Critical

- [ ] **Fence server modules with `server-only`**
  - Why: Almost no `server-only` imports exist under `src/` / `packages/` (only a comment in `src/lib/report-client-error.ts`). Accidental client import of a `@/server/*` value module (DB, tokens, GitHub) would silently pull secrets into the client graph; type-only imports today (`app-shell.tsx` → `NavAttentionCounts`) are safe by luck/discipline, not by enforcement.
  - Where: `src/server/**` entrypoints (at minimum `workspace.ts`, `workspace-write.ts`, `project-runtime.ts`, `db.ts`, `auth-session.ts`, `nav-attention.ts`, `github-*.ts`, `assessment-*.ts`); optionally `packages/db/src/postgres.ts`.
  - Current: Server code relies on convention and ESLint; bundler will not fail closed if a Client Component imports a server helper by mistake.
  - Change: Add `import "server-only"` at the top of server entry modules (and any barrel that re-exports them). Keep type-only re-exports in separate `*.types.ts` files if client components need shared types.
  - Next.js principle: Mark server-only modules so the React Client Components bundler fails at build time on illegal imports.
  - Impact: Turns a silent security/bundle risk into a hard build error; clarifies the server/client boundary without new abstractions.
  - Risk: low

---

## P1 — High

- [ ] **Stop calling Drizzle/`@complyloop/db/repo/*` directly from App Router pages**
  - Why: Documented read path is `getWorkspace()` (tenancy) + `getProjectRuntime()` / repo helpers behind `src/server/*` (`docs/ai/architecture.md`). Pages currently open Postgres themselves, mixing persistence into the UI layer and bypassing the project-runtime cache story for some queries.
  - Where: `src/app/(app)/findings/page.tsx` (`getDrizzle` + `countFindingsByStatusForProject`); `src/app/(app)/evidence/page.tsx` (`getDrizzle` + evidence/requirements repo); `src/app/(app)/findings/[id]/page.tsx` (`listEvidenceForFinding`); `src/app/(app)/evidence/export/route.ts`.
  - Current: RSC pages import `@complyloop/db/postgres` and repo functions alongside `getWorkspace` / `getProjectRuntime`.
  - Change: Move those queries behind small server loaders (e.g. `countFindingsByStatusForActiveProject`, `loadEvidencePage`, `listEvidenceForFindingScoped`) colocated under `src/server/` (or extend `getProjectRuntime` options where the data is project-scoped). Pages should import only `@/server/*` + `@/core/*`.
  - Next.js principle: Keep data access in the server data layer; pages compose loaders, they do not own DB clients.
  - Impact: One place for authz + project scoping + `cache()`; easier to reason about waterfalls; pages shrink.
  - Risk: medium

- [ ] **Revisit blanket `export const dynamic = "force-dynamic"` on every authenticated page**
  - Why: Every `(app)` page and most API routes set `force-dynamic` while mutations already `revalidatePath` and loaders use React `cache()`. Forcing dynamic everywhere disables Static/Partial Prerender benefits and hides whether dynamic is required for cookies/auth or cargo-culted.
  - Where: `src/app/(app)/dashboard/page.tsx`, `findings/page.tsx`, `findings/[id]/page.tsx`, `evidence/page.tsx`, `requirements/page.tsx`, `org/page.tsx`, `settings/page.tsx`, plus matching API routes under `src/app/api/**` and evidence export/report routes.
  - Current: Explicit `force-dynamic` on essentially all authenticated surfaces.
  - Change: Keep `force-dynamic` (or `connection()` / `headers()`/`cookies()` usage) only where auth or per-user cookies make static rendering impossible. Prefer default dynamic-from-usage + targeted `revalidatePath` (already in `src/server/actions/shared.ts`). Document the decision once in `docs/ai/architecture.md`.
  - Next.js principle: Let the framework infer dynamic from `cookies()`/`headers()`/uncached IO; do not blanket-opt out of the cache model.
  - Impact: Clearer caching story; possible faster navigations for marketing/(public) and any future cacheable fragments; less “everything is special”.
  - Risk: medium (must re-test auth gating and post-mutation freshness)

- [ ] **Shrink the `AppShell` client island**
  - Why: `src/components/app-shell.tsx` is `"use client"` and wraps all authenticated UI. Slots already keep children as Server Components (good), but brand chrome, desktop sidebar structure, and skip-link do not need client JS. Client responsibility is really mobile `Sheet` open state + pathname-driven close/focus.
  - Where: `src/components/app-shell.tsx`; consumers `src/app/(app)/layout.tsx`.
  - Current: Entire shell module is client; imports `usePathname`, `Sheet`, `ThemeToggle`, etc.
  - Change: Split into a Server Component shell (layout chrome + slots) and a small `MobileNavSheet` / `PathnameEffects` client child. Keep `NavLinks` / `ThemeToggle` as leaf client components.
  - Next.js principle: Push `"use client"` to the leaves; compose interactive pieces inside Server Components.
  - Impact: Less client JS on every authenticated navigation; clearer mental model of what is interactive.
  - Risk: medium (mobile nav + a11y focus behavior)

- [ ] **Make status badges Server-Component-friendly**
  - Why: `src/components/badges.tsx` is entirely `"use client"` because of Tooltip wrappers, so every list/detail that shows statuses pays for a client module even when tooltips are unused or could wrap only the interactive bit.
  - Where: `src/components/badges.tsx`; heavy consumers under `src/app/(app)/findings/**`, dashboard, requirements.
  - Current: Badge markup + `BadgeWithDescription` live in one client file importing `@/core/display` and contract types.
  - Change: Keep pure badge presentational components as Server Components (or shared components without `"use client"`); isolate `BadgeWithDescription` (tooltip) as the only client export.
  - Next.js principle: Interactivity boundary at the tooltip, not at the badge vocabulary.
  - Impact: Smaller client bundles on findings/dashboard lists; badges reusable from RSC without prop-drilling through client parents.
  - Risk: low

- [ ] **Clarify `src/components` vs `src/server` ownership for data-fetching UI**
  - Why: Async server components under `src/components/` (`workspace-context.tsx`, `connect-project-panel.tsx`, `nav-attention-badges.tsx`, `dashboard-pipeline-section.tsx`) correctly fetch, but sit beside 40+ client modules in the same tree — easy to accidentally add `"use client"` higher and break imports.
  - Where: `src/components/workspace-context.tsx`, `connect-project-panel.tsx`, `nav-attention-badges.tsx`, `dashboard/dashboard-pipeline-section.tsx`.
  - Current: Server Components and Client Components share one flat/feature folder with no naming or folder cue (`*.server.tsx` or `components/server/`).
  - Change: Either (a) colocate data-fetching UI next to routes (`src/app/(app)/_components/`), or (b) adopt a cheap convention (`*.server.tsx` / `components/rsc/`) and document it in AGENTS.md. Do **not** add a new DI/service layer.
  - Next.js principle: Colocate by route responsibility; make Server vs Client obvious at a glance.
  - Impact: Fewer accidental client-boundary bugs; faster onboarding.
  - Risk: low

---

## P2 — Medium

- [ ] **Split oversized route modules and client pickers**
  - Why: Large files mix loading, filtering, and presentation, which slows review and encourages more `"use client"` creep when someone needs one interactive bit.
  - Where: `src/app/(app)/evidence/page.tsx` (~395 lines), `src/app/(app)/findings/page.tsx` (~378), `src/app/(app)/findings/[id]/page.tsx` (~311), `src/components/github-repo-picker.tsx` (~419), `src/components/findings/findings-bulk-list.tsx` (~287), `src/components/findings/findings-filter-bar.tsx` (~272).
  - Current: Page files own query-param parsing, data loads, empty states, and composition.
  - Change: Extract pure presentational sections and URL-param parsers (`src/core/filter-params.ts` already exists — push more parsing there). Keep the page as an async composer. For `github-repo-picker`, separate fetch/search state from list UI.
  - Next.js principle: Pages as thin Server Component composers; leave interactivity in small client leaves.
  - Impact: Easier changes to findings/evidence UX; clearer test seams without new layers.
  - Risk: low

- [ ] **Reduce duplicate workspace/capability plumbing in pages**
  - Why: Most pages repeat `getWorkspace()` → `projectCapabilities(...)` → empty states. `cache()` dedupes the fetch, but the boilerplate still scatters authz/empty UI.
  - Where: `dashboard/page.tsx`, `findings/page.tsx`, `findings/[id]/page.tsx`, `requirements/page.tsx`, `settings/page.tsx`, `org/page.tsx`, `evidence/page.tsx`; also `WorkspaceContext`.
  - Current: Each page re-implements the “no project / no access” branches.
  - Change: Optional thin helper in `src/server/` (e.g. `requireActiveProjectPage()`) returning `{ project, caps, access }` or a redirect/empty result — **not** a React context for server data.
  - Next.js principle: Share server loaders; avoid client context for server-fetched workspace state.
  - Impact: Smaller pages; consistent empty/permission UX.
  - Risk: low

- [ ] **Keep toast usage on the centralized path**
  - Why: AGENTS.md asks to keep success/error toasts on `useActionToast` / `action-state.ts`. Direct `sonner` calls still appear outside that path.
  - Where: `src/components/org-data-lifecycle.tsx`, `src/hooks/use-copy.ts` (plus the intentional `use-action-toast.ts` / `ui/sonner.tsx`).
  - Current: Mixed toast entry points.
  - Change: Route copy/org lifecycle feedback through the same helpers (or document an explicit exception for clipboard-only UX).
  - Next.js principle: One client feedback channel for Server Action results.
  - Impact: Consistent UX; fewer one-off toast styles.
  - Risk: low

- [ ] **Confirm API route vs Server Action split stays intentional**
  - Why: Two client-facing JSON routes exist beside a rich Server Action surface; that is fine if documented, confusing if not.
  - Where: `src/app/api/github/repos/route.ts` (picker typeahead); `src/app/api/projects/[projectId]/assessment-jobs/route.ts` (polled by `assessment-job-status-live.tsx`); contrast `src/server/actions/**`.
  - Current: Mutations → Server Actions; polling/search → Route Handlers. Good separation, but undocumented in architecture.md.
  - Change: Add a short “when to add a Route Handler” note to `docs/ai/architecture.md`. Do **not** convert polling/search to Server Actions.
  - Next.js principle: Server Actions for mutations; Route Handlers for webhooks, streaming/polling, and non-form HTTP APIs.
  - Impact: Prevents future “wrap everything in an action” or “proxy everything through `/api`” drift.
  - Risk: low

- [ ] **Tighten `src/server` surface area as the app grows**
  - Why: `src/server/` is a large flat-ish module (actions/, assessment*, github*, workspace*, report*, …). Domain value is real (jobs, GitHub, writes), but discoverability suffers and encourages cross-imports.
  - Where: `src/server/` (notably assessment/*, github/*, workspace-write.ts, project-rows.ts).
  - Current: Feature files + `actions/` subfolder; write path uses `ProjectWritePayload` / clone helpers (justified by locking/stale-write guards per architecture.md).
  - Change: Group by domain folders (`server/assessment/`, `server/github/`, `server/workspace/`) **without** introducing repositories/services/controllers on top of `packages/db/repo`. Keep `withProjectWrite` — it solves real concurrency, not ceremony.
  - Next.js principle: Organize by domain; prefer framework + existing db repo over new app-level repository abstractions.
  - Impact: Faster navigation for agents/humans; clearer import direction.
  - Risk: medium (import churn)

---

## P3 — Low

- [ ] **Evaluate TooltipProvider / ThemeProvider placement**
  - Why: Root layout wraps the entire tree in `ThemeProvider` + `TooltipProvider` (`src/app/layout.tsx`), which is normal for next-themes/Radix but means every route inherits those client providers.
  - Where: `src/app/layout.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/sonner.tsx`.
  - Current: Providers at the HTML shell — correct for theme FOUC prevention (`suppressHydrationWarning`).
  - Change: Leave as-is unless marketing pages need zero client JS; if so, move providers under `(app)/layout.tsx` only and keep marketing free of tooltip/toaster clients.
  - Next.js principle: Providers only where needed; marketing can stay lighter than the app shell.
  - Impact: Slightly less client JS on `/`, `/login`, legal pages.
  - Risk: low

- [ ] **Normalize `"use client"` quote/style in `ui/`**
  - Why: Minor inconsistency (`"use client"` vs `"use client"` without semicolon) across `src/components/ui/*` — noise in reviews, not architecture.
  - Where: `src/components/ui/alert-dialog.tsx`, `avatar.tsx`, `collapsible.tsx`, `dialog.tsx`, etc.
  - Current: Mixed directive formatting.
  - Change: Match project ESLint/prettier defaults.
  - Next.js principle: N/A (hygiene).
  - Impact: Cleaner diffs.
  - Risk: low

- [ ] **Avoid growing new Radix/`ui/` primitives without consumers**
  - Why: Already policy in AGENTS.md; audit found a healthy but large `ui/` set — keep the gate.
  - Where: `src/components/ui/**`, `components.json`.
  - Current: shadcn-style primitives with multiple consumers.
  - Change: No structural change — enforce the existing “2+ consumers” rule when adding primitives.
  - Next.js principle: Prefer composition of existing primitives over new abstractions.
  - Impact: Keeps dependency surface small.
  - Risk: low

---

## Biggest Architectural Wins

1. **Add `server-only` fences** on `src/server` (and db postgres entry) — cheapest high-severity boundary fix.  
2. **Route all page DB access through `@/server` loaders** — aligns code with `docs/ai/architecture.md` and `cache()`.  
3. **Drop unnecessary `force-dynamic`** where cookies/auth already imply dynamic rendering — restores a coherent Next cache story.  
4. **Split `AppShell` into server chrome + small client nav** — less JS on every authenticated page without losing UX.  
5. **Split `badges.tsx` so tooltips are the only client export** — findings/dashboard lists stay mostly RSC.  
6. **Make Server Components in `src/components` obvious** (route colocation or naming) — prevents accidental client promotion.  
7. **Thin oversized pages/pickers** into composers + leaves — maintainability without new layers.  
8. **Document API route vs Server Action rules** — locks in the good split you already have (poll/search/webhook vs mutations).  
9. **Optional `requireActiveProjectPage` helper** — delete repeated workspace/empty boilerplate.  
10. **Domain-folder `src/server` later** — only after the above; do not invent services/repositories above `packages/db`.

---

*Generated for simplicity-first Next.js alignment. Prefer native App Router patterns over new architectural layers.*
