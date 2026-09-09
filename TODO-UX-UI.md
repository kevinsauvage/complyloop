# TODO-UX-UI — Prioritized UI/UX Improvements

Audited as a real user across marketing, login, dashboard, findings, requirements, evidence, org, settings, and project-connection, against the actual implementation (not docs). Grounded in UI/UX Pro Max rules consulted during the audit: visible focus on every control (incl. modals); 4.5:1 contrast; never color-alone; inline field errors with `aria-describedby` + focusable summary; 44pt-class touch targets with 8px spacing; empty states guide to an action; active filter state must be visible.

Already fixed since the previous audit — not listed below: global `:focus-visible` fallback (`src/app/globals.css:179-182`); explicit Switch-button workspace switcher with pending + live region (`src/components/auto-submit-select-form.tsx:15-82`); findings `nav` + `aria-current` with no tab rewriting (`src/app/(app)/findings/page.tsx:148-153,210-229`); badge `sr-only` definitions (`src/components/badge-with-description.tsx:21-27`); login pending button + inline `?error` alert (`src/app/(marketing)/login/page.tsx:59-66`, `src/components/sign-in-with-github-button.tsx:7-14`); findings explicit Apply + active chips + mobile disclosure (`src/components/findings/findings-filter-bar.tsx:139-181,249-265`).

Conventions: `Why` = user impact. `Where` = exact file/line. `Change` = concrete direction reusing existing tokens/components. Systemic issues appear once. Every item below was re-verified against current code before writing.

---

## P0 — Critical

- [ ] **Fix light-mode status contrast and stop encoding meaning by color alone**
  - Why: pass/fail/review badges, `text-muted-foreground/80`, `opacity-70`, and 11px microcopy on tinted/frosted surfaces drop below 4.5:1 in light mode — the compliance signal is the least readable text. Mid-range pass rates render in failure-red (alarmist, fails colorblind users); timeline "latest" is a dot-color difference only (WCAG 1.4.1 failure, no text alternative).
  - Where: `src/app/globals.css:72,79-85` (light `signal`/`review`/`muted` tokens vs dark-mode fix at `:122-129`); `src/core/status-display.ts:190-208,337-348` (`serious` shares `failed` tone; badge tints at `/25` opacity); `dashboard/page.tsx` + `dashboard-overview.tsx` + `dashboard-status-counts.tsx` (thresholds mapping warning to failure tones, dimmed zeros); `findings/[id]/page.tsx` + `remediation-history.tsx` (dot-only recency, `aria-hidden`); `app-shell.tsx` (11px tagline, `muted/80` footer).
  - Change: mirror the dark-mode strategy in light (fills `/20–/25` or darker text tokens; ban `opacity-70`/`/80` on text; zeros keep full opacity with muted styling instead). Mid-range gets amber + icon/label, never red; differentiate `serious` vs `moderate` (fill vs outline). Mark latest timeline entry with text ("Latest") + `aria-label`. Floor microcopy at `text-xs`, full opacity. Add a contrast-gate test for badge pairs alongside `status-display.test.ts`.

- [ ] **Raise the button scale minimum and fix the smallest dismiss/nav controls**
  - Why: default `h-8` (32px), `sm h-7` (28px), `xs`/`icon-xs h-6`/`size-6` (24px) propagate to modal dismiss, pagination, copy, theme toggle, mobile menu — the hardest-to-hit controls are the smallest. Passes WCAG 2.5.8's 24px floor only with spacing these contexts don't guarantee. Pro Max: 44pt iOS / 48dp Android class targets, 8px gaps.
  - Where: `src/components/ui/button.tsx:23-34`; `src/components/ui/dialog.tsx:71-76` (`icon-sm` close); `copy-button.tsx`, `theme-toggle.tsx`, `pagination-nav.tsx`, `app-shell.tsx` mobile nav rows.
  - Change: establish 36px minimum for standalone controls, 44px (`min-h-11 min-w-11`, the existing `app-error-card.tsx` pattern) for dismiss/nav-critical/mobile-nav rows. Demote `xs`/`icon-xs`/`icon-sm` to dense secondary contexts with ≥12px gaps — never the sole dismiss.

- [ ] **Standardize headings: one scale, real levels**
  - Why: `PageSection h2` styled as an xs-eyebrow, `CardTitle`/`CardDescription` rendering `div`s, theme groups nesting `h2` under `h2`, card titles at `text-base` vs sections at `text-sm` — SR users get a flat/broken outline while sighted users can't learn what a section looks like.
  - Where: `src/components/ui/card.tsx:36,49` (verified: `div` with `data-slot="card-title"`/`card-description`); `page-primitives.tsx`, `assessed-requirement-list.tsx`, `requirement-card.tsx`, `finding-next-step-panel.tsx`, `login/page.tsx`, `org-data-lifecycle.tsx`, `(marketing)/page.tsx` feature titles.
  - Change: `h1` = `PageHeader` only; `h2` = `PageSection` at `text-base/lg font-semibold text-foreground` (move xs-uppercase to an eyebrow `<p>` above if the look is wanted); theme groups → `h3`, card titles → correct-level real headings; document "never use CardTitle as the section heading — use PageSection"; fix marketing feature titles to real `h3`s.

- [ ] **Standardize inline errors; stop toast-doubling**
  - Why: most forms are toast-only (error context scrolls away, magnifier users lose it); where inline `role="alert"` exists it sits below the submit button with no field association; firing an identical Sonner toast on top double-announces one event in two live regions. Pro Max: inline error per field via `aria-describedby` + focusable summary; toast owns success.
  - Where: `invite-member-form.tsx`, `create-org-form.tsx`, `stateful-action-form.tsx`, `use-action-toast.ts`, `copy-button.tsx` (toast + `sr-only` live region), `sonner.tsx` (top-right), `runtime-audit-form.tsx` (routes `aria-describedby` good — copy the pattern; URL field lacks it; per-line `^/` validation missing despite hint).
  - Change: inline `role="alert"` owns errors (adjacent to the failing control, `aria-describedby`-linked; keep `StatefulActionForm` as the house pattern); toasts own success (`duration: 4000`); `useActionToast` becomes success-only with opt-in error toasts for fire-and-forget actions; `CopyButton` keeps the live region, drops `toast.success`. Add helper text (GitHub handle without `@`, org slug rules + preview, `DELETE` uppercase hint), and require `Expires` date when reason is `temporary`.

- [ ] **Map the two findings status axes in the UI**
  - Why: tabs say `Open/Resolved/Dismissed` (finding status) while rows/detail badge `Detected/Suggested/Approved/Implemented/Verified` (remediation status); finding status itself is never badged, so "my finding is Approved — is it still Open?" is unanswerable. UI says "Dismissed" with uncapitalized snake-case reason while the contract says "Exception on record".
  - Where: `findings-bulk-list.tsx`, `findings/[id]/page.tsx` detail subheader, `finding-flow.md`, `finding-act.ts`, `dismiss-finding-fields.tsx`.
  - Change: detail subheader `Open · remediation: Approved (step 3 of 5)` + a 5-step stepper (`Detected → Suggested → Approved → Implemented → Verified`, only `Verified` closes); title `Dismissed — exception on record`, capitalize/localize reasons via the options table. Unify vocabulary: one term for root-cause grouping (`Root cause`), one verb per action (`Get AI patch`, `Get guidance`, `Confirm fix`).

- [ ] **Fix the finding detail flow: queue label, stepper, single patch, mobile CTA**
  - Why: "3 of 12 in queue" never names the queue and vanishes on direct links; Act shows only the current beat (no `Detected → … → Verified` position); the patch renders twice (Act preview + bottom handoff diff) while the primary CTA sits below the education card on mobile (`md:sticky` only); routine dismiss pays a confirm-dialog tax twice; success PR links live only in a 6s toast (miss it → double-PR).
  - Where: `finding-queue-nav.tsx`, `[id]/page.tsx`, `finding-next-step-panel.tsx`, `findings-bulk-list.tsx`, `developer-handoff.tsx`, `page-primitives.tsx` (`CodeBlock`), `create-pr-form.tsx`, `confirm-submit-button.tsx` (closes before settle; error lands unfocused below trigger), `open-details-on-hash.tsx` (opens without moving focus; redundant link-vs-summary pair).
  - Change: label the queue ("3 of 12 · Open · filtered"); when `index===-1` explain + link to the full list; add the runtime/source stepper in Act and name timeline order ("Newest first"); single patch source of truth with sticky toolbar + wrap toggle, truncated mono paths; mobile Act-first ordering or sticky mini-CTA; immediate dismiss + "Undo" toast for singles, dialog for bulk; inline PR success with "Open draft PR"; keep confirm dialogs open while pending, focus inline errors; focus panel heading/first field on disclosure open. Group detail badges (`Severity · Confidence / Remediation / Engine`); move `checkId` to a truncating copyable meta line.

---

## P1 — High

- [ ] **Explain the product's three nouns once, on every list page**
  - Why: `Requirement (must do) → Finding (instance) → Evidence (log)` is never taught; `Preset`/`Framework preset`/`Assessment preset`/`Default assessment preset` jargon plus `0 open findings` noise leaves users unsure what scope they are looking at.
  - Where: `requirements/page.tsx`, `requirement-card.tsx`, `requirements-preset-panel.tsx`, `preset-navigator.tsx`, `settings/page.tsx`, `evidence/page.tsx`.
  - Change: one-line explainer under each `PageHeader`; rename aside to `Framework scope`; glossary `Preset = framework + level (e.g. RGAA 4.1 A+AA) → N controls`; link Requirements↔Settings both ways; hide `0 open findings` (show `No open findings` muted or nothing); requirement cards read `RGAA 1.1 · WCAG 1.1.1 — Title` with `Status: Passed · Decided by: Automated` grouping.

- [ ] **Repair the dashboard's empty state, alert duplication, and tile affordances**
  - Why: `Run assessment` renders with no project (submits to a dead end); two red sections ("Regression alerts" + "Recent compliance regressions") shout the same thing with per-alert forms but no bulk action; linked vs dead stat tiles look identical while the most actionable number (unread alerts) has no link; raw Playwright/stack errors leak to PMs; "Preview URL (optional)" numbered before required "Run assessment" stalls first use; one async render blocks the whole page.
  - Where: `dashboard/page.tsx`, `dashboard-overview.tsx`, `dashboard-status-counts.tsx`, `dashboard-alerts-card.tsx`, `dashboard-activity-sections.tsx`, `first-assessment-checklist.tsx`, `assessment-job-status-live.tsx`, `runtime-coverage-chip.tsx`.
  - Change: `actions={undefined}` when no project (the `ConnectProjectCard` is the only CTA); merge alert sections into one "Needs review" with unread count + "Mark all read"; link the alerts tile, add persistent arrow/underline on linked tiles only; humanized error line + `<details>` for raw text in `text-foreground`; "Run assessment" first, preview as optional step 2; `Suspense` skeletons streaming header/stats vs activity. Hide "Edit coverage" when `!canConnect`.

- [ ] **Fix bulk triage: explain Approve absence, preserve selection, announce results**
  - Why: bulk is page-only, `useState` selection evaporates on navigation, and Approve silently hides unless runtime+suggested — 100-finding triage becomes repetitive page loops with no explanation.
  - Where: `findings-bulk-list.tsx` (shared-`control.code` SR labels, no `aria-checked="mixed"` on indeterminate "Select all").
  - Change: render disabled `Approve (runtime suggestions only)` with tooltip when selection has zero approvable items; label checkboxes with code + snippet/position; indeterminate styling + `aria-checked="mixed"`; add `aria-busy`/skeleton + live count during transitions; long-term: cross-page selection ("Select all 47 open") or cluster-level bulk.

- [ ] **Consolidate empty states to two patterns**
  - Why: designed `EmptyState` cards sit next to bare `<p>No …</p>` paragraphs (open/resolved/dismissed tabs, clusters, evidence, patch) — bare paragraphs read as broken UI.
  - Where: `findings/page.tsx`, `findings-tab-panel.tsx`, `findings-clusters-tab.tsx`, `[id]/page.tsx`, `developer-handoff.tsx`, `evidence/page.tsx` (also: empty state outside `PageContent` causes layout shift; `No finding detected evidence` is ungrammatical).
  - Change: full `EmptyState` (icon + title + description + single action) for no-data-at-all; compact inline empty for filtered/terminal states. Fix evidence to `No "Finding detected" entries`, always wrap in `PageContent`.

- [ ] **Repair requirements interactions: preset navigator, remediation disclosure, viewer states**
  - Why: the preset "radio" looks selectable but behaves as links (arrow keys dead, `aria-current="true"`); remediation triggers are `text-xs ghost px-0` with consequences revealed only after acting; viewers get `null` (no explanation for missing actions).
  - Where: `preset-navigator.tsx`, `filter-chip-list.tsx`, `requirements-preset-panel.tsx` (`sticky top-6` at all breakpoints — restrict to `lg:`), `requirement-card.tsx` (`hover:`-only border; `See findings` hidden for `needs_review` with open findings; `Set preview URL in Settings` naming drift), `requirement-remediation-actions.tsx` (3 phrasings for one action, enum leaking into labels, viewer dead-end).
  - Change: drop the radio affordance for a list + `aria-current="page"` + visible check on selected (or implement real `radiogroup` arrow handling); larger triggers with pre-action consequence summary (`Who can see this? Kept as evidence`); muted `Only editors can record passes/exceptions` for viewers; one verb set (`Mark as passed by human review / Clear human pass`); mark optional notes `Optional`, replace placeholder-examples with hint text + `aria-describedby`.

- [ ] **Fix evidence export, filter coverage, and deep-link context**
  - Why: `Export` mixes downloads vs new-tab HTML with unexplained `Engineering vs Audit`; kind chips cover 7 of ~15 kinds and vanish silently when the project only has other kinds; record links drop `presetId`/anchors so "link back into the loop" lands on unfiltered Requirements; single-page hides the total count; pagination double-spaces in the card footer.
  - Where: `evidence/page.tsx`, `evidence-kind-chips.tsx`, `query.ts`, `pagination-nav.tsx` (also add `scrollIntoView` for active tabs in `findings/page.tsx` `overflow-x-auto` rows).
  - Change: `aria-hidden` chevron, per-item descriptions (`Audit — auditor-ready…`), `Download Markdown` vs `Open HTML report`; disclose `Showing 7 of 15 kinds — …` or add missing chips; preserve preset + requirement anchor (`/requirements?status=X#control-id`); always show counts; remove embedded double margin.

- [ ] **Fix org surfaces: first-run dead end, table overflow, role safety, destructive zone**
  - Why: `No organization yet` says "reload, sign out and in again" with no button; `Organization account`/`personal workspace`/`team organization`/`workspace owner` drift confuses identity; members table overflows 375px with silent empty action cells; `admin→member` silent coercion risks accidental demotion; export+delete share one card with a weak divider; dialog closes before server settles (error = toast-only); non-owners see absence instead of guidance.
  - Where: `org/page.tsx`, `org-switcher.tsx`, `org-account-overview.tsx` (pilot/billing disclaimer wordings, `Your ComplyLoop pilot operator` fallback with no contact), `org-members-card.tsx`, `org-data-lifecycle.tsx`, `invite-member-form.tsx`, `create-org-form.tsx`.
  - Change: `Retry` + `Sign out` buttons + support link (never manual-reload instructions); pick `Organization` everywhere (`Personal` as qualifier); `overflow-x-auto` members table, hide `Joined` on mobile or stack to cards, `—` with `aria-label="No actions available"`; disable + annotate `Admin (managed by owner)` instead of coercing; destructive zone with tinted panel + icon, keep-open-on-error + inline error; slug+date export filename; single retention table reused verbatim in picker confirm, lifecycle card, overview; render disabled owner-only card with `Owner-only — contact @owner` for non-owners; one `Plan & support` tile, hide when no contact. Keep `Invite` primary in header; move `New organization` to overview footer/switcher menu.

- [ ] **Unify settings + connection naming and per-row behavior**
  - Why: `Runtime audit URL` / `Runtime audit` / `Preview / staging URL` / `Save preview settings` / `Runtime audit is off — AST checks only` never map to each other, so error→setting mapping fails; raw backend errors render into section descriptions; `Save` enabled when unchanged with no consequence copy; `Add project`/`Connect another…`/`Connect a GitHub repository…`/`Connect a project`/`Connect` never state `Project == repo`; one pending op disables all rows; search-zero shows nothing; disconnect copy contradicts retention.
  - Where: `settings/page.tsx`, `runtime-audit-form.tsx`, `default-preset-form.tsx`, `connect-project-dialog.tsx`, `connect-project-panel.tsx`, `github-repo-picker.tsx`.
  - Change: one name — `Preview URL (runtime audit)`; friendly status + `<details>` raw error; disable save when unchanged + `Will apply to future assessments only`; one trigger `Connect repository (creates project)` with org context in dialog title; per-row pending; `No repositories match "X" — Clear search` + `aria-live="polite"` count + `aria-busy` skeleton (replace bare `Loading repositories…`); `Load more` with counts; disconnect confirm `Disconnect X? Future assessments stop. Past evidence is retained for audit; findings/remediations for this project are removed.` Add `Manage repositories` link from settings project card; `Copy` for the preview URL.

- [ ] **Fix marketing honesty, mobile nav, and legal trust gaps**
  - Why: CTAs promise "free" but land on OAuth-only login with no plan context (bounce + distrust); the 6-step "loop" renders as isolated cards with no cycle affordance (core mental model lost); phone visitors get no marketing nav (`hidden md:flex`, no alternative); header shows two same-destination buttons; final CTA is a single exit; terms ships placeholder copy in metadata; privacy links logged-out readers to auth-walled `/org` with "when configured" unfinished copy; legal body is low-contrast `text-sm muted` with flat identical headings and no effective date.
  - Where: `(marketing)/page.tsx`, `marketing-header.tsx`, `marketing-footer.tsx`, `login/page.tsx` (env-var leak to signed-out users — show generic "temporarily unavailable — contact your administrator", gate internals to admin/dev), `terms/page.tsx`, `privacy/page.tsx`.
  - Change: hero primary `Sign in with GitHub`, secondary scrolls to `#how-it-works`, tertiary to docs; desktop connector/arrow chain + "Repeats on every assessment" caption, mobile 2-col compact; one header label (not both to same URL); mobile menu or footer `<nav aria-label="Marketing">` anchors; bottom CTA gains secondary `#how-it-works`/docs; legal body in `text-foreground leading-relaxed`, differentiated headings, `Last updated` line, delete internal TODO; anonymous-safe support contact (plain text, no `/org` link).

---

## P2 — Medium

- [ ] **Strengthen modal scrims and dialog error focus**
  - Why: `bg-black/10` + blur leaves background fully legible behind modals — low-vision/outdoor users lose modality; confirm dialogs close before the action settles so failures land unfocused below a dead trigger.
  - Where: `src/components/ui/dialog.tsx:42` (verified `bg-black/10`), `ui/sheet.tsx`, `ui/alert-dialog.tsx`, `confirm-submit-button.tsx`.
  - Change: `bg-black/40` light / `bg-black/60` dark (or a `--scrim` token); keep content ring; keep dialogs open while pending, focus inline errors, return focus to a logical target on success.

- [ ] **Respect OS theme preference and fix `theme-color`**
  - Why: forced-dark first paint ignores `prefers-color-scheme` (user-preference failure, pointed on a compliance product); PWA/chrome `theme-color` matches neither mode's background (mobile chrome flash).
  - Where: `src/components/theme-provider.tsx:8-13` (verified `defaultTheme="dark"`, `enableSystem={false}`), `app/layout.tsx`, `globals.css`.
  - Change: `enableSystem` + `defaultTheme="system"`; sync both `theme-color` values to the real `--background` equivalents; bump compact `ThemeToggle` off `icon-sm` while there.

- [ ] **Unify the three empty-state dialects into the existing `EmptyState` system**
  - Why: dashed `EmptyState` vs solid `ConnectProjectCard` vs `PermissionNotice`-as-empty read as three products; dashboard no-project renders an assessment action for nothing.
  - Where: `page-primitives.tsx`, `connect-project-panel.tsx`, `permission-notice.tsx`, `dashboard/page.tsx`.
  - Change: one empty pattern (icon + title + description + single action); `ConnectProjectCard` becomes that pattern's project variant.

- [ ] **Make long diffs usable: sticky toolbar, wrap toggle, truncated mono**
  - Why: after scrolling 200 lines of diff, Copy/Download are gone; long `checkId`/paths overflow 320px viewports.
  - Where: `developer-handoff.tsx`, `page-primitives.tsx` (`CodeBlock`), `[id]/page.tsx`.
  - Change: sticky code-card toolbar + wrap toggle; `truncate` + `title`, `break-all` on mono identifiers.

- [ ] **Fix sign-out menu nesting and footer/mobile hit areas**
  - Why: form-inside-menu-item is fragile across SR/keyboard with a small click target; footer legal links are small adjacent targets; theme toggle compact is 28px.
  - Where: `auth-controls.tsx`, `marketing-footer.tsx`, `marketing-header.tsx`.
  - Change: drive sign-out via item `onSelect` (form outside menu), full-row padding; footer `<nav aria-label="Legal">` with `py-2` hit padding; toggle hit area 36–44px (visual size unchanged, padding expanded).

- [ ] **Pin the report-color palette to the app status tokens**
  - Why: raw-hex report palette is a correct isolation for print/email but a silent second source of truth — retuning oklch tokens for contrast (P0) diverges exports without anyone noticing.
  - Where: `server/report-html/report-colors.ts`, `primitives.ts`.
  - Change: keep the hex; add a comment + test asserting contrast/ΔE parity with `STATUS_TONE_BADGE` tokens.

- [ ] **Stream the dashboard with `Suspense` skeletons**
  - Why: one async component awaits workspace + runtime + jobs before anything paints; the polling live-status component can't mount until everything resolves (slow LCP on the most-visited screen).
  - Where: `dashboard/page.tsx`, `assessment-job-status-live.tsx`.
  - Change: `Suspense` boundaries (header/stats vs activity) with skeleton fallbacks, refreshed independently.

---

## P3 — Low

- [ ] **Soften terminal Act cards**
  - Why: `verified`/`dismissed`/`view_only` glow with the same `border-signal/30` as actionable beats — "Verified" shouts like a CTA.
  - Where: `finding-next-step-panel.tsx`.
  - Change: signal border only for actionable beats; neutral treatment for terminal/view-only.

- [ ] **Raise `panel-frost` opacity for sidebar/sticky headers**
  - Why: 55% card + blur over the grid background shimmers on scroll behind 11–12px muted text (compounds the P0 contrast item).
  - Where: `src/app/globals.css:195-199` (verified `panel-frost` at 55%), `app-shell.tsx`.
  - Change: ~80% opaque for sidebar/sticky headers; keep decorative translucency elsewhere.

- [ ] **Keep workspace context order fixed (`org / project`)**
  - Why: empty state shows `No project / orgName`, populated shows `projectName / orgName` — users learn the wrong position.
  - Where: `workspace-context.tsx`.
  - Change: always `org / project`; stack (not `flex-wrap` with competing `ml-auto`s) on narrow screens.

- [ ] **Disclose `All` filter chips with counts everywhere**
  - Why: requirements hides `All` when unfiltered while evidence always shows it; zero-count hiding is undisclosed.
  - Where: `requirements-status-chips.tsx`, `evidence-kind-chips.tsx`, `filter-chip-list.tsx`.
  - Change: always render `All` with count in `<nav aria-label>`; disclose `N hidden empty categories` when hiding zeros.
