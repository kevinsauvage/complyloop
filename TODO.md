# TODO — Master Implementation Roadmap

Master backlog for the compliance engineering platform. Produced by a full-code
review (Sep 2026). Verify referenced lines before acting — code moves.

Priorities: **P0** = blocks the project or falsifies compliance evidence.
**P1** = important correctness, security, or architecture issue.
**P2** = worthwhile improvement. **P3** = minor cleanup.

---

## P0 — Critical

_(none open — see Completed)_

---

## P1 — High

_(none open — see Completed)_

---

## P2 — Medium

### P2-3. Large files past the ~300-line guidance (remaining)

- **Problem:** Several files still exceed ~300 lines after the P0–P2 pass.
- **Evidence:** `runtime/scan.ts`, `report-html/shared.ts`, `custom-checks/focus.ts`, `site-level/checks.ts`, `heuristic-utils.ts`, `html-validate-runtime.ts`, `assessment.ts` (sizes drift — re-check with `wc -l`).
- **Action:** Split **when touching** only; keep public symbols stable. `orgs.ts` was split in this pass (`org-queries.ts`, `org-membership.ts`).
- **Verification:** `npm run typecheck && npm run test` after each split.

### P2-5. `report-html/shared.ts` — move escape/render primitives out

- **Problem:** Still mixes HTML shell, `escapeHtml`, status helpers (not edited this pass).
- **Action:** When next editing reports, split into `report-html/primitives.ts`; keep color tokens in `report-colors.ts`.
- **Verification:** report HTML tests green; exported signatures unchanged.

---

## P3 — Low

### P3-4. Remaining untested interactive components

- **Problem:** `requirement-remediation-actions.tsx` and the connect dialog still lack adjacent RTL tests. Queue nav, filter bar, and developer handoff were covered this pass.
- **Action:** Add focused RTL tests for remediation actions + connect dialog open/close. Query by role/name.
- **Verification:** `npm run test`; coverage thresholds do not drop.

---

## Completed (recorded for audit)

### Prior

- Layout-table "is layout table?" predicate — **done**.
- TODO-SIMPLICITY / TODO-ARCHITECTURE / TODO-DUPLICATION — consumed into this list.

### P0 + P1 correctness pass (2026-09-08)

- **P0-1** — per-URL SSRF in `scanRuntime`; absolute routes rejected in `parseRoutes`.
- **P0-2** — `OrgMembershipIndex`.
- **P1-1** — error-prevention dataset keys + regressions.
- **P1-2** — atomic rate-limit increment.
- **P1-3** — PR `head.sha` 40-hex validation.
- **P1-4** — dropped noisy heuristics; catalog controls kept with `checkId: null`.
- **P1-5** — `AutoSubmitSelectForm`.
- **P1-6** — unified status counting (then migrated to `Record` in P2-9).

Design: `docs/superpowers/specs/2026-09-08-p0-p1-correctness-design.md`

### P2 + P3 pass (2026-09-08)

- **P2-1** — shared `interactive-control-selectors.ts` for contrast / target-size / forced-colors.
- **P2-2** — `withEmulatedMedia` + `hitIdentityKey` / `HIT_IDENTITY_KEY_SRC`.
- **P2-4** — `org-queries.ts` + `org-membership.ts`; `orgs.ts` re-exports + lifecycle.
- **P2-6** — `parseRoutes` no longer defaults to `["/"]` (empty → `[]`; scan defaults via `runtimeRoutesFor`).
- **P2-7** — check CLI README documents stdout + exit-code contract (`check.test.ts` already covers pass/fail).
- **P2-8** — runtime audit form hint: paths under base; empty → `/`.
- **P2-9** — dashboard/requirements chips use `Record` from `countByStatus`; removed `countByStatusMap`.
- **P3-1** — dismiss hash opens `<details>`; queue nav `aria-live`; StepIndicator completed/step text.
- **P3-2** — `BadgeWithDescription` client island; `badges.tsx` server-safe.
- **P3-3** — documented `FindingKind` `"violation"` exception in `domain-model.mdc`.
- **P3-4** — partial: queue nav, filter bar, developer handoff RTL tests.
- **P3-5** — form hint (with P2-8).
- **P3-6** — architecture.md had no deleted-id drift after P1-4.

---

## How to proceed

1. Next optional: **P2-5** (when editing reports), **P2-3** (when touching large files), finish **P3-4**.
2. Definition of done: `npm run lint && npm run typecheck && npm run test && npm run build`.
