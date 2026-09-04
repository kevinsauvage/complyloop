# TODO

Prioritized backlog produced by a full audit of `docs/*` and the source tree (Sep 2026). Every item states **what is wrong**, **why it matters**, and **what to change**, with file references. Items are ordered within each priority; verify the referenced lines before acting — code moves.

Guiding rule for this list: the product spec's MVP is _one complete loop for one client project_. Anything that does not make that loop correct, observable, or simpler is P2 or lower.

---

## P0 — Critical

_(P0-3 compose migrate password — cleared. Shared `x-db-url` + e2e fallback `complyloop:complyloop`.)_

---

## P1 — High

### 7. Server-action inputs are not validated at the boundary

- **Wrong:** `code-quality.mdc` requires validation at system boundaries; `zod` is used only in `src/ai/`. Server actions and `src/app/api` routes read `FormData`/JSON with ad-hoc string helpers (`action-state.ts`). Client code casts `response.json()` (`github-repo-picker.tsx`, `assessment-job-status-live.tsx`).
- **Change:** one small zod schema per action/route (`z.object({ findingId: z.string().uuid(), note: z.string().max(2000).optional() })`), parsed at the top. Same for the two client fetches.

_(P1-3 newest jobs, P1-4 drop per-file git blame, P1-5 `label-adjacent` runtime-only only, P1-6 media captions runtime-only / `media-controls-present` heuristic, P1-8 `#copy-handoff`, P1-9 local-install docs, P1-10 schema index + check — cleared.)_

---

## P2 — Medium

### 3. Enforce "adapters only via registry" or drop the rule

_(cleared — dropped the registry-only import rule from `architecture.md`; one catalog does not need the extra indirection.)_

### 4. Catalog as data, not 1800-line TS

- **Observation:** `src/adapters/rgaa/controls.ts` (1802 lines) and `guidance.ts` (836) are static literals in code; `code-quality.mdc` says split files past ~300 lines.
- **Change:** move to JSON (or one file per RGAA topic) with a typed loader and keep `catalog-coverage.test.ts` as the integrity gate. Low risk, purely mechanical.

### 5. Duplicate id/ownership lists

- `requiresHtmlValidatePass` in `contract/requirement-status.ts` re-declares the two ids already in `HTML_VALIDATE_OWNED_CHECK_IDS`; `isHtmlValidateOwnedCheck` is exported and unused. Pass the flag in from the adapter (`assessment-status.ts`) instead of hard-coding ids in the contract.
- RequirementStatus → colour maps duplicated in `requirement-status-accent.tsx` and `dashboard-status-counts.tsx`; role → badge classes duplicated in `org-members-card.tsx` and `org-account-overview.tsx`; "passed" tint hard-coded in `preset-navigator.tsx`, `default-preset-form.tsx`, `github-repo-picker.tsx`. One `statusTone()` in `components/badges.tsx`.
- Custom Playwright probes are wrapped into a synthetic axe violation shape (`custom-checks/index.ts` → `toAxeViolation` → `complyloop-*` ids in `axe-map.ts`) just to reuse the axe mapping. Emit `RawFinding` directly and drop the fake axe layer.

### 6. Dead code

_(cleared)_

### 7. Cookie-controlled load scope

_(cleared — workspace load is membership-org + active project only; stale project cookies are ignored if the id is not in that list.)_

### 8. Swallowed errors that hide real failures

- `pr.ts` L117–125, `handoff.ts`, `monitor.ts` `git` calls: fine to fall back, but record a `reportWarning` so the fallback is visible in Sentry.

_(job-status poll errors and GitHub repo search `AbortController` — cleared.)_

### 9. Coverage gate excludes the riskiest code

_(cleared — modules with unit tests are in the gate; remaining `db-store` exclusions are live Postgres wiring. `scan` / `parse` / `snapshot` / `heuristic-utils` / `authorityForCheck` precedence have colocated tests.)_

### 10. Small correctness items

- `webhook_deliveries` does not gate anything: `api/github/webhook/route.ts` calls `claimWebhookDelivery` and then handles the event regardless, only echoing `duplicate: !firstDelivery`. Real idempotency comes from the job `idempotencyKey`. Either return early on a duplicate (and claim only after a successful enqueue) or delete the table and `webhook-deliveries.ts`.

_(count(), exhaustive theme switches, list-filter parsers, `jobFromRow` validation, automated verify requires `implemented` — cleared.)_

---

## P3 — Low

1. **Finding-flow doc vs UI copy** — already aligned in `docs/ai/finding-flow.md`; keep titles in `finding-act.ts` as the single source (consider generating the doc table from the test fixtures).
2. **Platform a11y polish** — `#dismiss-finding` hash lands on a closed `<details>` (open it on hash match); `j`/`k` queue nav has no live-region announcement; badge descriptions are tooltip-only; `StepIndicator` is `aria-hidden` without a textual "completed" state.
3. **Tests that query CSS classes** — `evidence-kind-chips.test.tsx` (`.text-status-failed`), `confirm-submit-button.test.tsx` (`button[type="submit"]`), `dashboard-status-counts.test.tsx` (`.closest("div")`) — switch to role/name queries per `code-quality.mdc`.
4. **Untested interactive components** — `FindingQueueNav`, `findings-filter-bar`, `developer-handoff`, connect dialog, `requirement-remediation-actions`. Add the `prUrl`-hides-handoff assertion at panel level.
5. **Copy** — `FindingKind = "violation" | "warning"` is a deliberate tension with the "don't call a Finding a violation" rule — record the exception in `domain-model.mdc` or rename to `"fail" | "review"`.
6. **`badges.tsx` is a client component** only because of tooltip wrappers; every status badge becomes a client island. Split the tooltip into a thin client child.
7. **Files over ~300 lines** (`runtime/scan.ts` 490, `report-html/shared.ts` 438, `orgs.ts` 374, `custom-checks/focus.ts` 357, `site-level/checks.ts` 347, `heuristic-utils.ts` 323, `html-validate-runtime.ts` 321, `assessment.ts` 310). Split when touching, not as a project.
8. **Low-confidence AST heuristics** (`sensory-characteristics`, `image-of-text`, `error-suggestion`, `pointer-gesture`, `motion-actuation`, `audio-description-track`, `captions-live`, `p-as-heading`) emit `confidence: "low"` noise in CI. Per `analysis-strategy.md` ("skip low-trust heuristics"), review each: keep as `needs_review` producers only if a developer can act on the output, otherwise delete.
9. **`tsx` + `typescript` as runtime dependencies** — required because the worker and migrations run TypeScript in production. Acceptable for now; a compiled `scripts/` output would shrink the image and remove the dependency on `tsc` at runtime.

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
