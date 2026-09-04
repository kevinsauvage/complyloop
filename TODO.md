# TODO

Prioritized backlog produced by a full audit of `docs/*` and the source tree (Sep 2026). Every item states **what is wrong**, **why it matters**, and **what to change**, with file references. Items are ordered within each priority; verify the referenced lines before acting — code moves.

Guiding rule for this list: the product spec's MVP is *one complete loop for one client project*. Anything that does not make that loop correct, observable, or simpler is P2 or lower.

---

## P0 — Critical

### 3. The compose `migrate` service uses a redacted password

- **Wrong:** `docker-compose.yml` L28 sets `DATABASE_URL: postgres://complyloop:***@postgres:5432/complyloop` — a literal `***` (a secret-scrubber artifact). `app` and `worker` use `complyloop:complyloop`. The same `***` is the fallback in `e2e/webhook-helpers.ts` L25.
- **Why it matters:** `docker compose --profile app up` fails at the migrate step, so the reference deployment in `deploy.md` does not start; `app` never starts because it depends on `migrate` completing.
- **Change:** restore the password (or better, a shared `x-db-url` anchor / `${DATABASE_URL}` from the environment). Fix the e2e fallback the same way.

---

## P1 — High

### 3. `recentAssessmentJobsForProject` returns the oldest jobs

- **Wrong:** `.orderBy(asc(createdAt)).limit(limit)` then `.reverse()` (`src/server/assessment-jobs.ts`). With more than `limit` jobs the dashboard and `GET /api/projects/[projectId]/assessment-jobs` show the first N runs ever.
- **Change:** `orderBy(desc(createdAt)).limit(limit)`. Extend `assessment-jobs.test.ts` with > `limit` rows.

### 4. Change attribution is wrong on every re-assessment

- **Wrong:** `repo-checkout.ts` fetches `--depth 1`; `monitor.ts` attributes changed files with `git log -1 -- <file>`, which on a depth-1 clone returns HEAD for every file. `FileChange.author/commitSha` (stored in `monitoring_changes_detected` evidence and regression alerts) is the tip commit's author regardless of who touched the file.
- **Why it matters:** the platform records misleading evidence about who introduced a regression.
- **Change:** either drop per-file attribution (record only `previousGitHead → gitHead`, which is truthful) or fetch enough history (`--depth` covering the previous head, or `git fetch --shallow-since`). Prefer dropping it: it is not a core-loop requirement.

### 5. `label-adjacent` can never fail a requirement

- **Wrong:** listed in both `RUNTIME_ONLY_CHECK_IDS` and `HEURISTIC_CHECK_IDS` (`packages/analysis-core/src/check-authority.ts`). `authorityForCheck` returns `runtime_only`, but `findingsFromAxeHits` (`runtime/findings.ts`) downgrades any `isHeuristicCheck` id to `kind: "warning"`, so hits produce `needs_review` and a clean audit produces `passed`.
- **Change:** pick one class. If the adjacency probe is trustworthy, remove it from the heuristic list; if not, remove it from runtime-only so an empty run stays `unable_to_verify`. Add a `check-authority.test.ts` case asserting no id is in two lists (or asserting the intended precedence for each dual-listed id).

### 6. Media caption checks auto-pass without runtime

- **Wrong:** `video-caption`, `audio-caption`, `media-controls-present` are `standard`, so a source tree with no `<video>`/`<audio>` JSX passes RGAA 4.x criteria even when media is client-rendered or embedded. `analysis-strategy.md` principle 4 says untested ≠ passed.
- **Change:** classify them `heuristic` (AST cannot prove absence), and let runtime applicability (`runtime/applicability.ts`) turn them `not_applicable` when a preview URL is configured.

### 7. Server-action inputs are not validated at the boundary

- **Wrong:** `code-quality.mdc` requires validation at system boundaries; `zod` is used only in `src/ai/`. Server actions and `src/app/api` routes read `FormData`/JSON with ad-hoc string helpers (`action-state.ts`). Client code casts `response.json()` (`github-repo-picker.tsx`, `assessment-job-status-live.tsx`).
- **Change:** one small zod schema per action/route (`z.object({ findingId: z.string().uuid(), note: z.string().max(2000).optional() })`), parsed at the top. Same for the two client fetches.

### 8. Broken in-page action on runtime findings

- **Wrong:** `FindingNextStepPanel` links "Generate guidance" state to `#copy-handoff` (`finding-next-step-panel.tsx`), but no element has that id.
- **Change:** add `id="copy-handoff"` to the handoff section in `findings/[id]/page.tsx` or point the link at the existing section. Add a panel test asserting the target exists (`getByRole("link", …)` + `document.getElementById`).

### 9. `@complyloop/check` is documented as published but is not

- **Wrong:** README ("Same gate (published package)", "CI in your app": `npm install @complyloop/check`) and `templates/github-actions/complyloop-check.yml` assume the package is on npm. `npm view @complyloop/check` → 404 (same for `@complyloop/analysis-core`). Today the only working path is `npm run build:check && npm install ./packages/check` (or a tarball; see `src/cli/check-pack.smoke.test.ts`).
- **Change:** either publish (the bundle is self-contained — analysis-core is inlined by esbuild), or reword README/template to the tarball/local-install flow until then.

### 10. Schema and migration disagree

- **Wrong:** `drizzle/0000_init.sql` has `webhook_deliveries_processed_at_idx` and `rate_limit_buckets_count_check` (`count >= 0`); `db-store/schema.ts` has neither. `drizzle-kit generate` would emit a migration that drops them.
- **Change:** add both to `schema.ts`, then run `db:generate` and confirm it produces no diff. Consider a CI step doing exactly that.

---

## P2 — Medium

### 1. Decide what the org/multi-tenant surface is for

- **Observation:** The spec's MVP is "single client project per workspace; portfolio view can follow". The code ships orgs, roles (`owner|admin|member|viewer`), invitations by GitHub login, role changes, org export, org deletion, org switcher, personal-org auto-provisioning (`orgs.ts` 374 lines, 7 org actions, 6 org components, `org-account.spec.ts`), and all of it multiplies the load scope (P1-1).
- **Why it matters:** this is the largest non-core-loop surface in the repo and the one that made the tenant-slice persistence necessary.
- **Change:** either declare multi-org a product decision and update the spec's MVP section, or freeze it (hide invites/role management behind a flag, keep the personal org only) until the single-project loop is verified end-to-end. Do not build more on it before deciding.

### 2. Remove the `src/core` re-export shims

- **Observation:** `statuses.ts`, `finding-types.ts`, `requirement-status.ts`, `public-error.ts`, `assessment-limits.ts` are pure `export *` shims over `packages/analysis-core/src/contract/*` (with duplicated shim tests). `code-quality.mdc` forbids barrel files. The ESLint boundary rule for `src/core` matches `**/analysis/**`, which does not match `@complyloop/analysis-core/*`, so the boundary is not actually enforced.
- **Change:** import `@complyloop/analysis-core/contract/*` directly (or move the contract into `src/core` and have analysis-core depend on it — the contract is domain, not analysis). Fix the ESLint pattern to `@complyloop/analysis-core/**` with an allow-list for `contract/*`.

### 3. Enforce "adapters only via registry" or drop the rule

- **Observation:** `architecture.md` says server/app import adapters only through `src/adapters/registry.ts`; pages, `report.ts`, and `report-html/*` import `@/adapters/control-theme` directly; `wcag/presets.ts` imports `rgaaControls` directly. Nothing enforces it.
- **Change:** either export `controlForDisplay` from the registry and add a `no-restricted-imports` rule for `@/adapters/*` outside `src/adapters`, or delete the rule from the docs. With one real catalog, the registry indirection is not paying for itself yet; keep it minimal.

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

- `assessment-job-status-live.tsx` ignores every fetch error forever (a broken endpoint looks like "still running").
- `github-repo-picker.tsx` debounced search has no `AbortController`; a slow earlier response can overwrite a newer one.
- `pr.ts` L117–125, `handoff.ts`, `monitor.ts` `git` calls: fine to fall back, but record a `reportWarning` so the fallback is visible in Sentry.

### 9. Coverage gate excludes the riskiest code

- `db-store/**`, `actions/remediation-verify.ts`, `pr.ts`, `github.ts`, `webhook-deliveries.ts` are excluded from thresholds although several have unit tests (`repo/*`, `constraints.test.ts`). Drop exclusions that have tests. Add tests for `analysis-core/src/scan.ts`, `parse.ts`, `site-level/snapshot.ts`, `heuristic-utils.ts`, and `authorityForCheck` precedence.

### 10. Small correctness items

- `queuedAssessmentJobCount` selects all queued/running rows to count them — use `count()`.
- `theme-conditions.ts` switches lack the `never` default required by `typescript-conventions.mdc`; `jsx-a11y-fixes.ts` `default: return null` is not exhaustive over `CheckId` (acceptable, but document it or switch to a `Partial<Record>`).
- `finding-list-filter.ts` uses `value as Severity` / `as RemediationStatus` after `includes` — replace with a type-predicate parser.
- `assessment-jobs.ts` `jobFromRow` casts `status`/`trigger`/`payload`; validate with a zod schema or `satisfies`.
- Automated `verifyRemediationAction` does not check `status === "implemented"` before advancing (manual path does); align the two for consistent error messages.
- `webhook_deliveries` does not gate anything: `api/github/webhook/route.ts` calls `claimWebhookDelivery` and then handles the event regardless, only echoing `duplicate: !firstDelivery`. Real idempotency comes from the job `idempotencyKey`. Either return early on a duplicate (and claim only after a successful enqueue) or delete the table and `webhook-deliveries.ts`.

---

## P3 — Low

1. **Finding-flow doc vs UI copy** — already aligned in `docs/ai/finding-flow.md`; keep titles in `finding-act.ts` as the single source (consider generating the doc table from the test fixtures).
2. **Platform a11y polish** — `#dismiss-finding` hash lands on a closed `<details>` (open it on hash match); `j`/`k` queue nav has no live-region announcement; badge descriptions are tooltip-only; `StepIndicator` is `aria-hidden` without a textual "completed" state.
3. **Tests that query CSS classes** — `evidence-kind-chips.test.tsx` (`.text-status-failed`), `confirm-submit-button.test.tsx` (`button[type="submit"]`), `dashboard-status-counts.test.tsx` (`.closest("div")`) — switch to role/name queries per `code-quality.mdc`.
4. **Untested interactive components** — `FindingQueueNav`, `findings-filter-bar`, `developer-handoff`, connect dialog, `requirement-remediation-actions`. Add the `prUrl`-hides-handoff assertion at panel level.
5. **Copy** — `handoff.ts` says "issue"; domain vocabulary says Finding. `FindingKind = "violation" | "warning"` is a deliberate tension with the "don't call a Finding a violation" rule — record the exception in `domain-model.mdc` or rename to `"fail" | "review"`.
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
