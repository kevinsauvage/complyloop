# TODO-UX-UI — Prioritized UI/UX Improvements

Audited as a real user across marketing, login, dashboard, findings, requirements, evidence, org, settings, and project-connection, against the actual implementation (not docs). Grounded in UI/UX Pro Max rules consulted during the audit: visible focus on every control (incl. modals); 4.5:1 contrast; never color-alone; inline field errors with `aria-describedby` + focusable summary; 44pt-class touch targets with 8px spacing; empty states guide to an action; active filter state must be visible.

Conventions: `Why` = user impact. `Where` = exact file/line. `Change` = concrete direction reusing existing tokens/components. Systemic issues appear once. Verified claims only — e.g. the app-shell skip link + route-change `h1` focus (`app-shell.tsx:109-121`) exist and are healthy, so they are not listed.

---

## P0 — Critical

- [ ] **Restore a global visible focus fallback**
  - Why: `:focus-visible { outline: none }` makes every missed ring an invisible-focus dead end for keyboard/switch users — a systemic failure on an accessibility product. Pro Max: never remove focus outline without replacement (Severity: High).
  - Where: `src/app/globals.css:179-181`; bare links with no ring (`src/components/app-shell.tsx:68-80`, marketing header nav); `filter-chip-list.tsx:8` (ring with no offset); `ui/dropdown-menu.tsx:76,98,142,229` (`outline-hidden` + `bg-accent` only, weak in forced-colors).
  - Change: set `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` as the fallback; scope `outline-none` to components that render an explicit `ring-*`. Add `focus-visible:ring-2 ring-ring` to dropdown-menu items.

- [ ] **Stop the org/project switcher firing on every arrow key**
  - Why: keyboard users exploring options trigger an immediate workspace switch per keystroke — disorienting, no undo, no pending feedback. Most severe interaction bug in the app.
  - Where: `src/components/auto-submit-select-form.tsx:34-43` (`sr-only` label, `onChange → requestSubmit()`); consumed by `org-switcher.tsx`, `project-switcher.tsx`.
  - Change: do not submit on change. Submit on explicit choice (Enter/button) or on blur at minimum; add a visible label (or `title` + wider width for truncated names), a pending/disabled state, and an announcement (`role="status"`) of the new workspace.

- [ ] **Fix findings tabs: honest control + never rewrite the requested tab**
  - Why: `By cause` (a grouping) sits among statuses so users can't build a mental model; `?tab=open` silently renders another tab (breaks shared/bookmarked links); `TabsTrigger asChild Link` tells screen readers "tab" but navigates like a link, and `key={defaultTab}` remounts and destroys focus on every switch.
  - Where: `src/app/(app)/findings/page.tsx:108-118` (auto-switch), `:175-200` (`Tabs` + `TabsList` + link-triggers + `key`), `findings-tab-panel.tsx`, `findings-clusters-tab.tsx`.
  - Change: keep tabs to statuses only (`Open / Resolved / Dismissed`); demote clusters to a segmented `List | By cause` control inside Open. Replace Radix tabs-with-links with a `nav` + `aria-current="page"` (each tab is a page load). Render the requested tab's empty state instead of switching; drop the `key` remount.

- [x] **Make badge definitions reachable by keyboard, touch, and screen readers** (P0 batch: implemented 2026-09-10 — definition rendered as `sr-only` text inside every badge so AT/touch-SR users always get it; tooltip kept as hover enhancement. Deliberately NOT a `tabIndex` trigger: badges nest inside links, and the repo holds strict `jsx-a11y` with no-disable precedent. Sighted-keyboard popup remains a known gap.)
  - Why: every severity/determination/remediation definition lives in a hover-only tooltip on a non-focusable `span` — keyboard, touch, and AT users never get "what does *review* mean?", the core triage knowledge. Systemic across findings, requirements, dashboard.
  - Where: `src/components/badge-with-description.tsx:18-27`; consumed by all `DescribedBadge`s in `src/components/badges.tsx:31-57`; same pattern in `dashboard-activity-sections.tsx:195-205` (hover-only arrow, no `focus-within`).
  - Change: render the description as `sr-only` text inside the badge (tooltip becomes visual enhancement only) and make the trigger focusable (`tabIndex={0}` + badge focus ring). Show row arrows on `:focus-within` and always on touch.

- [ ] **Fix light-mode status contrast and stop encoding meaning by color alone**
  - Why: pass/fail/review badges, `text-muted-foreground/80`, `opacity-70`, and 11px microcopy on tinted/frosted surfaces drop below 4.5:1 in light mode — the compliance signal is the least readable text. A 69%-style mid-range pass rate renders in failure-red (alarmist, fails colorblind users); timeline "latest" is a dot-color difference only (WCAG 1.4.1 failure, no text alternative).
  - Where: `src/app/globals.css:72,79-85` (light `signal`/`review`/`muted` tokens vs dark-mode fix at `:122-129`); `src/core/status-display.ts:182-208,337-348` (`serious`+`moderate` share one tone; `detected` looks inert); `dashboard/page.tsx:142-149` + `dashboard-overview.tsx:19` + `dashboard-status-counts.tsx:57` (thresholds, `warning → bg-status-failed`, dimmed zeros); `findings/[id]/page.tsx:218-224` + `remediation-history.tsx:42-48` (dot-only recency, `aria-hidden`); `app-shell.tsx:34-36,64-67` (11px `→` tagline SR spells "right arrow" 4×, `muted/80` footer).
  - Change: mirror the dark-mode strategy in light (fills `/20–/25` or darker text tokens; ban `opacity-70`/`/80` on text; zeros keep full opacity, muted styling instead). Mid-range gets amber + icon/label, never red; differentiate `serious` vs `moderate` (fill vs outline) and give `detected` a distinct "Needs triage" tone. Mark latest timeline entry with text ("Latest") + `aria-label`. Floor microcopy at `text-xs`, full opacity; give the brand tagline an `aria-label` ("Requirement to fix to verified to evidence"). Add a contrast-gate test for badge pairs alongside `status-display.test.ts:179`.

- [ ] **Give login a pending state and surface OAuth failures inline**
  - Why: the only action on the page gives no feedback while redirecting (double-submit, "it did nothing"), and `?error` is never read — a failed OAuth round-trip returns users to an unchanged card with zero explanation.
  - Where: `src/app/(marketing)/login/page.tsx:55-66` (no `error` param read, no pending); `sign-in-with-github-button.tsx:12-17` (plain form action).
  - Change: convert to a pending-aware submit (reuse `StatefulActionForm` pattern: pending label + disabled) and render `?error` as `role="alert"`. Promote the reassurance copy to `text-sm` full-contrast; make "Back to home" `size="default"`.

- [ ] **Unify the findings filter model: explicit Apply *or* live, plus visible active state**
  - Why: selects auto-submit (full navigation, focus lost to `body`, no `aria-live` announcement) while search needs Apply — keyboard/SR users get surprise navigations. Hidden `control`/`cluster` params plus no chip row means "why is this list short?" has no visible answer.
  - Where: `src/components/findings/findings-filter-bar.tsx:31-118`; `finding-list-filter.ts:34-43`; unused `filter-chip-list.tsx` (also fix its semantics: `aria-current="true"` → `aria-pressed`, keep counts as non-color cue, add weight/border cue beyond tint).
  - Change: pick one model (explicit Apply for all, recommended for server-filtered lists) and reuse `FilterChipList` for active filters with per-filter clear + result count in an `aria-live="polite"` region ("24 open findings"); move focus to the results heading on change. On mobile, collapse the filter panel in a disclosure with an active-count badge ("Filters · 2").

---

## P1 — High

- [ ] **Explain the product's three nouns once, on every list page**
  - Why: `Requirement (must do) → Finding (instance) → Evidence (log)` is never taught; `Preset`/`Framework preset`/`Assessment preset`/`Default assessment preset` jargon plus `0 open findings` noise leaves users unsure what scope they are looking at.
  - Where: `requirements/page.tsx:100-107,121,165-176`, `requirement-card.tsx:57-95`, `requirements-preset-panel.tsx:22-47`, `preset-navigator.tsx:21`, `settings/page.tsx:111`, `evidence/page.tsx:89`.
  - Change: one-line explainer under each `PageHeader`; rename aside to `Framework scope`; glossary `Preset = framework + level (e.g. RGAA 4.1 A+AA) → N controls`; link Requirements↔Settings both ways; hide `0 open findings` (show `No open findings` muted or nothing); requirement cards read `RGAA 1.1 · WCAG 1.1.1 — Title` with `Status: Passed · Decided by: Automated` grouping.

- [ ] **Map the two findings status axes in the UI**
  - Why: tabs say `Open/Resolved/Dismissed` (finding status) while rows/detail badge `Detected/Suggested/Approved/Implemented/Verified` (remediation status); finding status itself is never badged, so "my finding is Approved — is it still Open?" is unanswerable. Contract says "Exception on record", UI says "Dismissed" with uncapitalized snake-case reason.
  - Where: `findings-bulk-list.tsx:76`, `findings/[id]/page.tsx:177`, `finding-flow.md:31,62`, `finding-act.ts:164-169,201`, `dismiss-finding-fields.tsx:3-7`.
  - Change: detail subheader `Open · remediation: Approved (step 3 of 5)` + a 5-step stepper (`Detected → Suggested → Approved → Implemented → Verified`, only `Verified` closes); title `Dismissed — exception on record`, capitalize/localize reasons via the options table. Unify vocabulary: one term for root-cause grouping (`Root cause`), one verb per action (`Get AI patch`, `Get guidance`, `Confirm fix`).

- [ ] **Repair the dashboard's empty state, alert duplication, and tile affordances**
  - Why: `Run assessment` renders with no project (submits to a dead end); two red sections ("Regression alerts" + "Recent compliance regressions") shout the same thing with per-alert forms but no bulk action; linked vs dead stat tiles look identical while the most actionable number (unread alerts) has no link; raw Playwright/stack errors leak to PMs; "Preview URL (optional)" numbered before required "Run assessment" stalls first use; one async render blocks the whole page.
  - Where: `dashboard/page.tsx:47-130,142-180,219-221`, `dashboard-overview.tsx:19,30-65`, `dashboard-status-counts.tsx:57`, `dashboard-alerts-card.tsx:154-162`, `dashboard-activity-sections.tsx:58-205`, `first-assessment-checklist.tsx:79-158`, `assessment-job-status-live.tsx:30-73`, `runtime-coverage-chip.tsx:30-48`.
  - Change: `actions={undefined}` when no project (the `ConnectProjectCard` is the only CTA); merge alert sections into one "Needs review" with unread count + "Mark all read"; link the alerts tile, add persistent arrow/underline on linked tiles only; humanized error line + `<details>` for raw text in `text-foreground`; "Run assessment" first, preview as optional step 2; `Suspense` skeletons streaming header/stats vs activity. Hide "Edit coverage" when `!canConnect`.

- [ ] **Raise the button scale minimum and fix the smallest dismiss/nav controls**
  - Why: default `h-8` (32px), `sm h-7` (28px), `xs/icon-xs h-6` (24px) propagate to modal dismiss (`dialog.tsx:75`, `sheet.tsx:76`), pagination, copy, theme toggle, mobile menu — the hardest-to-hit controls are the smallest. Passes WCAG 2.5.8's 24px floor only with spacing these contexts don't guarantee. Pro Max: 44pt iOS / 48dp Android class targets, 8px gaps.
  - Where: `src/components/ui/button.tsx:23-34`; consumers above plus `copy-button.tsx:21`, `theme-toggle.tsx:15`, `pagination-nav.tsx:41,47`, `app-shell.tsx:131-141`.
  - Change: establish 36px minimum for standalone controls, 44px (`min-h-11 min-w-11`, the existing `app-error-card.tsx:103-119` pattern) for dismiss/nav-critical/mobile-nav rows. Demote `xs`/`icon-xs`/`icon-sm` to dense secondary contexts with ≥12px gaps — never the sole dismiss.

- [ ] **Standardize headings: one scale, real levels**
  - Why: `PageSection h2` styled as an xs-eyebrow, `CardTitle`/`CardDescription` rendering `div`s, theme groups nesting `h2` under `h2`, card titles at `text-base` vs sections at `text-sm` — SR users get a flat/broken outline while sighted users can't learn what a section looks like.
  - Where: `page-primitives.tsx:48-52,95`, `ui/card.tsx:36,49`, `assessed-requirement-list.tsx:28-34`, `requirement-card.tsx:57`, `finding-next-step-panel.tsx:226`, `login/page.tsx:48`, `org-data-lifecycle.tsx:92,150`, `app-error-card.tsx:73`.
  - Change: `h1` = `PageHeader` only; `h2` = `PageSection` at `text-base/lg font-semibold text-foreground` (move xs-uppercase to an eyebrow `<p>` above if the look is wanted); theme groups → `h3`, card titles → correct-level real headings; document "never use CardTitle as the section heading — use PageSection"; fix marketing feature titles to real `h3`s (`(marketing)/page.tsx:162-183`).

- [ ] **Standardize inline errors; stop toast-doubling**
  - Why: most forms are toast-only (error context scrolls away, magnifier users lose it); where inline `role="alert"` exists it sits below the submit button with no field association; firing an identical Sonner toast on top double-announces one event in two live regions. Pro Max: inline error per field via `aria-describedby` + focusable summary; toast owns success.
  - Where: `invite-member-form.tsx:45`, `create-org-form.tsx:31-38`, `stateful-action-form.tsx:86-90`, `use-action-toast.ts:42-51`, `copy-button.tsx:22-36` (toast + `sr-only` live region), `sonner.tsx:40-43` (top-right), `runtime-audit-form.tsx:22-54` (routes `aria-describedby` good — copy the pattern; URL field lacks it; per-line `^/` validation missing despite hint).
  - Change: inline `role="alert"` owns errors (adjacent to the failing control, `aria-describedby`-linked; keep `StatefulActionForm` as the house pattern); toasts own success (`duration: 4000`); `useActionToast` becomes success-only with opt-in error toasts for fire-and-forget actions; `CopyButton` keeps the live region, drops `toast.success`. Add helper text (GitHub handle without `@`, org slug rules + preview, `DELETE` uppercase hint), and require `Expires` date when reason is `temporary` (`requirement-remediation-actions.tsx:182-184`).

- [ ] **Fix the finding detail flow: queue label, stepper, single patch, mobile CTA**
  - Why: "3 of 12 in queue" never names the queue and vanishes on direct links; Act shows only the current beat (no `Detected → … → Verified` position); the patch renders twice (Act preview + bottom handoff diff) while the primary CTA sits below the education card on mobile (`md:sticky` only); routine dismiss pays a confirm-dialog tax twice; success PR links live only in a 6s toast (miss it → double-PR).
  - Where: `finding-queue-nav.tsx:42-79`, `[id]/page.tsx:109,144-149,170-212`, `finding-next-step-panel.tsx:67-142,218-280`, `findings-bulk-list.tsx:104,140-203`, `developer-handoff.tsx:36-67`, `page-primitives.tsx:198-204` (`CodeBlock`), `create-pr-form.tsx:20-49`, `confirm-submit-button.tsx:83-90` (closes before settle; error lands unfocused below trigger), `open-details-on-hash.tsx:15-24` (opens without moving focus; redundant link-vs-summary pair).
  - Change: label the queue ("3 of 12 · Open · filtered"); when `index===-1` explain + link to the full list; add the runtime/source stepper in Act and name timeline order ("Newest first" — also resolve the `reverse()` vs newest-first ambiguity); single patch source of truth with sticky toolbar + wrap toggle, truncated mono paths; mobile Act-first ordering or sticky mini-CTA; immediate dismiss + "Undo" toast for singles, dialog for bulk; inline PR success with "Open draft PR"; keep confirm dialogs open while pending, focus inline errors; focus panel heading/first field on disclosure open. Group detail badges (`Severity · Confidence / Remediation / Engine`); move `checkId` to a truncating copyable meta line.

- [ ] **Fix bulk triage: explain Approve absence, preserve selection, announce results**
  - Why: bulk is page-only, `useState` selection evaporates on navigation, and Approve silently hides unless runtime+suggested — 100-finding triage becomes repetitive page loops with no explanation.
  - Where: `findings-bulk-list.tsx:66,104,140-186` (shared-`control.code` SR labels, no `aria-checked="mixed"` on indeterminate "Select all").
  - Change: render disabled `Approve (runtime suggestions only)` with tooltip when selection has zero approvable items; label checkboxes with code + snippet/position; indeterminate styling + `aria-checked="mixed"`; add `aria-busy`/skeleton + live count during transitions; long-term: cross-page selection ("Select all 47 open") or cluster-level bulk.

- [ ] **Consolidate empty states to two patterns**
  - Why: designed `EmptyState` cards sit next to bare `<p>No …</p>` paragraphs (open/resolved/dismissed tabs, clusters, evidence, patch) — bare paragraphs read as broken UI.
  - Where: `findings/page.tsx:143-159,204-230`, `findings-tab-panel.tsx:40`, `findings-clusters-tab.tsx:31-35`, `[id]/page.tsx:210-212`, `developer-handoff.tsx:50-52`, `evidence/page.tsx:131-164` (also: empty state outside `PageContent` causes layout shift; `No finding detected evidence` is ungrammatical).
  - Change: full `EmptyState` (icon + title + description + single action) for no-data-at-all; compact inline empty for filtered/terminal states. Fix evidence to `No "Finding detected" entries`, always wrap in `PageContent`.

- [ ] **Repair requirements interactions: preset navigator, remediation disclosure, viewer states**
  - Why: the preset "radio" looks selectable but behaves as links (arrow keys dead, `aria-current="true"`); remediation triggers are `text-xs ghost px-0` with consequences revealed only after acting; viewers get `null` (no explanation for missing actions).
  - Where: `preset-navigator.tsx:20-60`, `filter-chip-list.tsx:41,53`, `requirements-preset-panel.tsx:20` (`sticky top-6` at all breakpoints — restrict to `lg:`), `requirement-card.tsx:52,91-95,110` (`hover:`-only border; `See findings` hidden for `needs_review` with open findings; `Set preview URL in Settings` naming drift), `requirement-remediation-actions.tsx:34-194` (3 phrasings for one action, `Clear human pass & return to unable to verify` leaks enum, `59`/`null` viewer dead-end).
  - Change: drop the radio affordance for a list + `aria-current="page"` + visible check on selected (or implement real `radiogroup` arrow handling); larger triggers with pre-action consequence summary (`Who can see this? Kept as evidence`); muted `Only editors can record passes/exceptions` for viewers; one verb set (`Mark as passed by human review / Clear human pass`); mark optional notes `Optional`, replace placeholder-examples with hint text + `aria-describedby`.

- [ ] **Fix evidence export, filter coverage, and deep-link context**
  - Why: `Export` mixes downloads vs new-tab HTML with unexplained `Engineering vs Audit`; kind chips cover 7 of ~15 kinds and vanish silently when the project only has other kinds; record links drop `presetId`/anchors so "link back into the loop" lands on unfiltered Requirements; single-page hides the total count; pagination double-spaces in the card footer.
  - Where: `evidence/page.tsx:91-164,214`, `evidence-kind-chips.tsx:16-25`, `query.ts:57-152`, `pagination-nav.tsx:21-34` (also add `scrollIntoView` for active tabs in `findings/page.tsx:176` `overflow-x-auto` rows).
  - Change: `aria-hidden` chevron, per-item descriptions (`Audit — auditor-ready…`), `Download Markdown` vs `Open HTML report`; disclose `Showing 7 of 15 kinds — …` or add missing chips; preserve preset + requirement anchor (`/requirements?status=X#control-id`); always show counts; remove embedded double margin.

- [ ] **Fix org surfaces: first-run dead end, table overflow, role safety, destructive zone**
  - Why: `No organization yet` says "reload, sign out and in again" with no button; `Organization account`/`personal workspace`/`team organization`/`workspace owner` drift confuses identity; members table overflows 375px with silent empty action cells; `admin→member` silent coercion risks accidental demotion; export+delete share one card with a weak divider; dialog closes before server settles (error = toast-only); non-owners see absence instead of guidance.
  - Where: `org/page.tsx:41-183`, `org-switcher.tsx:19`, `org-account-overview.tsx:40-157` (pilot/billing disclaimer ×3 wordings, `Your ComplyLoop pilot operator` fallback with no contact), `org-members-card.tsx:35-157`, `org-data-lifecycle.tsx:65-224` (`complyloop-org-${orgId}.json`), `invite-member-form.tsx:36-60`, `create-org-form.tsx:29-38`.
  - Change: `Retry` + `Sign out` buttons + support link (never manual-reload instructions); pick `Organization` everywhere (`Personal` as qualifier); `overflow-x-auto` members table, hide `Joined` on mobile or stack to cards, `—` with `aria-label="No actions available"`; disable + annotate `Admin (managed by owner)` instead of coercing; destructive zone with tinted panel + icon, keep-open-on-error + inline error; slug+date export filename; single retention table reused verbatim in picker confirm, lifecycle card, overview (see P2 disconnect-copy item); render disabled owner-only card with `Owner-only — contact @owner` for non-owners; one `Plan & support` tile, hide when no contact. Keep `Invite` primary in header; move `New organization` to overview footer/switcher menu.

- [ ] **Unify settings + connection naming and per-row behavior**
  - Why: `Runtime audit URL` / `Runtime audit` / `Preview / staging URL` / `Save preview settings` / `Runtime audit is off — AST checks only` never map to each other, so error→setting mapping fails; raw backend errors render into section descriptions; `Save` enabled when unchanged with no consequence copy; `Add project`/`Connect another…`/`Connect a GitHub repository…`/`Connect a project`/`Connect` never state `Project == repo`; one pending op disables all rows; search-zero shows nothing; disconnect copy contradicts retention.
  - Where: `settings/page.tsx:43-148`, `runtime-audit-form.tsx:17-54`, `default-preset-form.tsx:28-56`, `connect-project-dialog.tsx:17-40`, `connect-project-panel.tsx:74-152` (also: env-var leak at `:91-100` — same fix as login L2), `github-repo-picker.tsx:193-323`.
  - Change: one name — `Preview URL (runtime audit)`; friendly status + `<details>` raw error; disable save when unchanged + `Will apply to future assessments only`; one trigger `Connect repository (creates project)` with org context in dialog title; per-row pending; `No repositories match "X" — Clear search` + `aria-live="polite"` count + `aria-busy` skeleton (replace bare `Loading repositories…`); `Load more` with counts; disconnect confirm `Disconnect X? Future assessments stop. Past evidence is retained for audit; findings/remediations for this project are removed.` Add `Manage repositories` link from settings project card; `Copy` for the preview URL.

- [ ] **Fix marketing honesty, mobile nav, and legal trust gaps**
  - Why: three CTAs promise "free" but land on OAuth-only login with no plan context (bounce + distrust); the 6-step "loop" renders as isolated cards with no cycle affordance (core mental model lost); phone visitors get no marketing nav (`hidden md:flex`, no alternative); header shows two same-destination buttons; final CTA is a single exit; terms ships "Replace with counsel-reviewed terms before selling" in metadata; privacy links logged-out readers to auth-walled `/org` with "when configured" unfinished copy; legal body is low-contrast `text-sm muted` with flat identical headings and no effective date.
  - Where: `(marketing)/page.tsx:63-66,93-114,125-183,216-250`, `marketing-header.tsx:35-64`, `marketing-footer.tsx:16-30`, `login/page.tsx:68-76` (env-var leak to signed-out users — show generic "temporarily unavailable — contact your administrator", gate internals to admin/dev), `terms/page.tsx:13-17`, `privacy/page.tsx:18-60`.
  - Change: hero primary `Sign in with GitHub`, secondary scrolls to `#how-it-works`, tertiary to docs; desktop connector/arrow chain + "Repeats on every assessment" caption, mobile 2-col compact; one header label (not both to same URL); mobile menu or footer `<nav aria-label="Marketing">` anchors; bottom CTA gains secondary `#how-it-works`/docs; legal body in `text-foreground leading-relaxed`, differentiated headings, `Last updated` line, delete internal TODO; anonymous-safe support contact (plain text, no `/org` link).

---

## P2 — Medium

- [ ] **Strengthen modal scrims and dialog error focus**
  - Why: `bg-black/10` + blur leaves background fully legible behind modals — low-vision/outdoor users lose modality; confirm dialogs close before the action settles so failures land unfocused below a dead trigger.
  - Where: `ui/dialog.tsx:42`, `ui/sheet.tsx:40`, `ui/alert-dialog.tsx:39`, `confirm-submit-button.tsx:83-90`.
  - Change: `bg-black/40` light / `bg-black/60` dark (or a `--scrim` token); keep content ring; keep dialogs open while pending, focus inline errors, return focus to a logical target on success.

- [ ] **Respect OS theme preference and fix `theme-color`**
  - Why: forced-dark first paint ignores `prefers-color-scheme` (user-preference failure, pointed on a compliance product); PWA/chrome `theme-color` matches neither mode's background (mobile chrome flash).
  - Where: `theme-provider.tsx:8-13` (`defaultTheme="dark"`, `enableSystem={false}`), `app/layout.tsx:31-32`, `globals.css:61,104`.
  - Change: `enableSystem` + `defaultTheme="system"`; sync both `theme-color` values to the real `--background` equivalents; bump compact `ThemeToggle` off `icon-sm` while there.

- [ ] **Unify the three empty-state dialects into the existing `EmptyState` system**
  - Why: dashed `EmptyState` vs solid `ConnectProjectCard` vs `PermissionNotice`-as-empty read as three products; dashboard no-project renders an assessment action for nothing.
  - Where: `page-primitives.tsx:135-140`, `connect-project-panel.tsx:134-152`, `permission-notice.tsx:4-10`, `dashboard/page.tsx:57-82`.
  - Change: one empty pattern (icon + title + description + single action); `ConnectProjectCard` becomes that pattern's project variant.

- [ ] **Give linked dashboard tiles a persistent affordance**
  - Why: linked vs dead tiles share identical styling — discoverability rests on hover/focus memory.
  - Where: `dashboard-overview.tsx:30-65`, `dashboard/page.tsx:151-180`.
  - Change: arrow/underline affordance on linked tiles only (keep hover/focus styles as enhancement).

- [ ] **Make long diffs usable: sticky toolbar, wrap toggle, truncated mono**
  - Why: after scrolling 200 lines of diff, Copy/Download are gone; long `checkId`/paths overflow 320px viewports.
  - Where: `developer-handoff.tsx:36-67`, `page-primitives.tsx:198-204`, `[id]/page.tsx:179-181`.
  - Change: sticky code-card toolbar + wrap toggle; `truncate` + `title`, `break-all` on mono identifiers.

- [ ] **Fix sign-out menu nesting and footer/mobile hit areas**
  - Why: form-inside-menu-item is fragile across SR/keyboard with a small click target; footer legal links are small adjacent targets; theme toggle compact is 28px.
  - Where: `auth-controls.tsx:65-71`, `marketing-footer.tsx:16-30`, `marketing-header.tsx:51`.
  - Change: drive sign-out via item `onSelect` (form outside menu), full-row padding; footer `<nav aria-label="Legal">` with `py-2` hit padding; toggle hit area 36–44px (visual size unchanged, padding expanded).

- [ ] **Pin the report-color palette to the app status tokens**
  - Why: raw-hex report palette (`#15803d…`) is a correct isolation for print/email but a silent second source of truth — retuning oklch tokens for contrast (P0) diverges exports without anyone noticing.
  - Where: `server/report-html/report-colors.ts:20-31`, `primitives.ts:37-52`.
  - Change: keep the hex; add a comment + test asserting contrast/ΔE parity with `STATUS_TONE_BADGE` tokens.

- [ ] **Stream the dashboard with `Suspense` skeletons**
  - Why: one async component awaits workspace + runtime + jobs before anything paints; the polling live-status component can't mount until everything resolves (slow LCP on the most-visited screen).
  - Where: `dashboard/page.tsx:47-55,85-130`, `assessment-job-status-live.tsx:30-73`.
  - Change: `Suspense` boundaries (header/stats vs activity) with skeleton fallbacks, refreshed independently.

---

## P3 — Low

- [ ] **Soften terminal Act cards**
  - Why: `verified`/`dismissed`/`view_only` glow with the same `border-signal/30` as actionable beats — "Verified" shouts like a CTA.
  - Where: `finding-next-step-panel.tsx:218-223`.
  - Change: signal border only for actionable beats; neutral treatment for terminal/view-only.

- [ ] **Raise `panel-frost` opacity for sidebar/sticky headers**
  - Why: 55% card + blur over the grid background shimmers on scroll behind 11–12px muted text (compounds the P0 contrast item).
  - Where: `globals.css:195-198`, `app-shell.tsx:123,155`.
  - Change: ~80% opaque for sidebar/sticky headers; keep decorative translucency elsewhere.

- [ ] **Keep workspace context order fixed (`org / project`)**
  - Why: empty state shows `No project / orgName`, populated shows `projectName / orgName` — users learn the wrong position.
  - Where: `workspace-context.tsx:69-103`.
  - Change: always `org / project`; stack (not `flex-wrap` with competing `ml-auto`s) on narrow screens.

- [ ] **Disclose `All` filter chips with counts everywhere**
  - Why: requirements hides `All` when unfiltered while evidence always shows it; zero-count hiding is undisclosed.
  - Where: `requirements-status-chips.tsx:40`, `evidence-kind-chips.tsx:25`, `filter-chip-list.tsx:39-59`.
  - Change: always render `All` with count in `<nav aria-label>`; disclose `N hidden empty categories` when hiding zeros.
