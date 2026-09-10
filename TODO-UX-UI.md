# TODO-UX-UI — Prioritized UI/UX Audit

Product: ComplyLoop (RGAA/WCAG compliance engineering, Next.js + shadcn/ui).
Scope: marketing home, login, dashboard, findings list + detail, requirements, evidence, settings, org, app shell/nav.
Method: inspected actual implementation + UI/UX Pro Max guidelines (feedback, accessibility, loading/empty/error states, shadcn focus/table/sidebar rules).

## P2 — Medium

- [ ] **Verify and fix status-tint text contrast (light mode)**
  - Why: `STATUS_TONE_BADGE` uses `bg-*/25` tints with colored text (`text-status-*`, `text-signal`) on `bg-card/80` over a grid background. Cyan/signal and review tones are at risk below 4.5:1 in light mode; dark mode was brightened but light was not.
  - Where: `src/core/status-display.ts:354-365`, `src/app/globals.css:59-101`, `src/components/dashboard/dashboard-overview.tsx:14-30`
  - Change: darken light-mode `signal`, `status-review`, `status-unverifiable` text values until 4.5:1 on card background (test with grid off). If tint fails, use solid `border-current bg-transparent` for outline variants (already done for Serious — extend). Never use color alone: badges already have labels — keep.

- [ ] **Tone down global grid + frosted panels behind dense content**
  - Why: fixed 48px grid (`background-attachment: fixed`) shows through `surface-panel (card 80%)` and `panel-frost`, adding noise behind tables, code, and badges. `card-sheen` gradient overlays every header.
  - Where: `src/app/globals.css:154-226`, `src/components/page-primitives.tsx:13-14`
  - Change: raise `surface-panel` to `card 96%` (opaque) for content cards; keep translucency only for sidebar/mobile header. Reduce grid opacity by 50% or disable below `lg`. Keep `card-sheen` on marketing + dashboard hero only, remove from `PageHeader` panel variant.

- [ ] **Clarify QuickStatTile click affordance**
  - Why: linked stats show value + dotted-underline label + faint arrow; unlinked stats look identical minus arrow. Users cannot predict which tiles navigate (`Pass rate` never links, others link conditionally on count > 0).
  - Where: `src/components/dashboard/dashboard-overview.tsx:32-76`
  - Change: only linked tiles get hover border + arrow + `hover:text-signal` title; unlinked tiles get `cursor-default` and no underline. Add `aria-label="View open findings"` style labels (not just visible text). Keep 2-col mobile / 4-col desktop grid.

- [ ] **Deduplicate requirement-card CTAs and metadata**
  - Why: each card repeats `N open findings` link + `See findings` button + `updated …` + two status badges. In a 30-requirement preset page this is 30 identical buttons.
  - Where: `src/components/requirements/requirement-card.tsx:55-142`
  - Change: keep only inline `N open findings →` link in meta line; drop per-card `See findings` button except for `failed/needs_review` (keep, `variant="outline"`). Move `updated` to `title=` tooltip or muted suffix. Single `RequirementStatusBadge` + `Determination` as text, not two pills.

- [ ] **Make org members + repo picker usable on mobile**
  - Why: members table relies on `overflow-x-auto` with no card fallback; repo rows (`flex-wrap justify-between`) push Connect/Disconnect below description, truncating `fullName`. Owner-only lifecycle card misuses `aria-disabled="true"` on a `Card`.
  - Where: `src/app/(app)/org/page.tsx:162-193`, `src/components/github-repo-picker.tsx:300-348`
  - Change: below `sm`, stack members as definition lists (name/role/actions per row) or allow table scroll with sticky first column. Repo row: fullName `break-all` (not `truncate`), action button `w-full sm:w-auto`. Replace `aria-disabled` with plain muted card + explanation text.

- [ ] **Expose theme toggle on mobile header; fix sidebar footer crowding**
  - Why: `ThemeToggle` lives in sidebar footer (`SidebarBody`) — mobile users must open the nav Sheet to switch themes. Sidebar footer stacks ThemeToggle + auth + tagline + legal with equal weight.
  - Where: `src/components/app-shell.tsx:61-86,126-156`
  - Change: add icon-only `ThemeToggle` to mobile header next to Menu button. In sidebar footer keep ThemeToggle + auth, demote tagline/legal to single muted line. No new dependencies.

- [ ] **Persist success feedback inline, not toast-only**
  - Why: `StatefulActionForm` shows errors inline (`role="alert"`) but success only via `useActionToast` (sonner, ephemeral). After Approve/Verify/Dismiss users navigating quickly miss confirmation; screen-reader users get no persistent status.
  - Where: `src/components/stateful-action-form.tsx:52-93`, `src/hooks/use-action-toast.ts`
  - Change: on `state.message` (success) render inline `role="status"` line under button (`text-status-passed`) in addition to toast. Keep toast for cross-page actions. Add `pendingLabel` to all assessment/generate forms (some already have `Assessing…` — audit and fill gaps).

- [ ] **Give marketing page proof and distinct CTAs**
  - Why: home has 3 identical `Sign in with GitHub` CTAs, no screenshot/demo/evidence sample, and loop-step arrows (`→`) render only at `xl` so the 6-step flow reads as disconnected cards on most screens.
  - Where: `src/app/(marketing)/page.tsx:83-266`
  - Change: keep one primary CTA per section with distinct labels (`Sign in with GitHub`, `See how it works`, `View sample evidence`). Add a static product screenshot or evidence-trail mock below hero (no video per anti-pattern). Show step connectors on `lg` (`lg:block`), not `xl`, or number-only flow without arrows.

---

## P3 — Low

- [ ] **Document j/k queue shortcuts without hijacking keyboard expectations**
  - Why: `FindingQueueNav` binds global `j/k` (except in inputs) with only a `hidden sm:inline` kbd hint. Touch users get no equivalent; `?`-style shortcut help does not exist.
  - Where: `src/components/findings/finding-queue-nav.tsx:54-71,102-112`
  - Change: add `title="Next finding (j)"` to Prev/Next buttons, keep guard for editable targets (already done). Add one-line `Keyboard: J/K to move` muted hint visible on `sm+` only. Do not add new shortcut libraries.

- [ ] **Map login/auth errors to actionable copy**
  - Why: `?error=` renders one generic `Sign-in with GitHub failed… contact your administrator` regardless of cause (denied, expired, misconfigured).
  - Where: `src/app/(marketing)/login/page.tsx:31-66`
  - Change: map known Auth.js errors (`OAuthAccountNotLinked`, `AccessDenied`, `Configuration`) to specific lines (e.g. `You denied repo access — retry and approve`). Keep fallback generic. Preserve `callbackUrl` validation (already correct).

- [ ] **Stabilize single-page list layouts**
  - Why: `PaginationNav` returns `null` when `totalPages <= 1`, and findings/evidence result-count `<h2>` changes text (`1 open finding` vs `N open findings`) causing vertical shift when filters change.
  - Where: `src/components/pagination-nav.tsx:21`, `src/app/(app)/findings/page.tsx:298-307`, `src/app/(app)/evidence/page.tsx:176-183`
  - Change: reserve result-count heading space (`min-h-5`) and always render pagination slot (hidden with `invisible` when single page). No visual change otherwise.

- [ ] **Reduce decorative motion and respect reduced-motion**
  - Why: `scroll-smooth` globally, `animate-pulse` repo skeletons, `transition-[border-color,box-shadow]` hovers, and marketing radial glows run regardless of `prefers-reduced-motion`. Skeleton `<ul aria-hidden>` has no `aria-busy` pairing in picker empty path.
  - Where: `src/app/globals.css:150-152`, `src/components/github-repo-picker.tsx:277-286`, `src/app/(marketing)/page.tsx:86-89`
  - Change: wrap smooth scroll + pulse + card-sheen animation in `@media (prefers-reduced-motion: no-preference)`. Add `aria-busy={loading}` to repo list container (findings list already has it — mirror).

- [ ] **Consolidate duplicate Run-assessment and Connect-repository triggers**
  - Why: `Run assessment` form mounts in both `DashboardOverview actions` and `FirstAssessmentChecklist`; `ConnectProjectPanel defaultOpen={false}` mounts in both `WorkspaceContext` and dashboard empty card, each with its own dialog state and repo fetch.
  - Where: `src/app/(app)/dashboard/page.tsx:60-66,204,209-212`, `src/components/workspace-context.tsx:60-65`
  - Change: single `AssessmentAction` component reused in both slots (same labels/pending states); single Connect dialog per page (prefer `WorkspaceContext` trigger when `visibleProjects.length === 0`, suppress dashboard duplicate). No behavior change, markup dedup only.
