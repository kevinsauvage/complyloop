# Todo

Backlog from a project audit (**2026-09-04**). Each item answers **what** to do, **why** it matters, and **where** the work lives.

**Where the product is:** the core loop (Requirement → Assessment → Finding → Remediation → Verification → Evidence) is implemented for GitHub + RGAA/WCAG. Analysis engines are well past “axe plus a few AST rules”: 58 custom AST checks, jsx-a11y, axe, html-validate, IBM Equal Access, 26 Playwright probes, theme + target-size condition passes (default / `320×568` / `pointer: coarse`), site-level + linkinator. Catalog: 156 controls, 130 automated / 26 manual.

**Largest remaining constraint:** assessments without a preview URL leave ~88 runtime-only check ids as `unable_to_verify`. That is adoption of `runtimeBaseUrl`, not a missing scanner. See `docs/analysis-checks-challenge.md`.

---

## Closed since 2026-09-02 (do not re-open)

- **Auto-propose at assessment** (old item 12) — `createFinding` already attaches a deterministic suggestion when the AST check emits `fix` (`src/server/assessment-findings.ts`, `buildSuggestion`). Remaining work is **more checks emitting `fix`**, not wiring the pipeline (item 10 below).
- **Analysis waves** — IBM, linkinator, html-validate, jsx-a11y, widget keyboard, dialog focus, hover content, live-region updates, form-error submit, mobile `target-size` pass, label-adjacent, keyboard trap. Strategy items 2–5 and 8 in `docs/analysis-strategy.md` are largely shipped; do not rebuild them.
- **Target size follow-ups** (old item 12) — axe `target-size` at default + `320×568` + `pointer: coarse`; separate `target-size-enhanced` 44×44 AAA check.
- **State-dependent non-text contrast** (old item 13) — hover / selected at 3:1; disabled skipped (WCAG 1.4.11 inactive exception).
- **Forced-colors mapping** (old item 14) — `complyloop-forced-colors` maps to `forced-colors`, not `non-text-contrast`.
- **Health probe Sentry flood** (old item 7) — `/api/health` reports `health_database_down` via `reportWarning`, so an uptime probe cannot drown error alerts.
- **`pruneRateLimitBuckets`** (old item 5) — idle worker ticks call it; prune failures warn and do not stop the worker.
- **Placeholder `AUTH_SECRET`** (old item 6) — production boot refuses `replace-me` / `e2e-secret-change-me` / the dev-only fallback; compose has no default secret. Playwright `e2e-secret` still allowed.

---

## P0 — Go-live blockers

Ops items. None of these have been exercised on a real staging/prod stack.

### 1. Run the deploy checklist on a real environment

- **What:** Execute every step of the go-live checklist against a production (or staging) deployment and confirm each one works.
- **Why:** The checklist has never been run end-to-end; we cannot claim production readiness until it passes on real infrastructure.
- **Where:** `docs/deploy.md` (checklist at top).

### 2. Do a backup & restore drill

- **What:** Run `npm run ops:backup`, restore the dump into a fresh database, and verify the app works against it.
- **Why:** A backup that has never been restored is not a backup. Evidence is append-only and irreplaceable.
- **Where:** `scripts/` ops backup command; Postgres from `docs/deploy.md`.

### 3. Wire Sentry alerting, not just error capture

- **What:** Create Sentry alert rules (error spikes, worker failures, webhook failures) and route them to a channel someone actually reads.
- **Why:** A DSN without alerts means production errors are recorded but nobody is notified.
- **Where:** Sentry project settings; intended alerts in `docs/deploy.md` (Monitoring).

### 4. Add an uptime probe and lock down prod flags

- **What:** Point an uptime monitor at `/api/health` and verify `E2E_AUTH_ENABLED` is unset in production.
- **Why:** Without a probe, downtime is discovered by users. The e2e auth flag bypasses real login and must never reach prod.
- **Where:** `src/app/api/health/route.ts`; deployment environment variables.

---

## P1 — Hardening

## P2 — Product & analysis follow-ups

### 9. Cluster → one PR

- **What:** Let a user open a single pull request that fixes all findings in a root-cause cluster, instead of one PR per finding.
- **Why:** Clusters already exist (`src/core/root-cause.ts`, dashboard + reports) because one shared component causes many findings; fixing them one PR at a time is the busywork spec §17 says we should remove.
- **Where:** `src/server/actions/pr.ts` (currently a single `findingId`); noted in `docs/ai/finding-flow.md`.

### 10. Expand deterministic `ProposedFix` coverage

- **What:** Emit structured `fix` from more AST checks that can be applied safely (insert/replace/remove attribute), so assessment-time suggestions cover more than a handful of rules.
- **Why:** The suggestion pipeline is live, but only a few checks (e.g. `button-name`, `input-label`, `autoplay-media`) attach a `fix`. Most source findings still start at `detected` and wait for Generate patch / AI.
- **Where:** `packages/analysis-core/src/checks/*`, `packages/analysis-core/src/fixes.ts`. Human approval still required.

### 11. Visual regression as Playwright screenshot assertions

- **What:** Capture route screenshots across assessments and fail (or `needs_review`) on unexpected visual change — as **regression evidence**, not an AI vision scanner.
- **Why:** First remaining item in `docs/analysis-strategy.md`. Catches CSS/layout loss (reflow, contrast themes, hidden content) that no rule engine names.
- **Where:** `packages/analysis-core/src/runtime/` (new condition/pass, not a new scanner product).

---

## P3 — Post-MVP (parked deliberately)

### 15. Sources beyond GitHub

- **What:** Support GitLab/Bitbucket (or a plain git URL) as project sources.
- **Why:** Spec §5 plans multiple connectors; `ProjectSource` is still `"github"` only.
- **Where:** `src/core/project-types.ts`, `src/server/` GitHub integration behind an interface.

### 16. Frameworks beyond accessibility

- **What:** Add a second compliance framework (e.g. SOC 2 or a custom checklist) through the adapter system.
- **Why:** Proves the domain is framework-agnostic (spec §26) before more a11y-specific assumptions creep in. Not near-term: spec §24 says prove the loop for one RGAA client first.
- **Where:** New adapter under `src/adapters/`, registered in `src/adapters/registry.ts`.

### 17. `accessibility-checker` install weight

- **What:** Revisit IBM Equal Access packaging (dynamic import already; npm still pulls puppeteer/chromedriver).
- **Why:** Runtime-only via `serverExternalPackages`, but install/CI cost is real. Do not add Alfa as a third sibling engine.
- **Where:** `packages/analysis-core` dependency on `accessibility-checker`; `next.config.ts` externals.

---

_Priorities: P0 = blocks a trustworthy production launch. P1 = fix soon, cheap now and expensive later. P2 = spec / analysis strategy follow-ups. P3 = intentionally after MVP._

_Do not add: Lighthouse, Pa11y, `@axe-core/playwright`, `@html-validate/wcag`, IBM **and** Alfa together, or custom twins of facts axe/html-validate/jsx-a11y/IBM already observe._
