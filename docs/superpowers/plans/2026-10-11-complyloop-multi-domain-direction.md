# ComplyLoop Multi-Domain Direction — Planning & Documentation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave the repo documentation in a state where a strong coding agent knows what ComplyLoop is becoming (continuous compliance & quality engineering: accessibility → eco-design → performance → security), what architecture must change, what to build first, and what not to build yet. **No code is implemented by this plan.**

**Architecture:** Evolve, don't rewrite. The existing loop (Requirement → Assessment → Finding → Remediation → Verification → Evidence → Monitoring) is already domain-neutral in its _contract_ layer; the accessibility coupling lives in the catalog, project scoping, the assessment pipeline, the findings engine vocabulary, and the UI. One new shared concept is added: **Measurement** (kept separate from requirement, finding, status and score). Domains are data (a `domain` on `Framework`) plus domain-owned engines — not a plugin framework.

**Tech Stack:** Next.js 16 / React 19 / TS strict, Postgres + Drizzle (raw-SQL migrations), npm workspaces (`packages/analysis-core`, `packages/db`), GitHub Actions worker with Playwright, Vitest.

**Spec:** [`PROMPT.md`](../../../PROMPT.md) (product direction + task definition). Existing source of truth for current behavior: the code; secondary: `docs/ai/architecture.md`, `docs/compliance-engineering-product-spec.md`, `.cursor/rules/*.mdc`.

## Global Constraints

Copied from `PROMPT.md` §8 and `AGENTS.md`:

- Code is the source of truth; do not trust comments/docs blindly. Documentation/planning only — **do not implement code**.
- No large rewrite; KISS; no abstraction without a demonstrated shared concept; no dead code or speculative features.
- Domain-specific logic stays separate from shared infrastructure.
- Automated verification is deterministic. AI may explain/suggest, **never** sets requirement/finding status.
- `verified` must mean objectively verifiable. Keep `not_applicable` / `not assessed` / `unable_to_verify` / `failed` / `passed` distinct.
- Measurements ≠ compliance decisions. Scores ≠ compliance status.
- Do not claim EU/French law mandates EcoIndex. Do not invent regulatory requirements.
- Update existing docs; add at most **one** new doc (`docs/ai/platform-direction.md`).
- `AGENTS.md` boundary: ask before touching `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`. This plan only _describes_ those changes.
- Verification for doc tasks: `npx prettier --check <files>` (repo uses Prettier; docs are formatted) and a link check by `rg`. Full gate (`npm run verify:gate`) is unaffected but run once at the end.

---

# Part A — Audit results (from the code, not the docs)

## A1. What the code actually is today

| Area                       | Reality (file evidence)                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy                    | orgs/memberships/RBAC in `src/core/rbac.ts`; `projects.org_id`. Domain-neutral.                                                                                                                                                                                                                                                                                                                                 |
| Project                    | `Project` = **one GitHub repo** (`source: "github"`, `github` meta) + optional `runtimeBaseUrl` / `runtimeRoutes: string[]` + single `defaultPresetId` (`contract/project-types.ts`). No "digital product", no Page entity; a "page" is just a route string.                                                                                                                                                    |
| Reference data             | `Framework`, `Control`, presets are **compile-time** (`catalog/`), not in Postgres. `shippedCatalog()` returns `frameworks=[rgaa,wcag]` but `controls=[...rgaaControls]` **only**. WCAG has no controls of its own: it is a `secondaryCode` on RGAA-catalog controls (`catalog/wcag/controls.ts` is 7 lines; WCAG presets filter the RGAA list).                                                                |
| Requirement                | One row per (project, control) (`requirements_project_control_uidx`). `RequirementStatus = passed\|failed\|needs_review\|not_applicable\|unable_to_verify`; `determination = automated\|human_review`; sticky human `exception`/`humanPass` with re-arm on newer violations. Domain-neutral.                                                                                                                    |
| Status derivation          | `deriveRequirementStatus` (`contract/requirement-status.ts`) is pure and exhaustive over `CheckAuthority = manual\|standard\|runtime_only\|heuristic\|site_level`. Inputs are a11y-engine-shaped (`runtimeRan`, `htmlValidateRan`, `filesScanned`); `standard` ⇒ "passed only if `filesScanned > 0`" (AST-specific).                                                                                            |
| Assessment                 | `runAssessment` (`server/assessment/assessment.ts`, ~670 lines) is one monolith: scratch rows → change detection (git snapshot) → AST scan → optional Playwright/axe → merge → per-control reconcile → status refresh → evidence. One `Assessment` per project run; `latestAssessmentFor(assessments, projectId)` is **domain-blind** and feeds change detection (`previous.snapshot`), dashboard and settings. |
| Finding                    | `Finding` has `controlId`, `checkId` (string; `RawFinding.checkId` is the strict a11y `CheckId` union), `analyzerId` (a11y analyzer union), `location: source\|dom\|site`, `fix` (JSX attribute edits), `severity`, `confidence`, `kind: violation\|warning`. DB column `findings.engine` CHECK `IN ('ast','runtime')`.                                                                                         |
| Remediation / verification | `RemediationStatus = detected→suggested→approved→implemented→verified`. Source: patch → draft PR → merge → re-assess. Runtime: guidance → approve → implement → **re-audit** (`remediation-verify-worker.ts`). `verified` only via deterministic re-check or explicit manual attestation with note (`remediation_manually_verified`).                                                                           |
| Evidence                   | Append-only (`insertEvidence`, DB trigger `0004`). `EvidenceKind` is a **frozen** union — new events reuse `finding` / `assessment_job` / `requirement_status_changed` with a `detail.event` discriminant. Has `controlId`, `findingId`, `assessmentId`; no domain column (derivable via control → framework).                                                                                                  |
| Monitoring                 | Webhook (push to live default branch only) → enqueue job → GH Actions worker. `Alert` has one kind (`compliance_regression`). History = `listAssessmentHistoryForProject` (last 10, requirement-status counts) + `requirement_status_changed` evidence with `detail.regression`. **No time series of values.**                                                                                                  |
| Jobs                       | `assessment_jobs` (lease, 3 attempts, serial-per-project unique index, idempotency key). `trigger ∈ manual\|webhook\|verify_remediation`. Stages `checkout→changedetection→ast→runtime→reconcile→apply`. Every job clones the repo.                                                                                                                                                                             |
| Runtime engine             | `runtime/scan.ts`: SSRF-guarded Playwright navigation per route, axe + custom probes + html-validate + linkinator. Already produces a rendered page and a `RuntimePageSnapshot`; **collects no resource/network/size metrics.** Reusable browser plumbing (`url-safety.ts`, `runtime-navigation.ts`, route/quota limits).                                                                                       |
| AI                         | `src/ai/` explain/remediate only; imports contract only; never sets status (ESLint-enforced). Keep.                                                                                                                                                                                                                                                                                                             |
| UI                         | `(app)/{dashboard,requirements,findings,evidence,settings,org}`; requirements grouped by RGAA themes / WCAG principles (`control-theme.ts`); preset navigator; nav/copy/reports are RGAA/WCAG-worded (`report-model.ts`, `report-markdown.ts`, `secondaryReferenceLabel`).                                                                                                                                      |
| CI/PR                      | **None, by recorded decision.** `architecture.md` "Decision (permanent, Sep 2026): no per-PR Check Runs… Do not re-propose… without a new product decision that explicitly reverses this one." Webhook handles `push` only.                                                                                                                                                                                     |

## A2. Stale or wrong documentation found (fix in Task 6)

- `docs/README.md` links `ai/github-integration-audit.md` — file does not exist.
- `AGENTS.md` links `next-reco-todo.md` — file does not exist.
- `.github/workflows/assessment-worker.yml` header still says "repo checkout + Check Runs"; `architecture.md` says Check Runs were removed. (Comment-only; flag, fix opportunistically.)
- `TODO.md` states it replaces `CRITICAL-TODOS.md`; both still exist. Out of scope here except a pointer.

## A3. Architecture blockers for adding RGESN (verified)

| #   | Blocker                                                                            | Evidence                                                                                                                                                                                                                                                                                                      | Why it blocks                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **"No preset ⇒ whole catalog."**                                                   | `project-scope.ts: scopedControlIds` returns `undefined` when `defaultPresetId` is unset; `controlsInScope` then returns the entire catalog.                                                                                                                                                                  | The moment RGESN controls enter `shippedCatalog()`, every project without a stored preset silently starts assessing RGESN (manual controls ⇒ flood of `unable_to_verify`, false regressions).         |
| B2  | **One preset per project.**                                                        | `Project.defaultPresetId` (single); `requirementsInScope`/`findingsInScope`/dashboard/settings all assume it.                                                                                                                                                                                                 | A project must run Accessibility **and** Eco-design simultaneously.                                                                                                                                   |
| B3  | **Catalog assumes RGAA/WCAG.**                                                     | `shippedCatalog` controls = RGAA only; `catalogControlIds` validates against `rgaaControls` only; `control-theme.ts` hardcodes `RGAA_THEMES`/`WCAG_PRINCIPLES` and `wcagFramework.id` swap logic; `guidanceFor` delegates to RGAA guidance; `Control.secondaryCode` is required; `Framework` has no `domain`. | RGESN needs its own controls, themes, guidance, no cross-reference code.                                                                                                                              |
| B4  | **`latestAssessmentFor` is domain-blind and drives a11y change detection.**        | `assessment.ts:347`, `dashboard-view.ts:93`, `settings-view.ts:42`.                                                                                                                                                                                                                                           | An eco/measurement assessment (no snapshot, no files) would become the "previous" assessment for the a11y scan, defeating `sourcesUnchanged` reuse and scoped scans, and corrupting dashboard counts. |
| B5  | **`Assessment` shape is AST-centric.**                                             | `filesScanned`, `scanMode`, `snapshot`, `engines.ast: true` (literal type), `summary` over all requirements.                                                                                                                                                                                                  | Measurement runs have no files/AST; summary must be per domain.                                                                                                                                       |
| B6  | **Every job clones the repo; stages are a11y-named; one serial slot per project.** | `ASSESSMENT_JOB_STAGES`, `assessment-worker.ts` checkout.                                                                                                                                                                                                                                                     | Measurement of a URL needs no checkout (cost + latency + failure modes).                                                                                                                              |
| B7  | **Finding vocabulary is a11y-closed.**                                             | `findings_engine_check IN ('ast','runtime')`; `AnalyzerId` union; `RawFinding.checkId: CheckId`; `FindingLocation` has no page/metric location.                                                                                                                                                               | Eco findings need a new engine bucket and a page-metric location. (Not needed until Phase 3.)                                                                                                         |
| B8  | **Authority classes can't express "measured".**                                    | `CheckAuthority` set; `standard` ⇒ `filesScanned>0`.                                                                                                                                                                                                                                                          | Threshold-on-measurement controls need an authority gated on "measurement ran for this route". (Phase 3.)                                                                                             |
| B9  | **No measurement, page identity or history store.**                                | No such table/type.                                                                                                                                                                                                                                                                                           | Required for trends/regressions (Phases 2, 4, 5).                                                                                                                                                     |
| B10 | **PR-check direction contradicts a recorded permanent decision.**                  | `architecture.md` decision paragraph.                                                                                                                                                                                                                                                                         | Phase 6 cannot start without an explicit superseding product decision (see Part D, D-CI).                                                                                                             |

Not blockers (verified): evidence kinds (reuse general kinds), requirement/finding status enums, remediation lifecycle names, RBAC, write model/locks, queue/lease model, AI isolation.

---

# Part B — Target model (decisions)

## B1. Vocabulary (add to `domain-model.mdc`; do not rename existing terms)

| Concept                    | Meaning                                                                                                                                                                                                                  | Source of truth                       | Deterministic?                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------- |
| **Standard**               | A reference document. Classified: _legal/regulatory requirement_ · _technical standard_ · _measurement framework_ · _optional metric_.                                                                                   | Catalog (`Framework`)                 | n/a                                         |
| **Domain**                 | `accessibility \| eco_design \| performance \| security`. A property of a `Framework`; a control's domain = its framework's domain.                                                                                      | `Framework.domain`                    | n/a                                         |
| **Control**                | A machine-understandable obligation from a standard (existing).                                                                                                                                                          | Catalog                               | n/a                                         |
| **Requirement**            | A control applied to a project, carrying a status (existing).                                                                                                                                                            | DB                                    | status derived                              |
| **Measurement** _(new)_    | An observed value at a point in time: `(project, route, engine+version, metricId, value, unit, conditions, measuredAt, source ref)`. Append-only. Carries its own uncertainty/conditions. Says nothing about compliance. | DB `measurements`                     | Yes **per conditions**; variance documented |
| **Finding**                | A specific failure instance against a control, derived from an assessment of a measurement/scan or raised manually (existing).                                                                                           | DB                                    | derived                                     |
| **Compliance status**      | `RequirementStatus` from `deriveRequirementStatus` (existing). The only thing that means "compliant".                                                                                                                    | DB                                    | Yes (or sticky human)                       |
| **Score** _(new, derived)_ | A versioned, named aggregate (e.g. `complyloop-eco/v1`) computed from measurements and/or requirement statuses for display & trends. **Never** an input to status. Never stored in `requirements`.                       | Computed / cached with `scoreVersion` | Yes, but a model, not a verdict             |

Rule: `Measurement → (assessed by control rule) → Finding → Requirement status`; `Score` branches off measurements/statuses for display only.

## B2. Shared vs domain-specific

**Shared platform (keep, minimal edits):** tenancy/RBAC; `Project`; `Requirement` + status derivation; `Finding`/`Remediation` lifecycle; `Evidence` (append-only); job queue/lease/worker; write model + locks; alerts; reports shell; AI isolation; catalog _mechanism_ (Framework/Control/Preset).

**Domain-specific (owned per domain, in `packages/analysis-core/src/<domain>/` or `catalog/<standard>/`):** controls & guidance; check/rule registry and authority classes; engines (AST/axe for a11y; measurement engine for eco/perf); verification strategy; display themes; score formulas.

**Explicitly not building:** a `DomainPlugin` interface, a generic "scanner" registry, or per-domain DB schemas. Domains are `Framework.domain` + folders. Extract an interface only when the **second** domain duplicates real code (expected Phase 3, when eco rules and a11y rules both need "evaluate → findings").

## B3. Standards model (docs only; no invented law)

| Standard                              | Class                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Notes                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| RGAA 4                                | Legal/regulatory reference in France for public bodies (and some private entities) — **state exactly the applicability the official source states; verify before writing**                                                                                                                                                                                                                                                                                                                                                                                                              | Existing catalog                        |
| WCAG 2.2                              | Technical standard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Existing cross-reference + WCAG presets |
| RGESN (2024 edition)                  | Official French reference framework published by Arcep & Arcom with ADEME/DINUM; derives from art. 25 of the REEN law (loi n° 2021-1485). **Treat as a reference framework; do not assert which organisations are legally bound — verify on the official site.** Edition: 2024 (v1.0.1 Jan 2023 is superseded). Licence: **Licence Ouverte 2.0 (Etalab)**, per the owner (data.gouv.fr dataset page, Oct 2026) — commercial reuse allowed with attribution (source + date of last update). Task 3 records the data.gouv.fr URL; keep an attribution line in the catalog and in reports. | New catalog (Phase 1)                   |
| EcoIndex                              | Measurement/scoring methodology by a community collective. **Not** a regulatory requirement. Site states CC-BY-NC-ND for the algorithm/results; LCA values reported as not freely licensed; code-package licences conflict between ports. → treat as _optional external metric_, never the scoring core.                                                                                                                                                                                                                                                                                | Optional, off by default                |
| Core Web Vitals / performance budgets | Measurement framework (vendor-defined thresholds) / optional metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase 7                                 |
| Security headers, dependency checks   | Technical good practice (OWASP-style); not regulatory in this product                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 8                                 |

> Search-based facts above (Arcep/Arcom authorship, REEN art. 25, 78 criteria in the 2024 edition, EcoIndex licence statements) come from secondary web results. **Task 3 must confirm each against the primary official page before it lands in `docs/`**, and cite the URL.

## B4. Eco-design strategy (what Task 3 documents in `platform-direction.md`)

1. **RGESN representation.** One `Framework` (`fw-rgesn-2024`, `domain: "eco_design"`). Each RGESN criterion → one `Control` (`ctl-rgesn-<theme>-<n>`, `code: "RGESN <ref>"`, `secondaryCode` omitted). Add optional `Control.automation: "manual" | "measured" | "static"` _only if_ the existing `checkId: null` ⇒ manual convention proves insufficient; default: `checkId === null` ⇒ manual (already the rule). Themes come from the standard's own categories (verify), not invented. Preset(s): "Full RGESN" and, optionally, "RGESN — priority criteria" if the standard defines priority levels.
2. **Automated vs manual.** RGESN is mostly strategy/specification/UX/content/hosting/process criteria; the majority are **manual** (`unable_to_verify` until a human pass/exception — existing mechanism). Only criteria with an objective, page-observable proxy get a check: e.g. unnecessary heavy media, lazy loading, resource compression, caching headers, third-party count, autoplay. Per-criterion decision recorded in the catalog as `checkId` or `null`, with a one-line rationale. **A measured proxy that does not fully satisfy the criterion yields `needs_review` on regression, never `passed` for the whole criterion** (use `heuristic` authority semantics: cannot pass on an empty finding set).
3. **Measurements (v1, all browser-observable, deterministic given conditions):** transferred bytes (total & per type: HTML/JS/CSS/image/font/media/other), request count, third-party request count/bytes, DOM node count, DOM max depth, image count & uncompressed-format hints, compression/caching header presence per resource. **Excluded v1:** time-based metrics (LCP/TBT) — noisy on CI runners (Phase 7), energy/CO₂ estimates (model-dependent).
4. **Measurement engine abstraction.** One narrow function-shaped contract in `analysis-core/src/measurement/`: `measurePage(url, conditions) → PageMeasurement { metrics: Metric[], engine: {id, version}, conditions, failure? }`. Injected like `RuntimePageScanner` today (testable without a browser). Implementation reuses `runtime/` navigation + `url-safety`. Engines are versioned; `engine.id@version` is stored on every measurement so engine evolution never rewrites history. External engines (EcoIndex-style) would be _another implementation of the same function_, off by default.
5. **Page-level.** Page identity = `(projectId, normalized route)` using the existing `runtimeRoutes` + `scannedRouteOf`. **No `pages` table in v1** (YAGNI). Revisit in Phase 4 only if per-page labels/ownership are required.
6. **Historical measurements.** New append-only table `measurements` (Part C Phase 2). Never updated. Retention policy defined with the table (keep raw per-run rows N days; keep daily/weekly rollups later).
7. **Regression detection (Phase 5).** Compare a run's per-route metric against a **baseline** (default: median of last K successful runs on the default branch/prod URL; K and noise band stored with the rule). Regression = delta beyond `max(absoluteFloor, relativeThreshold, noiseBand)`. Output: a **Finding** (kind `warning` by default, `violation` only when a hard budget set by the user is exceeded) linked to the control that owns the budget, plus an `Alert`. Thresholds are user/org configuration, versioned; never silently changed by the system.
8. **Evidence.** Each assessed run writes one `finding`/`assessment_job` evidence row with `detail.event = "measurement_recorded"` referencing measurement ids + engine version + conditions + git SHA/deployment ref. Raw HAR is **not** stored in v1 (size/PII); store the summarized resource list (url-origin, type, bytes) in the measurement `detail`.
9. **Scoring.** ComplyLoop computes its own score, named and versioned (`complyloop-eco/v1`), from documented, defensible inputs (e.g. bytes, requests, DOM nodes vs published budgets). It is displayed beside — never instead of — requirement status. Do not call it "EcoIndex" and do not reuse EcoIndex constants/LCA values without a licence review. Compliance % shown in the unified view is **requirements passed / assessable requirements** (status-based), a different number from the score.
10. **Limitations to state in-product and in docs:** one run = one device/network/cache condition; third-party content varies by request; consent banners/A-B tests change page weight; logged-in pages need auth (out of scope v1); lab numbers ≠ real-world usage footprint.

## B5. Monitoring model (Task 3 documents)

```
Project → Routes (runtimeRoutes) → Measurements (per run, per route, per metric)
        → Assessments (per domain) → Findings → History → Trends → Regressions
```

- A site changes by **code** (commit), **content**, **third parties**, **infrastructure**. Every measurement stores `git SHA` (when known) + `deployment ref` + `measuredAt` + conditions so a change can be attributed or flagged "not tied to a commit" (links to `TODO.md` P0 "Tie runtime audit to the commit that was scanned" — that fix is a prerequisite for trustworthy attribution; the eco design reuses its `deployment_status` handling).
- **Trend** = ordered series of measurements for (route, metric, conditions) — only comparable when `conditions` and `engine.id@major` match.
- **Regression** = rule-evaluated delta vs baseline (B4.7) for measurements; for requirements it stays the existing `requirement_status_changed` + `regression: true`.
- Unified view: per-domain `compliance % (status-based)` + `score (model)` + `open findings` + `regressions`, computed by `domain → framework → control → requirement` joins; no new aggregate table until a measured need.

## B6. CI/CD (Task 3 documents; Phase 6)

```
PR opened / deployment_status=success ─▶ resolve preview URL + SHA
  ─▶ enqueue job (domain set, trigger=ci, baseline=default-branch ref) ─▶ worker measures + (a11y runtime audit)
  ─▶ compare vs baseline with thresholds ─▶ CI result {pass | warn | fail | unable} ─▶ GitHub Check Run + summary
```

- Pieces: GitHub webhook events `pull_request` + `deployment_status`; job `trigger` += `ci`; `baseline` resolution (last successful default-branch measurement set); `CiResult` derived deterministically from findings/thresholds (exit semantics: only user-configured hard budgets can `fail`; heuristic regressions `warn`; failed measurement ⇒ `unable`, never `pass`); GitHub Checks API write permission (currently documented as removed).
- A PR scan is **non-authoritative** (the repo already has `authoritative: false` semantics in `RunAssessmentOptions`): it must persist no requirement status and no auto-verify; it persists only CI-scoped measurements/results tagged with the PR ref.
- **Gate:** requires a new product decision (D-CI). Alternative that does not reverse the decision: a CLI/GitHub Action that runs measurement against a URL and exits non-zero, with no Check Runs/PR comments.

## B7. Preserve (do not touch)

Contract status model & `deriveRequirementStatus` precedence; sticky-decision re-arm; evidence append-only + trigger + frozen kinds; `with*Write` write model and locks; stale-write guards; job queue (lease/heartbeat/idempotency/serial-per-project); authority-class discipline and the "empty scan never passes" rule; advisory-downgrade rule; AI isolation (`src/ai` ↛ `@/server`, never sets status); SSRF guard + runtime navigation safety; compile-time catalog with presets (extend, don't move to DB); jsonb-payload + denormalized-column persistence pattern; tenant isolation; `server-only` fences; ESLint boundary rules; GH Actions worker topology; finding-page UX contract; accessibility of ComplyLoop's own UI.

---

# Part C — Roadmap (ordered by dependency and value)

Notation per phase: **Obj / Why / Areas / Arch / DB / API / UI / Deps / Risks / Not yet**. "Ask first" = touches a protected path in `AGENTS.md`.

### Phase 0 — Architecture preparation (no new domain yet)

- **Obj:** Make scoping, catalog and "latest assessment" domain-aware with **zero behavior change** for accessibility.
- **Why:** Fixes B1–B5 so adding RGESN cannot silently change existing projects.
- **Areas:** `contract/project-types.ts` (ask first), `catalog/*`, `server/workspace/project-scope.ts`, `core/assessment/assessment-helpers.ts`, settings/requirements views.
- **Arch:**
  1. `Framework.domain: Domain` (`"accessibility"` for RGAA/WCAG). `Control.secondaryCode` → optional.
  2. `Project.presetIds: string[]` (replaces single `defaultPresetId`; read-time fallback `presetIds ?? [defaultPresetId ?? connectDefault]`; payload is jsonb so **no SQL migration**; migrate on write).
  3. `controlsInScope` = union of enabled presets' controls; **remove the "undefined ⇒ whole catalog" path** (fallback = default connect preset).
  4. `Assessment.domain` (optional, defaults `"accessibility"` on read) and `latestAssessmentFor(assessments, projectId, domain)`; update the 3 call sites.
  5. `catalogControlIds`/`shippedCatalog` become framework-aggregated (loop over per-standard control arrays); `control-theme` takes themes from the framework entry (themes data moves next to each standard).
  6. Job payload gains `domain` (default accessibility); stage vocabulary unchanged until Phase 2.
- **DB:** none (jsonb payload). Optional later: `assessments` domain index.
- **API/UI:** Settings: multi-preset selection UI shows only accessibility presets for now. No visible change otherwise.
- **Deps:** none. **Risks:** silent scope change for existing projects (cover with a test: project without `presetIds`/`defaultPresetId` assesses exactly the RGAA full preset); type ripple from `secondaryCode`.
- **Not yet:** any RGESN data, `measurements` table, new engine bucket, plugin interface.

### Phase 1 — RGESN foundation (catalog + manual assessment)

- **Obj:** Users can enable RGESN, see its requirements, and assess criteria manually (human pass / exception / N/A) with evidence.
- **Why:** Delivers eco value without any new engine; validates the shared model on a second standard.
- **Areas:** `catalog/rgesn/{framework,controls,presets,themes}.ts`, requirements page, settings, display copy, reports.
- **Arch:** controls with `checkId: null`; guidance per control (deterministic text from the standard, with attribution); themes from the standard's categories; domain tabs on Requirements; report model uses framework-driven labels instead of RGAA/WCAG literals.
- **DB:** none (requirements rows are created lazily by existing refresh path — verify it seeds rows for newly enabled presets).
- **API:** settings action to enable/disable presets (domain-aware); `?presetId=` browse stays browse-only.
- **UI:** domain switcher, RGESN theme grouping, "manual — needs human review" state explained; no scores.
- **Deps:** Phase 0. RGESN text licence is settled (Licence Ouverte 2.0): ship attribution (source, edition, date of last update) in the catalog and in exported reports.
- **Risks:** missing attribution; mis-modelling criteria granularity (RGESN criteria have sub-checks); `unable_to_verify` flood confusing users → show "not assessed" copy.
- **Not yet:** automated RGESN checks, measurements, scores, regressions.

### Phase 2 — Environmental measurement engine

- **Obj:** Measure pages (bytes, requests, DOM, composition, third parties) on configured routes and store them historically.
- **Why:** Prerequisite for automated RGESN checks, scores, trends, regressions; history only accrues from the first run, so ship storage **before** UI/trends.
- **Areas:** `analysis-core/src/measurement/`, `server/assessment/` (new measurement run path), worker, `packages/db` (`measurements` repo), job schema.
- **Arch:** `measurePage` contract (B4.4); `runMeasurement(project, routes, conditions)` as a **separate** server function from `runAssessment` (no checkout; shares browser plumbing); job `domain: "eco_design"`; new stage `measure`; deterministic conditions object (viewport, cold cache, no throttling, user-agent, locale, consent-banner policy); contained per-page failures (`pageFailures` pattern); stored `engine.id@version`.
- **DB (ask first, new migration `0006_measurements`):** `measurements(id, project_id fk cascade, assessment_id fk, route, engine_id, engine_version, metric_id, value double precision, unit, conditions jsonb, git_sha, deployment_ref, measured_at, detail jsonb)`, indexes `(project_id, route, metric_id, measured_at desc)`; insert-only (same trigger pattern as evidence); retention note. Raw SQL via the `db-migration` skill.
- **API:** server action "Measure now"; webhook/push enqueues eco job when eco domain enabled; `GET` measurements via reporting loader (no direct Drizzle in pages).
- **UI:** minimal per-route latest-measurements table on a new "Eco-design" page; **no score, no verdicts**.
- **Deps:** Phase 0; (strongly) `TODO.md` P0 "reconcile against current data" is unrelated but its scan/reconcile split pattern should be followed.
- **Risks:** CI-runner variance (use structural metrics only); SSRF (reuse `assertSafeRuntimeUrl`); cost/time on worker (route quota reuse `ASSESSMENT_MAX_RUNTIME_PAGES`); consent banners; storage growth.
- **Not yet:** thresholds, findings, scores, EcoIndex integration, LCP/TBT, energy/CO₂, HAR storage.

### Phase 3 — RGESN assessments (automated where reliable)

- **Obj:** Turn measurements into requirement status/findings for the criteria that have an objective proxy.
- **Why:** First real "measurement → finding → remediation → re-measure → verified" loop outside accessibility.
- **Areas:** `catalog/rgesn` (`checkId`s), `analysis-core/src/measurement/rules`, `contract` (`CheckAuthority`, `AnalyzerId`, `FindingLocation`), `findings.engine` check, assessment reconcile reuse, remediation verify path.
- **Arch:** eco rule = pure function `(PageMeasurement[], config) → RawFinding[]`; new authority `measured` (passes only if measurement ran for all configured routes with `loadedCleanly`; otherwise `unable_to_verify`; **never passes the whole criterion from a proxy — proxy criteria are `heuristic`-like: findings ⇒ `needs_review`/`failed`, absence ⇒ `unable_to_verify` unless the criterion is wholly objective**); new `FindingLocation.kind = "page"` `{url, metricId, observed, threshold?}`; new analyzer `measurement` → engine bucket `measurement`; **extract** the shared "evaluate → reconcile findings" seam from `runAssessment` _now_ that two domains need it (the single justified abstraction); verification = re-measure the same route+conditions and compare to the finding's threshold (deterministic) or manual attestation with note.
- **DB (ask first, `0007`):** replace `findings_engine_check` to include `'measurement'`; no table changes.
- **API/UI:** eco findings appear in the existing findings list/finding page (engine filter extended); finding page shows metric, observed vs threshold, conditions, how to re-measure; remediation = guidance + manual implement + re-measure verify (reuses runtime flow shape).
- **Deps:** Phases 1, 2. **Risks:** over-claiming automation (default every proxy to non-passing); noisy thresholds ⇒ alert fatigue; finding fingerprinting for measurement findings (key = control+route+metric).
- **Not yet:** score, baselines, PR checks.

### Phase 4 — Historical monitoring

- **Obj:** Show trends per route/metric and per-domain history.
- **Areas:** reporting loaders (`server/reporting/`), dashboard, eco page, rollups.
- **Arch:** series queries over `measurements` bounded in SQL (`FINDINGS_LIST_LOAD_LIMIT` pattern); comparability rule (same conditions + engine major); optional daily rollup table only after measured query cost; `complyloop-eco/v1` **score** computed here (versioned, displayed with its inputs); unified product view (compliance % status-based + score + open findings + regressions) per domain.
- **DB:** possibly `measurement_rollups` (only if needed; justify with query timings). **API:** loaders only. **UI:** sparkline/trend table (follow `ui-conventions.mdc`, accessible charts with text alternative/table).
- **Deps:** 2 (3 for findings). **Risks:** presenting non-comparable points; implying score = compliance. **Not yet:** forecasting, org-level benchmarking, `pages` table.

### Phase 5 — Regression detection

- **Obj:** Detect and alert on metric regressions vs baseline with explicit thresholds.
- **Arch:** baseline resolver + threshold config (project/org level, versioned, stored in project payload jsonb `ecoBudgets`), noise band from historical variance, finding + `Alert` (`AlertKind` += `measurement_regression`), evidence `detail.event = "measurement_regression"`.
- **DB:** none or `0008` if thresholds need querying. **UI:** budgets form in Settings; regression list on dashboard. **Deps:** 2, 3, 4. **Risks:** false positives from third-party variance; threshold sprawl. **Not yet:** auto-tuned thresholds, ML anomaly detection.

### Phase 6 — Developer / CI integration (**gated by D-CI**)

- **Obj:** Preview/PR analysis with baseline comparison and a CI status.
- **Arch:** per B6. Resolve preview via `deployment_status`; `trigger=ci`; non-authoritative persistence; `CiResult` derivation; GitHub Checks write; same engines as manual runs.
- **DB:** job trigger enum (`CHECK` migration) + `ci_results` (or evidence-only if enough). **API:** webhook events `pull_request`, `deployment_status`; GitHub App permission `checks: write`. **UI:** PR result history on project page. **Deps:** 5; `TODO.md` P0 (runtime↔commit tie). **Risks:** reversing a recorded decision; noisy PR checks; preview auth; abuse/cost (rate limits). **Not yet:** PR comments with fix suggestions, auto-merge blocks beyond user-set budgets.

### Phase 7 — Performance

- **Obj:** Core Web Vitals / loading / runtime metrics as a third domain on the same infra.
- **Arch:** new `Framework(domain: performance)` (measurement framework, not regulation), new metric ids in the same `measurements` table, lab-vs-field separation (field data only if connected; label as such), repeated runs + median to tame variance. **Rule:** if this phase needs a new table or a second assessment path, the shared seam from Phase 3 was wrong — fix the seam first.
- **Not yet:** RUM collection agent, synthetic multi-location runs.

### Phase 8 — Security

- **Obj:** Headers/config/dependency checks (passive only).
- **Arch:** passive HTTP header/TLS/cookie flags checks reuse measurement run (response headers already observable); dependency checks as a separate source-engine (lockfile/OSV) — reconsider whether it belongs in this product. **Must not** drive earlier decisions. **Not yet:** active scanning/exploitation (legal exposure), anything that requires target-owner authorization flow.

---

# Part D — Architecture TODO, global TODO, risks

## D1. Architectural TODO (domain-agnostic readiness)

**1. Critical blockers (Phase 0)** — B1, B2, B3, B4, B5 (Part A3). Plus: add a regression test "project with no stored preset assesses exactly RGAA-full" _before_ changing scope code.
**2. Important (Phases 1–3)** — report model/labels framework-driven; domain-aware `Alert`/dashboard counters; job `domain` + skip-checkout path (B6); `findings.engine` + `FindingLocation.page` + `measured` authority (B7, B8); shared "evaluate→reconcile" seam extraction; verification strategy per domain (re-audit vs re-measure vs source merge).
**3. Optional / later** — `pages` table; rollups; `Domain` plugin interface (only after Phase 3 duplication is visible); moving catalog to DB (not needed); org-level budgets; multi-product grouping above `Project`.

## D2. Global product TODO (for the executing agent)

```
P0 — Domain-aware scoping & catalog (Phase 0)
Why: Adding RGESN today would silently change scope for every existing project (undefined preset ⇒ whole catalog) and a non-a11y assessment would corrupt a11y change detection (domain-blind latestAssessmentFor).
Scope: Framework.domain; Project.presetIds with read-time fallback; remove "whole catalog" path; Assessment.domain + latestAssessmentFor(domain); framework-aggregated catalog; themes next to standards; regression test pinning current RGAA scope. No behavior change for a11y.

P0 — Record decisions & fix doc drift
Why: The direction contradicts a recorded permanent decision (no PR checks) and docs reference missing files.
Scope: Part D3 decision log in docs; amend architecture.md decision paragraph with a dated "direction change pending (Phase 6, D-CI)"; fix dead links; update vision docs and cursor rules (Tasks 1–6).

P1 — RGESN catalog + manual assessment (Phase 1)
Why: Fastest eco value; proves the shared model on a second standard without a new engine.
Scope: licence check; rgesn framework/controls/themes/guidance; domain-aware requirements/settings/reports UI; no scores.

P1 — Measurement engine + append-only history (Phase 2)
Why: Everything eco-quantitative (checks, trends, regressions, CI) depends on stored, versioned, condition-tagged measurements.
Scope: measurePage contract; runMeasurement path without checkout; measurements table (insert-only); job domain + stage; minimal per-route table.

P1 — Measurement-based RGESN checks (Phase 3)
Why: Closes measure→finding→remediate→re-measure→verify for eco.
Scope: measured authority; page location; engine bucket migration; rule functions; re-measure verification; extract shared reconcile seam.

P2 — Trends, ComplyLoop eco score, regressions (Phases 4–5)
Why: Continuous monitoring is the differentiator; scores/regressions need history first.
Scope: bounded series queries; versioned score; budgets/baselines; alerts. Score never feeds status.

P2 — CI/PR integration (Phase 6, requires D-CI approval)
Why: Developer workflow differentiator.
Scope: deployment_status/pull_request events; non-authoritative CI persistence; CiResult; Checks write.

P3 — Performance, then Security (Phases 7–8)
Why: Reuse of the shared infra; must not drive current design.
Scope: new Framework + metrics on existing tables; passive security checks only.
```

## D3. Decision log (add to `platform-direction.md`)

| ID        | Decision                                                                                                                                                                     | Status                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| D-Project | `Project` stays the unit ("digital product" in UI copy later); no new `DigitalProduct` entity until multi-repo/multi-URL products are a real need                            | Proposed                      |
| D-Domain  | Domain = field on `Framework`; no plugin framework                                                                                                                           | Proposed                      |
| D-Preset  | Replace single `defaultPresetId` with `presetIds[]`                                                                                                                          | Proposed — Phase 0            |
| D-Measure | Measurements are a separate append-only store; never folded into evidence `detail` as the primary store                                                                      | Proposed                      |
| D-Score   | ComplyLoop-owned, versioned score; EcoIndex optional/off by default; score ≠ status                                                                                          | Proposed                      |
| D-CI      | **Supersedes the Sep 2026 "no per-PR Check Runs" decision** — requires explicit owner approval before Phase 6; until then the decision stands                                | **Open — owner must decide**  |
| D-Licence | RGESN 2024 text: Licence Ouverte 2.0 — reuse OK with attribution (**resolved**, owner-confirmed). EcoIndex constants/LCA data: still require licence review before inclusion | RGESN resolved; EcoIndex open |

## D4. Architecture / Product Risks (Task 4 writes this section, answering each question from PROMPT §7)

1. **Is the shared model right for all four domains?** For _requirement → assessment → finding → evidence → monitoring_: yes for a11y and the reference-framework part of eco. It **strains** where the primary artifact is a continuous number (performance, resource weight): there the natural object is a _measurement series with budgets_, and "requirement status" is a thin wrapper. Hence Measurement is a first-class, separate concept; status is derived from budgets/rules, not the other way round. Security (passive) fits poorly with "remediation = code change" (often infra/config) — verification may be re-fetch of headers (deterministic) but ownership of the fix is outside the repo.
2. **Where does it break?** (a) `FindingKind violation|warning` assumes a hard-fail notion; metrics have gradients. (b) Source-location–centric remediation (patch/PR) doesn't apply to measurements. (c) Sticky human decisions re-arm on "newer violation" — for metrics, "newer" must mean newer _regression beyond the decided baseline_, define before Phase 5. (d) Requirement uniqueness per (project, control) loses per-route granularity — per-route detail lives in findings/measurements, not requirements.
3. **Accessibility-specific concepts (keep in a11y):** AST/jsx-a11y, axe, html-validate, `runtime_only`/`site_level` authorities, applicability probes, ARIA models, RGAA pertinence twins, JSX auto-fix `ProposedFix`, source-file snapshot change detection. **Shared:** statuses, sticky decisions, evidence, remediation lifecycle names, severity/confidence, job queue.
4. **Is RGESN automatable?** Only partly, and less than RGAA. Most criteria are strategy/specification/process/hosting/content questions that no page measurement can answer. Expect a small automatable minority with proxies, and a long tail of manual attestations. The product value for the majority is _structured self-assessment + evidence + history_, not scanning. State this plainly in-product; do not compute a "% RGESN compliant" from proxies.
5. **Which measurements are deterministic?** Given fixed conditions: byte counts, request counts, DOM node counts, header presence — deterministic up to third-party/content/A-B variance. Time-based (LCP, TBT, load time) are not (CI runner noise). Energy/CO₂ are modelled, not measured.
6. **Where is human assessment required?** Any criterion about intent, process, content relevance, hosting contracts, UX alternatives, data minimisation decisions.
7. **Uncertain measurements:** store `conditions`, `engine@version`, and (Phase 2+) `repeatCount` / `stdev` when repeated; mark comparisons "inconclusive" inside the noise band; a failed/partial load is `unable_to_verify`, never a zero or a pass; `loadedCleanly` semantics reused.
8. **Use EcoIndex directly?** No as core. Reasons: published as non-commercial/no-derivatives per its own site (verify), LCA values not freely licensed, package licences inconsistent across ports, service dependency risk, and it collapses three metrics into one opaque grade. Allow an optional adapter later _only after_ licence confirmation; show it as a labelled external indicator.
9. **Licensing/commercialisation risk:** high for EcoIndex constants/API; medium for RGESN text (open licence claimed for earlier editions — confirm for 2024); ComplyLoop itself is all-rights-reserved (LICENSE) — mixing in CC-BY-NC-ND or AGPL code/data would contaminate distribution. Rule: no third-party scoring code/data in the repo without a recorded licence review.
10. **Own environmental score?** Yes, but modestly: `complyloop-eco/v1` = documented function of structural metrics vs budgets; no CO₂ claims; versioned; recompute on version change without rewriting measurements.
11. **Scores vs compliance status:** status answers "does the requirement hold?" (evidence-backed, human-or-deterministic); score answers "how heavy/efficient relative to a model?". Never derive, gate or colour one from the other; UI shows both with distinct labels.
12. **Requirement not automatically verifiable:** `unable_to_verify` + manual attestation path (`humanPass` with note) + exception path (existing). Never inferred pass. Distinguish in the model/UI: `not_applicable` (explicit exception or confirmed fact) vs "not assessed" (no assessment ran for that domain — absence of requirement row/assessment, show as such, don't conflate with `unable_to_verify`).
13. **Evidence storage:** append-only evidence rows (existing) reference immutable measurement rows; summarized resource lists inline; no raw HAR/screenshots in v1 (size, PII, third-party content); if later needed, object storage with content hash in evidence `detail`.
14. **Comparing history:** only series with identical `conditions` and engine major; engine upgrades start a new comparability epoch (recorded as evidence), optionally with a dual-run overlap period.
15. **Source of truth:** code + DB for facts (measurements, findings, statuses, evidence); catalog files for standard text (versioned, attributed); docs describe intent only; scores are derived caches. Doc drift found in this audit (A2) is the reason for the first rule.

---

# Part E — Executable tasks (documentation deliverables)

> All edits are documentation. Do not modify source code. Commit after each task using the repo's conventional style (`docs: …`) and the attribution trailer required by the session.

### Task 1: Product vision (spec + README + AGENTS framing)

**Files:**

- Modify: `docs/compliance-engineering-product-spec.md`
- Modify: `README.md` (first paragraph only)
- Modify: `AGENTS.md` ("What this is" section only)
- Modify: `.cursor/rules/product-context.mdc` ("Current product" line)

**Interfaces:** Produces the canonical wording of the vision reused by Tasks 2–3.

- [ ] **Step 1:** In the spec, replace "What this is" with: ComplyLoop is evolving from an accessibility compliance engineering tool into a **continuous compliance and quality engineering platform for digital products**. Keep the "Not a GRC dashboard…" paragraph. Add subsection **Direction (Oct 2026)** with the domain tree from `PROMPT.md` (Accessibility RGAA/WCAG · Eco-design RGESN · Performance · Security) and one sentence: _shared assessment and verification platform, not four scanners_. Add the unified-view example (per-domain % + open findings + regressions) labelled **target, not current**.
- [ ] **Step 2:** In the spec "Scope", split into **Current (shipped)**: React/Next.js/TS, RGAA/WCAG, orgs; and **Planned (phased)**: link to `docs/ai/platform-direction.md` (do not restate phases). Update "Current state" date line only if facts changed.
- [ ] **Step 3:** README intro: keep the accurate first paragraph (it describes shipped behavior); append one sentence + link: "Direction: continuous compliance & quality across accessibility, eco-design, performance and security — see `docs/ai/platform-direction.md`."
- [ ] **Step 4:** `AGENTS.md` "What this is": same one-sentence direction + link; do not duplicate lists. `product-context.mdc`: change "Current product: accessibility compliance…" to "Current product: accessibility (RGAA/WCAG). Direction: multi-domain — see platform-direction.md. The core loop is domain-neutral."
- [ ] **Step 5:** `npx prettier --check docs/compliance-engineering-product-spec.md README.md AGENTS.md` → expect no diffs; fix if any.
- [ ] **Step 6:** Commit: `git add docs/compliance-engineering-product-spec.md README.md AGENTS.md .cursor/rules/product-context.mdc && git commit -m "docs: state multi-domain product direction"`.

### Task 2: Domain & standards model + assessment mapping in architecture

**Files:**

- Modify: `docs/ai/architecture.md` (add two sections after "Modules", add "Architecture gaps" before "Invariants")
- Modify: `.cursor/rules/domain-model.mdc` (vocabulary)

**Interfaces:** Consumes Part B1–B3, Part A3. Produces anchors `#domains-and-standards`, `#assessment-mapping`, `#architecture-gaps` referenced from `platform-direction.md`.

- [ ] **Step 1:** Add **"## Domains and standards"**: the four domains; table "shared platform vs domain-specific" from B2; the standards classification table from B3 (verbatim classes: legal/regulatory · technical standard · measurement framework · optional metric) including the verification-needed callouts and URLs found in Task 3 Step 1. State plainly: _this section describes direction; the code today implements only Accessibility._
- [ ] **Step 2:** Add **"## Assessment mapping"**: for each of Accessibility / Eco / Performance, the chain from PROMPT (Requirement → … → Monitoring) as a table with columns _stage · accessibility today (file) · eco target · what must evolve_. Fill accessibility column from Part A1 (e.g. Assessment = `runAssessment`; Verification = `remediation-verify-worker.ts`, `verifyRemediationOnResolve`). Mark each cell **exists / evolves / new**.
- [ ] **Step 3:** Add **"## Architecture gaps"**: the B1–B10 table (A3) trimmed to Blocker · Evidence · Phase that resolves it; link to `platform-direction.md#roadmap`.
- [ ] **Step 4:** Amend the existing "Decision (permanent, Sep 2026): no per-PR Check Runs" paragraph by appending: _"Oct 2026: product direction (PROMPT.md) plans CI/PR integration as Phase 6. This decision remains in force until the owner records D-CI in `docs/ai/platform-direction.md`."_ Do **not** delete the original text.
- [ ] **Step 5:** `domain-model.mdc`: add entities **Measurement**, **Score**, **Standard** classification, **Domain**; add rule bullets "Scores never set or colour status"; "Measurements carry conditions + engine version"; add to the status section a note distinguishing `not_applicable` / "not assessed" (no row) / `unable_to_verify`. Do not rename existing terms.
- [ ] **Step 6:** `npx prettier --check docs/ai/architecture.md` ; `rg -n "Domains and standards|Assessment mapping|Architecture gaps" docs/ai/architecture.md` → 3 matches.
- [ ] **Step 7:** Commit: `docs(architecture): domain model, assessment mapping, gaps`.

### Task 3: Create `docs/ai/platform-direction.md` (eco strategy, measurement, monitoring, CI/CD, roadmap, TODO)

**Files:**

- Create: `docs/ai/platform-direction.md`
- Modify: `docs/README.md` (index row)

**Interfaces:** Produces the single place for forward-looking strategy; anchors `#roadmap`, `#decision-log`, `#risks`.

- [ ] **Step 1 (verify facts first):** Open the primary sources and record URL + date checked in a "Sources" list at the bottom of the doc: official RGESN 2024 page (ecoresponsable.numerique.gouv.fr / Arcep), its reuse licence, the REEN-law reference, EcoIndex about/licence page and the repo `LICENSE`/LCA disclaimer. If any statement in B3/D4 cannot be confirmed, rewrite it as "unverified" in the doc. Use WebFetch/WebSearch; do not rely on this plan's secondary results.
- [ ] **Step 2:** Write sections in this order, condensing Part B/C/D of this plan (target ≤ 450 lines, no theoretical essays): 1 Purpose & status · 2 Principles (five separated concepts: measurement, requirement, finding, compliance status, score) · 3 Eco-design strategy (B4, incl. limitations) · 4 Monitoring model (B5) · 5 CI/CD (B6, gated) · 6 Roadmap (Part C; per phase: objective, why, areas, arch, DB, API, UI, deps, risks, not-yet) · 7 Architecture TODO (D1) · 8 Global TODO (D2, exact P0/P1/P2 format) · 9 Preserve list (B7) · 10 Risks & open questions (D4 + D3 decision log) · 11 Sources.
- [ ] **Step 3:** Add row to `docs/README.md` table: `[ai/platform-direction.md](./ai/platform-direction.md) | Engineers, agents & product | Direction, eco-design strategy, roadmap, risks`. Also remove the dead `ai/github-integration-audit.md` row.
- [ ] **Step 4:** `npx prettier --write docs/ai/platform-direction.md docs/README.md`; `rg -n "TBD|TODO:|implement later" docs/ai/platform-direction.md` → no matches.
- [ ] **Step 5:** Commit: `docs: add platform direction, eco-design strategy and roadmap`.

### Task 4: Risks section review pass

**Files:** Modify `docs/ai/platform-direction.md` (§10 only).

- [ ] **Step 1:** Check that §10 answers every question in `PROMPT.md` §7 (16 bullets) — tick each against D4 items 1–15; add any missing (e.g. "Is the shared model appropriate for all four domains?" ↔ D4.1).
- [ ] **Step 2:** Re-read each risk against the code for accuracy (e.g. confirm `findings_engine_check` text in `packages/db/src/schema.ts:231-234`, `scopedControlIds` in `project-scope.ts:19-27`, `latestAssessmentFor` call sites via `rg`). Fix any mismatch.
- [ ] **Step 3:** Commit: `docs: verify risks against code`.

### Task 5: Cursor rules / agent guidance alignment

**Files:**

- Modify: `.cursor/rules/analysis-engine.mdc` (scope line: "accessibility analysis engine; other domains' engines live in sibling folders and are not covered here")
- Modify: `packages/analysis-core/README.md` (first paragraph: still accessibility today; add "Planned: `measurement/` stage — see platform-direction.md" **only as a link, no placeholder directories**)

- [ ] **Step 1:** Apply the two edits; keep them to 1–3 lines each.
- [ ] **Step 2:** `npx prettier --check` both files; commit: `docs: scope analysis-engine rules to accessibility`.

### Task 6: Fix documentation drift found in the audit

**Files:**

- Modify: `AGENTS.md` (doc map row for `next-reco-todo.md` and the sentence "see next-reco-todo.md")
- Modify: `.github/workflows/assessment-worker.yml` (header comment only: remove "Check Runs")
- Modify: `TODO.md` (add pointer to `docs/ai/platform-direction.md` under its header; no item changes)

- [ ] **Step 1:** Remove the dead `next-reco-todo.md` references (file does not exist) — or, if the owner wants it, recreate separately; default is removal.
- [ ] **Step 2:** Edit the workflow header comment only; verify with `git diff -- .github/workflows/assessment-worker.yml` that only comment lines changed.
- [ ] **Step 3:** `rg -n "next-reco-todo|github-integration-audit" . --glob '!node_modules' --glob '!PROMPT.md' --glob '!docs/superpowers/**'` → no matches.
- [ ] **Step 4:** Commit: `docs: fix dead links and stale workflow comment`.

### Task 7: Final verification and handoff

- [ ] **Step 1:** `npx prettier --check "docs/**/*.md" AGENTS.md README.md TODO.md` → clean.
- [ ] **Step 2:** `npm run verify:gate` → passes unchanged (no code touched; confirms comment-only workflow edit and mdc edits didn't break anything).
- [ ] **Step 3:** Self-check against PROMPT §"Deliverables" (11 items): vision (Task 1) · architecture direction (2) · domain/standard model (2) · RGESN strategy (3 §3) · measurement strategy (3 §3) · monitoring (3 §4) · CI/CD (3 §5) · gaps (2) · risks/open questions (3 §10) · roadmap (3 §6) · global TODO (3 §8). Any missing → fix.
- [ ] **Step 4:** Decide the fate of `PROMPT.md` with the owner (keep as history, move to `docs/`, or delete). Default: leave in place, unreferenced.
- [ ] **Step 5:** Report to the owner: open decisions D-CI and D-Licence; ask which of Phase 0 / Phase 1 to plan in detail next (a **separate** TDD-level plan per phase, written when the phase starts, because Phase 0's exact type ripple is only known after the first `tsc` run).

---

## Self-review (done while writing)

- **Spec coverage:** PROMPT §1 audit → Part A; §2 docs → Tasks 1–3, 5–6; §3 roadmap (9 phases, 10 fields each) → Part C; §4 arch TODO → D1; §5 keep unchanged → B7; §6 global TODO → D2 (exact format); §7 risks → D4 (all 16 questions mapped); §8 constraints → Global Constraints; deliverables 1–11 → Task 7 step 3.
- **Deliberate deviations:** the TDD step format is used only for doc tasks (no code is allowed by the spec); per-phase code-level plans are deferred to phase start to avoid speculative detail. Phase order kept as in PROMPT; changes: measurements persisted from Phase 2 (history accrues early), Phase 4 holds UI/score, and the shared "evaluate→reconcile" seam is extracted at Phase 3 rather than Phase 0 (avoid speculative abstraction).
- **Placeholder scan:** no TBD/TODO placeholders; unverified external facts are explicitly routed to Task 3 Step 1 for primary-source confirmation.
- **Consistency:** names reused consistently — `Framework.domain`, `Project.presetIds`, `Assessment.domain`, `latestAssessmentFor(…, domain)`, `measurements`, `measurePage`, `measured` authority, `FindingLocation.kind="page"`, engine bucket `measurement`, `complyloop-eco/v1`, D-CI.
