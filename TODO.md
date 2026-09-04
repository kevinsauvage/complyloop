# TODO

Prioritized backlog produced by a full audit of `docs/*` and the source tree (Sep 2026). Every item states **what is wrong**, **why it matters**, and **what to change**, with file references. Items are ordered within each priority; verify the referenced lines before acting — code moves.

Guiding rule for this list: the product spec's MVP is _one complete loop for one client project_. Anything that does not make that loop correct, observable, or simpler is P2 or lower.

---

## P2 — Medium

### 4. Catalog as data, not 1800-line TS

- **Observation:** `src/adapters/rgaa/controls.ts` (1802 lines) and `guidance.ts` (836) are static literals in code; `code-quality.mdc` says split files past ~300 lines.
- **Change:** move to JSON (or one file per RGAA topic) with a typed loader and keep `catalog-coverage.test.ts` as the integrity gate. Low risk, purely mechanical.

### 5. Duplicate id/ownership lists

_(cleared — html-validate gate is an adapter flag; `statusTone` in `src/core/status-tone.ts`; custom probes emit `RawFinding`.)_

## P3 — Low

1. **Finding-flow doc vs UI copy** — already aligned in `docs/ai/finding-flow.md`; keep titles in `finding-act.ts` as the single source (consider generating the doc table from the test fixtures).
2. **Platform a11y polish** — `#dismiss-finding` hash lands on a closed `<details>` (open it on hash match); `j`/`k` queue nav has no live-region announcement; badge descriptions are tooltip-only; `StepIndicator` is `aria-hidden` without a textual "completed" state.
3. **Untested interactive components** — `FindingQueueNav`, `findings-filter-bar`, `developer-handoff`, connect dialog, `requirement-remediation-actions`. Add the `prUrl`-hides-handoff assertion at panel level.
4. **Copy** — `FindingKind = "violation" | "warning"` is a deliberate tension with the "don't call a Finding a violation" rule — record the exception in `domain-model.mdc` or rename to `"fail" | "review"`.
5. **`badges.tsx` is a client component** only because of tooltip wrappers; every status badge becomes a client island. Split the tooltip into a thin client child.
6. **Files over ~300 lines** (`runtime/scan.ts` 490, `report-html/shared.ts` 438, `orgs.ts` 374, `custom-checks/focus.ts` 357, `site-level/checks.ts` 347, `heuristic-utils.ts` 323, `html-validate-runtime.ts` 321, `assessment.ts` 310). Split when touching, not as a project.
7. **Low-confidence AST heuristics** (`sensory-characteristics`, `image-of-text`, `error-suggestion`, `pointer-gesture`, `motion-actuation`, `audio-description-track`, `captions-live`, `p-as-heading`) emit `confidence: "low"` noise in CI. Per `analysis-strategy.md` ("skip low-trust heuristics"), review each: keep as `needs_review` producers only if a developer can act on the output, otherwise delete.
8. **`tsx` + `typescript` as runtime dependencies** — required because the worker and migrations run TypeScript in production. Acceptable for now; a compiled `scripts/` output would shrink the image and remove the dependency on `tsc` at runtime.

---

## Product follow-ups (from `finding-flow.md`)

- Cluster → one PR (root-cause clusters already exist in `src/core/root-cause.ts`; the PR flow is per finding).
- Auto-propose deterministic patches at assessment time (still gated by ComplyLoop + human PR).

## What NOT to do

Parked deliberately — see `docs/analysis-strategy.md` for the reasoning:

- Add Lighthouse, Pa11y, WAVE, IBM Equal Access, Alfa, `jest-axe`, or another axe-class scanner.
- Add `@axe-core/playwright` (bundling breaks axe `source`).
- Enable `html-validate:recommended` / `@html-validate/wcag`, or use html-validate for anything beyond RGAA 8.2 / 10.1.
- Screenshot or visual-regression every route × viewport × theme.
- Build a generic repository/ORM abstraction while fixing P1-1 — direct Drizzle at the edges is enough.
- Add a second framework adapter before the single-project loop is verified end-to-end (P0-1).
