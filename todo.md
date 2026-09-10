# TODO — Finding triage: trust, core loop, agency, polish

> Source: user finding dump (2026-09-10). Enriched by codebase audit same day.
> Notes: `TODO-PERFORMANCE.md` does **not** exist in repo (no `**/todo*.md` found) — perf claims below were verified live instead. Several "big" items are already fixed; those are marked `Already-done → remaining nit` so you don't re-do work.
> Design spec: `design-system/complyloop/MASTER.md` (Plus Jakarta + blue `#2563EB` / orange `#EA580C`). Live UI: `src/app/globals.css` + `src/app/layout.tsx` (Geist + cyan `--signal` oklch). `design-system/complyloop/pages/` is **empty**.

Size: `XS` <1h, `S` ½–1d, `M` 2–3d, `L` 1w+. Ordered by priority, then leverage/size.

---

## P0 — Fix now (trust / a11y)

### P0-1 Icon-only controls: harden accessible names [S, XS-code]

**Claim:** "unlabelled icon-only control — ironic on an a11y product."
**Reality:** audit of 26 lucide files / 83 button sites found **zero offenders**. Every icon button already has a name via text, `aria-label`, `sr-only`, or `title`+text:

- `src/components/app-shell.tsx:135-143` — Menu button `aria-label={navOpen?"Close menu":"Menu"}` ✓
- `src/components/theme-toggle.tsx:12-22` — `aria-label="Toggle light and dark theme"` ✓
- `src/components/code-block.tsx:36-53` — Copy/Wrap have text + `aria-label` + `aria-pressed` ✓
- `src/components/ui/sheet.tsx:73-81`, `src/components/ui/dialog.tsx:72-80` — `XIcon + <span sr-only>Close</span>` ✓
- `src/app/(app)/evidence/page.tsx:103-105`, `src/components/pagination-nav.tsx:89-117`, `src/components/dashboard/dashboard-overview.tsx:48,75` ✓

**Remaining hardening (optional, do it — cheap trust win):**

1. `src/components/theme-toggle.tsx` — add `aria-pressed` (toggle semantics).
2. `src/components/auth-controls.tsx:71-82` — avatar trigger has visible `user.label` text; add `aria-label="Account: {label}"` for SR brevity.
3. Add regression test: `axe` / `jsx-a11y` check that every `size="icon"` Button contains `aria-label` or `sr-only` text (vitest + RTL, follow existing `src/app/error.test.tsx` pattern).
   **Accept:** `npm run check -- src/components` clean; new test fails if `aria-label` removed.
   **Why P0:** a11y product can't ship even one nameless control; cost is ~30 min.

### P0-2 Design tokens: pick source of truth, then align [L if implement MASTER, M if rewrite spec]

**Drift confirmed:**

- Spec `design-system/complyloop/MASTER.md:20-37` — Primary `#2563EB`, Accent `#EA580C`, Background `#F8FAFC`; `:43-46` Plus Jakarta Sans head+body; `:82-110` orange `.btn-primary`.
- Live `src/app/globals.css:11-13` — `--font-sans/mono/heading: "Geist…"`; `:59-101` slate/cyan oklch (`--signal 0.43 0.11 200`, `--primary 0.28 0.04 230`); `.dark :103-144`.
- Live `src/app/layout.tsx:2,8-16,42` — `Geist, Geist_Mono from next/font/google`; no Plus Jakarta import.

**Decision needed (product, 30 min):**

- Option A — Implement MASTER (trust-blue SaaS look): swap `layout.tsx` to `Plus_Jakarta_Sans`, remap `--primary/--secondary/--accent/--ring/--signal/--background` to `#2563EB/#3B82F6/#EA580C/#F8FAFC`, update `viewport themeColor`, snapshots.
- Option B — Rewrite MASTER to live (engineering-console look): document Geist + cyan `--signal`, slate oklch, `panel-frost`/`surface-panel` utilities (`globals.css:213-225`), keep code as-is.

**Either way, fill the gap:** `design-system/complyloop/pages/` is empty → add `dashboard.md`, `findings.md`, `finding-detail.md`, `requirements.md`, `evidence.md`, `settings.md` (per-page overrides per `MASTER.md:3-5`). Each ~30 lines: layout, CTA hierarchy, empty state, tokens used.
**Accept:** no `#2563EB`/`Plus Jakarta` reference without live match (or vice versa); `npm run build` + visual diff approved; `pages/` has 6 files.
**Why P0:** every new screen copies the wrong tokens until this is decided.

## Option A selected

## P1 — Core loop UX (biggest leverage)

### P1-1 Requirements: add `?q=` search; pagination already done [S]

**Claim "147 unpaginated client islands" is stale.** Verified:

- `src/app/(app)/requirements/page.tsx:50-54` — only `{status, presetId, page}`; `:109` `paginateSlice(..., DEFAULT_PAGE_SIZE=25)` (`packages/analysis-core/src/contract/project-types.ts:4`); `:177-193` `AssessedRequirementList + <PaginationNav/>`.
- `src/components/pagination-nav.tsx:31-76` — numbered window, no-shift placeholder.
- Only client island under `src/components/requirements/` is `requirement-remediation-actions.tsx:1`; rest are server (`assessed-requirement-list.tsx:8-56`, `requirement-card.tsx:25-147`, `requirements-status-chips.tsx`, `requirements-preset-panel.tsx`). Islands = ≤25/page, not 147. No virtualization needed at 25/page.

**Work:** add `q` text filter through `parseRequirementStatusParam` flow, filter on `control.code/title` before `paginateSlice`; preserve `q` in `PaginationNav hrefFor`. Keep `pageSize=25`. Skip virtualization; skip theme/status windowing (chips are `Link`-based, no client JS).
**Accept:** `?q=rgaa` filters server-side; pagination preserves `q+status+preset`; 0-result shows Clear-filter empty state (copy P1-2 pattern).
**Files:** `src/app/(app)/requirements/page.tsx`, `src/core/filter-params.ts`, `src/components/requirements/*`.

### P1-2 Findings triage polish: 3 nits (Clear, counts, dialog) [S]

**Mostly done — don't rebuild:**

- Clear exists: `src/components/findings/findings-filter-bar.tsx:72-138` per-chip clear, `:254-265` "Reset filters"; `src/app/(app)/findings/page.tsx:192-209` empty → Reset.
- Bulk is _early_: `src/components/findings/findings-bulk-list.tsx:175-231` toolbar before `<ul :256-269>`; reveals on `selectedCount>0 (:197)`.
- Tab counts present: `src/app/(app)/findings/page.tsx:229-252` Open/Root-cause/Resolved/Dismissed via SQL counts (`:109-112`, `:146-151`).
- Rows already de-badged: `findings-bulk-list.tsx:52-122` (severity dot + title + `line-clamp-2`).

**Remaining nits:**

1. Reset preserves `control` (`filter-bar.tsx:257-260`) — either drop it too or relabel "Reset search & filters, keep rule".
2. Count hidden when `0` (`page.tsx:229-252` `total > 0 ? … : ""`) — always render `(${n})` so Resolved/Dismissed don't look broken.
3. Inline dismiss form `:233-254` pushes list — move to `<dialog>`; hide checkbox gutter entirely when `canRemediate=false` instead of reserved spacer (`:87-91`, `findings-tab-panel.tsx:62-66`).
   **Accept:** Reset clears all (or says what it keeps); tabs show `(0)`; dismiss doesn't shift list.

### P1-3 Finding detail: cap evidence trail + collapse handoff diff [M]

**Hierarchy already OK:** single primary CTA `src/components/findings/finding-next-step-panel.tsx:46-194` (`ActControls` per `act.beat`, sticky `md:top-4 :212-218`), dismiss/handoff demoted to `SecondaryFindingActions (:244-255 → secondary-finding-actions.tsx:19-60)`; AI collapsed in `<details>` (`finding-understand-card.tsx:103-156`).

**Density problem is two spots:**

1. `[id]/page.tsx:231-276` maps **all** `evidence` newest-first, no cap.
2. `src/components/developer-handoff.tsx:35-69` renders full `diff` + full PR `body` as two `CodeBlock`s.

**Fix:** cap trail to 5 + `<details>`/"Show all N"; collapse handoff diff behind `<details open={prUrl==null}>`; keep sticky `FindingNextStepPanel` as sole above-fold CTA. Denser code/evidence CSS (smaller `CodeBlock` padding, `max-h` + scroll) is part of same ticket.
**Accept:** detail page above-fold = one primary CTA; evidence >5 requires expand; handoff diff collapsed when PR exists.

### P1-4 Dashboard: merge "Recently verified" ⊂ "Recent activity" [S]

**Next action is NOT buried:** `src/app/(app)/dashboard/page.tsx:187-219` single `nextAction` (alerts→failed→open→preview-URL), signal-bordered `aria-labelledby="next-action-heading" :261-286` directly under header. Keep it.

**Noise confirmed:** `dashboard/page.tsx:109-123` `recentVerified` (5) ⊂ `recentEvidence` (6) — rendered as two cards (`dashboard-activity-sections.tsx:158-181` + `:266-284`). Clusters capped at 5 (`:124-128`); regressions banner already suppressed when alerts card shows (`:323`, `:94-128`); Needs-attention caps at 6 (`:190`).

**Fix:** merge into one "Recent activity" card with `Verified` badge; optionally move "Likely shared root causes" (`:245-263`) above activity or link it from next-action.
**Accept:** one activity card; no duplicate verified rows; next-action still first.

### P1-5 Narrow `refresh()` → only `alerts.ts` needs it [S]

**Claim "every small mutation refreshes whole app" is stale.** Primitive `src/server/actions/shared.ts:32-38` (`refresh()` = `revalidatePath("/","layout")`), but norm is already narrow via `src/server/actions/refresh-routes.ts:10-14` (`COMPLIANCE_LOOP_ROUTES = ["/dashboard","/findings","/requirements","/evidence"]`): `assessment.ts:48,64`, `ai-fix.ts:66`, `remediation.ts:135,173,215,269`, `remediation-verify.ts`, `remediation-ai.ts`, `requirements.ts:200,266,315`, `pr.ts:120`, `project-preset.ts:49`, `runtime-audit.ts:69`.

**Broad callers left (3):** `alerts.ts:48,84`, `org.ts` (6 sites), `connect.ts:67,145,184`. Org/connect _should_ stay layout-wide (tenancy cookie affects every route).
**Fix:** only `alerts.ts:48,84` → `refresh("/dashboard")` (alerts surface only there; regression banner reads `runtime.alerts`). Leave the rest.
**Accept:** marking alert read revalidates `/dashboard` only; org/project switch still refreshes layout.

### P1-6 Perf leftovers from TODO-PERF: no-op (verify only) [XS]

Both already implemented — do not re-ticket as work:

- Single-pass AST: `packages/analysis-core/src/parse.ts:29-52` (`jsxIndexCache` + one pre-order walk shared by `visitJsxTags/Elements :54-68`); one TS parse/file `scan.ts:30-39`, `scanChangedFiles :61-65`. Second parse is only `jsx-a11y-scan.ts:48-51` ESLint+`tsParser` (separate engine, failure-isolated by design).
- Zod off client: `src/core/filter-params.ts:36-40` ("Pure, zod-free"); zero `"use client"` files import `zod` (only `src/ai/*`, `src/core/filters.ts`, `src/server/actions/*`, `src/app/api/*`).
  **If profiling shows cost:** only lever is caching `Linter` flat-config per file. No correctness change.

---

## P2 — Agency workflows

### P2-1 Evidence filters: rename jargon now, search/date/actor next [S rename / M full]

- Current `src/app/(app)/evidence/page.tsx:52,65,71-77` — only `{page,kind}`; `packages/db/src/repo/evidence.ts:52-103` only `eq(kind)`; no `ilike(summary)`, date range, or actor column.
- Jargon in UI: `src/components/evidence/evidence-kind-chips.tsx:54-57` + `requirements-status-chips.tsx:52-54` — "{n} hidden empty categories".

**Step 1 (S, done):** rename to "No X entries yet" or omit line + `Show empty` tooltip.
**Step 2 (M, done 2026-09-10):** `?q=&from=&to=` end-to-end — `EvidenceFilter` in `packages/db/src/repo/evidence.ts` (`ilike(summary)` with wildcard escaping + `at` date range), `parseEvidenceQueryParam`/`parseEvidenceDateParam` + filter-preserving `evidenceKindHref(kind, page, filters)` in `src/core/filter-params.ts`, search + date form + preserved pagination/chips in `src/app/(app)/evidence/page.tsx`. Kind-only totals still come from the per-kind counts map (no extra scan); text/date narrowing adds one `count(*)`.
**Actor (deferred, needs schema change):** the evidence table has no actor column (`packages/db/src/schema.ts:243-266` — id/at/kind/summary/project/control/finding/assessment/detail, no actor anywhere in write paths). Filtering by actor requires a migration + write-path changes — separate ticket.
**Accept (step 1):** no "hidden empty categories" string in repo (`rg` clean).

### P2-2 Empty states with next step, esp. Resolved (0 today) [S]

- `src/components/findings/findings-tab-panel.tsx:52-59` — `slice.total===0 && !filtersActive` → generic `<EmptyState>No findings / Nothing to triage here</EmptyState>`, no action.
- Callers `src/app/(app)/findings/page.tsx:262,267,276,281` pass `emptyMessage="No resolved/dismissed findings."`; open-tab `all-clear :313-334` already has `View requirements + Export audit report`.
- Pattern to copy: `src/app/(app)/evidence/page.tsx:191-199`, `requirements/page.tsx:161-174` (have actions).

**Fix:** add `emptyAction` prop to `FindingsTabPanel`; Resolved-empty → `all-clear` variant + `Review open findings / Run assessment`; Dismissed-empty → link to open.
**Accept:** `?tab=resolved` with 0 rows offers a next step, not a dead end.

### P2-3 Settings save clarity [S]

- `src/app/(app)/settings/page.tsx:135-194` — two cards (`Framework scope → DefaultPresetForm`, `Preview URL → RuntimeAuditForm`), two saves, looks like one form.
- Hints buried in `text-xs`: `default-preset-form.tsx:22,29-33`, `runtime-audit-form.tsx:17,58-60` ("…Will apply to future assessments only."). Actions `project-preset.ts:50-52`, `runtime-audit.ts:69-70` are separate (correct).

**Fix:** promote to `Alert`/bold prefix in `PageSection description`: "**Applies to future assessments only** — does not re-score past runs." Button labels `Save scope` / `Save preview URL`; keep per-card inline success (centralized `useActionToast`, don't add new `sonner` calls per AGENTS.md).
**Accept:** future-only note visible without scrolling to tiny hint; two saves read as intentional.

### P2-4 Route `loading.tsx`: add 4 skeletons [S]

Have: `src/app/loading.tsx`, `src/app/(app)/loading.tsx:1-24` (generic "Loading workspace…"), `dashboard/loading.tsx:1-34` (stat-grid, `role=status`), `findings/loading.tsx:1-15`, `findings/[id]/loading.tsx:1-22`.
Missing (all have `page.tsx`, no co-located loader): `requirements/loading.tsx`, `evidence/loading.tsx`, `settings/loading.tsx`, `org/loading.tsx`.
**Fix:** copy dashboard/findings pattern (`role=status aria-busy + sr-only Loading…`): table skeleton for evidence/requirements, form skeleton for settings/org. ~15–30 lines each.
**Accept:** navigating to each route shows tailored skeleton, not generic fallback.

### P2-5 Workspace/project switchers look like plain text [S]

- `src/components/workspace-context.tsx:72-112` — single-org path renders plain `<span>{org}/{project}>`; multi-path `OrgSwitcher/ProjectSwitcher` in muted strip (`ContextStrip :18-26`).
- `org-switcher.tsx:15-26`, `project-switcher.tsx:15-28` → `auto-submit-select-form.tsx:61-68` (`<select class=nativeSelectClass truncate max-w-48/64>`, `form-classes.ts:2-3` `bg-transparent`); no chevron, `sr-only` label, Switch button only after change; `options<=1 → null (:43)`.

**Fix:** bordered `bg-background shadow-sm + ChevronDown + visible label`; keep confirm-on-Switch; add `title`/count. Single-value case stays hidden (by design) — no change.
**Accept:** switcher reads as control at a glance (border + chevron), keyboard-operable native select retained.

---

## P3 — Polish / packaging

### P3-1 Org delete: demote visuals, keep safety [S]

- `src/app/(app)/org/page.tsx:116-142` header primary `Invite member` (default/signal), `New organization` outline `:205-209`.
- `src/components/org-data-lifecycle.tsx:163-206` delete `<section class="border-destructive/30 bg-destructive/5">` + `TriangleAlert` + `variant=destructive Delete` → dialog `Delete permanently :235-242`, gated on typing `DELETE :86,220-229`. Safe (owner-only `:177`, retained-evidence copy `:179-184,211-215`).

**Fix:** demote section to plain card + `outline`/ghost trigger; keep `destructive` only on dialog confirm; collapse under `<details>` or move below `New organization` (export `outline :127-135` stacked above delete amplifies danger zone — separate them).
**Accept:** invite/create visually primary; delete still requires owner + `DELETE` + dialog.

### P3-2 Marketing "View sample evidence" over-promises [S]

- `src/app/(marketing)/page.tsx:325-326` `<Link href="#sample">View sample evidence</Link>` → `section#sample :198-260` static 3-`<li>` mock + disclaimer `:253-256` "Illustrative sample…".

**Fix:** rename to `See sample trail` / `Preview evidence format` + secondary `Sign in → run assessment` note; or drop anchor for read-only sample route. Don't promise a demo an anchor can't keep.
**Accept:** CTA label matches what `#sample` delivers.

### P3-3 Stream shell: Suspense around nav badges [M]

- `src/app/(app)/layout.tsx:10-14` — `await getWorkspace()` then `await navAttentionForProject(project)` (`src/server/nav-attention.ts:12-20` → `countNavAttentionForProject` + `workspace.ts:118-142 loadTenancyDb` + `getSession()`); passes `navAttention` to `AppShell` (`app-shell.tsx:88-99,159-171`, client, no `Suspense`). Only `Suspense` today: `dashboard/page.tsx:304-309`, `findings/layout.tsx:1-8` (trivial).

**Fix:** split badges to async `<NavAttentionBadges project>` wrapped in `<Suspense fallback={…}>` in layout/shell; keep shell + `children` streaming. S-variant: wrap existing promise with `use()`.
**Accept:** slow badge-count query shows shell + route content with badge skeletons, not blank shell (despite `(app)/loading.tsx` fallback).

### P3-4 Publish `@complyloop/check` [M, blocked on license]

- `packages/check/package.json:1-37` — `name @complyloop/check v0.1.0`, `bin {complyloop-check: ./bin.js}`, `files [bin.js,dist,README]`, `license: UNLICENSED (:36)` → `npm publish` blocked; no `prepublishOnly`/`publishConfig`/`LICENSE`/provenance.
- `bin.js:1-20` guards `dist/cli.js` (`exit 2` + "Run npm run build:check"); `scripts/build.mjs:20-32` esbuild → `dist/cli.js`; `dist/` gitignored; root `build:check` exists; `README.md:103` "not published yet"; no CI publish workflow.

**Fix:** set license (e.g. `Apache-2.0` + `LICENSE`), add `"prepublishOnly": "npm run build"`, `publishConfig {access:public, provenance:true}`, `npm pack --dry-run` + `test:check-pack` in CI.
**Accept:** `npm pack --dry-run` clean; registry install works post-publish; local `npm install ./packages/check` still works.

---

## Suggested build order (respecting size + leverage)

1. P0-1 (XS) + P2-1-rename (S) + P1-5 (S) — one PR, <1d, trust + correctness.
2. P1-1 search (S) + P1-2 triage nits (S) + P2-2 empty states (S) — core loop feels finished.
3. P1-3 evidence cap (M) + P1-4 dashboard merge (S) + P2-4 loading skeletons (S).
4. P2-3 settings copy (S) + P2-5 switchers (S) + P3-1 org demote (S) + P3-2 marketing rename (S).
5. P0-2 token decision (scheduling item — blocks all future UI) + P3-3 Suspense (M) + P3-4 publish (M).
