# TODO — Master Implementation Roadmap

Master backlog for the compliance engineering platform. Produced by a full-code
review (Sep 2026): every item states the **problem**, **evidence**, **action**,
and **verification**. Items are ordered within each priority. An AI coding agent
can start at P0 and work through the list without repeating the analysis.

Guiding rule: the product spec's goal is one correct, evidence-backed
Requirement → Assessment → Finding → Remediation → Verification → Evidence loop
for a connected project. Anything that does not make that loop correct,
observable, or simpler is P2 or lower. Verify referenced lines before acting —
code moves.

Priorities: **P0** = blocks the project or falsifies compliance evidence.
**P1** = important correctness, security, or architecture issue.
**P2** = worthwhile improvement. **P3** = minor cleanup.

---

## P0 — Critical (fix first)

_(none open — see Completed)_

---

## P1 — High

_(none open — see Completed)_

---

## P2 — Medium

### P2-1. Interactive-control CSS selectors diverge across runtime probes

- **Problem:** `non-text-contrast.ts` `CONTROL_SELECTOR`, `target-size-enhanced.ts` `CONTROL_SELECTOR`, and `forced-colors.ts` inline `interactiveSelector` overlap but differ (disabled exclusions, checkbox/radio/file/range exclusions, role additions). A control can fail one chrome/target check and be invisible to another for no product reason.
- **Evidence:** `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts`; `target-size-enhanced.ts:9-17`; `forced-colors.ts:19-26`.
- **Action:** Extract one module of named selector fragments (e.g. `BASIC_CONTROLS`, `ENHANCED_TARGET_CONTROLS`) composed per check; document intentional exclusions (disabled, checkbox size rules) next to each export.
- **Verification:** A short table test/comment listing which roles each probe includes; existing contrast/target/forced-colors tests green.

### P2-2. Emulated-media probe scaffolding duplicated (forced-colors, reduced-motion)

- **Problem:** `emulateMedia` → evaluate → `finally` restore, shared `seen` key `` `${id}\0${role}\0${tagName}` ``, and similar `CustomViolation` assembly are copied in `forced-colors.ts` and `reduced-motion.ts` (and the key pattern recurs in `widget-keyboard.ts`, `live-region-updates.ts`). A restore-on-error or dedupe bug gets fixed in one probe only.
- **Evidence:** `forced-colors.ts:10-103`; `reduced-motion.ts:24-99`. Both use `pageEvaluateWithHitCapture` and mirror the `seen` set + `finally { emulateMedia(reset) }` shape.
- **Action:** Optional thin helpers only: `hitIdentityKey(el)` leaf + `withEmulatedMedia(page, opts, fn)`. Do **not** merge the detection bodies (different WCAG criteria).
- **Verification:** Existing forced-colors / reduced-motion tests; assert `finally` still clears emulation when `evaluate` throws.

### P2-3. `contract/` and `checks/` directories have grown past the 300-line guidance

- **Problem:** Several files exceed the project's own ~300-line rule (`code-quality.mdc`), making review and diffs harder. The old TODO listed the same set; they were never split.
- **Evidence:** `runtime/scan.ts` 490, `report-html/shared.ts` 438, `orgs.ts` 374, `custom-checks/focus.ts` 357, `site-level/checks.ts` 347, `heuristic-utils.ts` 323, `html-validate-runtime.ts` 321, `assessment.ts` 310.
- **Action:** Split **when touching** (do not do a mass refactor): move leaf helpers out of the largest files, keeping public symbols stable. E.g. `scan.ts` → extract `axe-run.ts` + `runtime-navigation.ts`; `orgs.ts` → extract `org-members.ts`; `heuristic-utils.ts` → split text vs DOM helpers.
- **Verification:** `npm run typecheck && npm run test` after each split; public imports unchanged.

### P2-4. `src/server/orgs.ts` slims poorly across call domains (mixed responsibilities)

- **Problem:** `orgs.ts` mixes pure domain logic (invite/remove/role-change/export/delete) with membership queries and role checks. It was flagged in the old TODO as "374 lines, split when touching". The functions are pure and tested, but the file is a grab-bag.
- **Evidence:** `src/server/orgs.ts` — 7 responsibilities in one file (queries, invites, roles, org resolution, creation, export, delete).
- **Action:** When next touching orgs, extract `org-membership.ts` (invite/remove/change + guards) and `org-queries.ts` (role/org lookups); keep `orgs.ts` for org lifecycle + export.
- **Verification:** `npm run test` (orgs tests) green; `typecheck` clean; move only pure functions (no behavior change).

### P2-5. `report-html/shared.ts` 438 lines — move escape/render primitives out

- **Problem:** `report-html/shared.ts` (438 lines) mixes HTML shell, `escapeHtml`, status class helpers, and section wrappers. There is also a `report-colors.ts` in the same dir — colors could live in one theme module.
- **Evidence:** `src/server/report-html/shared.ts`, `src/server/report-html/report-colors.ts`.
- **Action:** When next editing reports, split `escapeHtml` + shell into `report-html/primitives.ts` and keep `shared.ts` for the composed helpers; move the color tokens into `report-colors.ts` fully.
- **Verification:** `src/server/report-html/report.test.ts` + `shared.test.ts` green; exported function signatures unchanged.

### P2-6. `runtime-audit.ts` route parsing duplicates `runtimeRoutesFor` / `joinRuntimeUrl` semantics

- **Problem:** The action-side `parseRoutes` in `src/server/actions/runtime-audit.ts` re-implements "default to `['/']` when empty" and path normalization that `analysis-core` already does (`runtimeRoutesFor` + `joinRuntimeUrl`). The two can drift (e.g. one allows absolute `http` routes, the other joins under the base).
- **Evidence:** `src/server/actions/runtime-audit.ts:20-29` vs `packages/analysis-core/src/runtime/findings.ts:159-173`.
- **Action:** Keep the action's *user-input normalization* (split on newline/comma) but delete the default-`/` and prefix-`/` logic — defer to `runtimeRoutesFor`/`joinRuntimeUrl` at scan time. Or, if absolute-route URLs are intentionally supported, document it and add the P0-1 scan-side guard.
- **Verification:** `runtime-audit.test.ts` green; `runtimeRoutesFor` still defaults unreachable base to no routes.
- **Note:** Absolute routes are now rejected in `parseRoutes` (P0-1). Remaining drift is default-`/` / path prefix duplication.

### P2-7. `packages/check` bin/`check.ts` has thin surface and no README of the failure contract

- **Problem:** The `complyloop-check` CLI (`packages/check/bin.js`, `check.ts`, `run-check.ts`) has no test for its exit-code/JSON-output contract beyond the smoke test, and `packages/check/README.md` exists but does not document when it exits nonzero or the exact JSON shape.
- **Evidence:** `packages/check/src/check-pack.smoke.test.ts` (smoke only); `packages/check/README.md`.
- **Action:** Add a contract test asserting exit code + output JSON for a passing and a failing fixture repo; document the contract in `packages/check/README.md`.
- **Verification:** `npm run test:check-pack` green; README matches the observed behavior.

### P2-8. `runtimeRoutesFor` silently defaults to `["/"]` when routes are empty — hides misconfiguration

- **Problem:** If a project has `runtimeBaseUrl` set but the user cleared the routes field, `runtimeRoutesFor` returns `["/"]` and the scan audits the root — reasonable. But if the user *intended* no routes (empty list submitted), there is no way to express "no runtime audit"; the empty form falls back to root. This is a UX ambiguity, not a bug.
- **Evidence:** `packages/analysis-core/src/runtime/findings.ts:159-166`; `src/server/actions/runtime-audit.ts:19-28`.
- **Action:** Decide the product contract: either "empty routes = root only" (current) and document it in the form helper text, or let empty routes disable the runtime audit. Prefer documenting the current behavior + a form hint over changing semantics.
- **Verification:** No code change needed if documented; if changed, update `runtime-routes` tests.

### P2-9. `countByStatus` unknown-status keys are zero-filled but `Map` pages are not — reconcile via P1-6

- **Problem:** Partially addressed by P1-6 (`countByStatusMap` now zero-fills). Remaining optional cleanup: migrate chip consumers to `Record`.
- **Action:** Consider migrating `dashboard-status-counts.tsx` and `requirements-status-chips.tsx` to `Record<RequirementStatus, number>` and delete `countByStatusMap` if unneeded.
- **Verification:** Dashboard/requirements render identical counts after the switch; no behavior change.

---

## P3 — Low

### P3-1. Platform a11y polish (dismissed-finding hash, queue-nav live region, StepIndicator state)

- **Problem:** `#dismiss-finding` hash lands on a closed `<details>` (open it on hash match); `j`/`k` queue nav has no live-region announcement; `StepIndicator` is `aria-hidden` without a textual "completed" state.
- **Evidence:** `src/components/findings/` queue/finding components; `finding-next-step-panel.tsx`.
- **Action:** Add `aria-live` region for queue nav; set `aria-current`/text on the active step; open `<details>` when hash matches. Test with RTL + `axe`.
- **Verification:** `npm run test`; `npm run check -- src/components/findings` fails on none of the touched files.

### P3-2. `badges.tsx` is a client island only because of tooltips

- **Problem:** `src/components/badges.tsx` (`"use client"`) makes every status badge a client component. The old TODO flagged this; it was not acted on.
- **Evidence:** `src/components/badges.tsx:1` `"use client"` + `BadgeWithDescription` (Tooltip) wrapping every badge.
- **Action:** Extract the tooltip wrapper into a thin client child; keep the badge markup server-rendered.
- **Verification:** Page still SSR-renders badges; interactivity (tooltip) works; `npm run test`.

### P3-3. `FindingKind = "violation" | "warning"` collides with the "don't call a Finding a violation" domain rule

- **Problem:** The `domain-model.mdc` rule forbids calling a Finding a "violation" in copy, but the type `FindingKind` uses the literal `"violation"`. The old TODO suggested recording the exception or renaming to `"fail" | "review"`; not done.
- **Evidence:** `packages/analysis-core/src/contract/statuses.ts` `FindingKind`; used in `requirement-status.ts`, `assessment-findings.ts`, many checks.
- **Action:** Either (a) document the deliberate exception in `domain-model.mdc` (preferred, low risk) or (b) rename the union to `"fail" | "review"` across the codebase (larger, mechanical).
- **Verification:** Docs consistent; tests green.

### P3-4. Untested interactive components

- **Problem:** `FindingQueueNav`, `findings-filter-bar`, `developer-handoff.tsx`, the connect dialog, and `requirement-remediation-actions.tsx` have no adjacent RTL tests. The old TODO listed the same items.
- **Evidence:** No `*.test.tsx` next to those files under `src/components/findings/`, `src/components/`.
- **Action:** Add focused RTL tests: queue nav key handling, filter chip toggling, handoff copy/`prUrl` visibility, dialog open/close. Query by role/name, not class.
- **Verification:** `npm run test` includes the new files; coverage thresholds (currently ~94% lines) do not drop.

### P3-5. `runtime-audit-form.tsx` textarea accepts absolute URLs as routes without explanation

- **Problem:** Absolute routes are now **rejected** at save (P0-1). Form hint still should explain paths-only.
- **Evidence:** `src/components/runtime-audit-form.tsx:40-46`; `src/server/actions/runtime-audit.ts`.
- **Action:** Update the form hint: "One path per line (e.g. `/`, `/pricing`); relative to the Preview / staging URL."
- **Verification:** UI copy review; no test change needed.

### P3-6. `docs/ai/architecture.md` says "Do not duplicate id lists in docs" — verify no drift after P1-4

- **Problem:** After removing low-confidence heuristics (P1-4) or changing the registry, `docs/ai/architecture.md`'s engine/authority section may reference ids that no longer exist; keep docs derived, not copied.
- **Evidence:** `docs/ai/architecture.md` "Check authority" section.
- **Action:** After P1-4, re-read the authority section and remove any deleted check id mentions.
- **Verification:** `grep` the deleted ids against `CHECK_REGISTRY` returns nothing.
- **Note:** Light skim done in P0+P1 pass (`architecture.md` had no deleted-id mentions). Optional follow-up: refresh `graft/` nodes for deleted checks.

---

## Completed (recorded for audit)

The following were resolved by prior passes and **must not be re-opened**:

- Layout-table "is layout table?" predicate copied in applicability + probe — **done** (`is-layout-table.ts` + `IS_LAYOUT_TABLE_SRC`, shared fixtures).
- TODO-SIMPLICITY / TODO-ARCHITECTURE / TODO-DUPLICATION files — consumed into this master list; the old files were deleted (`git log` shows `b1b046f`, `9881482`, `31de045`).

### Completed in P0+P1 correctness pass (2026-09-08)

- **P0-1** — `scanRuntime` validates every joined URL; `parseRoutes` rejects absolute `http(s)://` routes.
- **P0-2** — `OrgMembershipIndex` (`buildOrgMembershipIndex`) used across org membership lookups.
- **P1-1** — Runtime error-prevention uses `ERROR_PREVENTION_CONFIRM_DATASET_KEYS`; round-trip + Playwright regression tests.
- **P1-2** — Rate limit uses conditional `UPDATE … count + 1 WHERE count < limit` + concurrent-writer test.
- **P1-3** — PR `head.sha` requires 40-hex; invalid SHA → `handled: false`.
- **P1-4** — Removed low-confidence checks: `focus-context-change`, `input-context-change`, `sensory-characteristics`, `error-suggestion`, `image-of-text`. Catalog controls kept with `checkId: null`. Kept actionable heuristics: `pointer-gesture`, `motion-actuation`, `audio-description-track`, `captions-live`, `p-as-heading`.
- **P1-5** — Shared `AutoSubmitSelectForm`; thin org/project wrappers.
- **P1-6** — `countByStatusMap` on dashboard + requirements pages.

Design: `docs/superpowers/specs/2026-09-08-p0-p1-correctness-design.md`  
Plan: `docs/superpowers/plans/2026-09-08-p0-p1-correctness.md`

---

## How to proceed

1. Start at the next open priority (**P2-1**).
2. Re-run `npm run lint && npm run typecheck && npm run test && npm run build` after each item; every item above lists its own verification.
3. When a large item is done, delete it here (or move to Completed) rather than leaving stale checkboxes.
