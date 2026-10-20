# Platform Direction — from accessibility to compliance engineering

> **Status: direction, not description.** The code today implements
> accessibility (RGAA/WCAG) end to end. Everything about eco-design,
> performance or security below is planned. Current behavior is documented in
> [`architecture.md`](./architecture.md) and asserted by the code — when this
> document and the code disagree about _what is shipped_, the code wins.
>
> Audience: engineers, agents, product.

## 1. Purpose

ComplyLoop is moving from an RGAA/WCAG tool to a **continuous compliance and
quality engineering platform for digital products**:

```text
Accessibility (RGAA, WCAG)  →  shipped
Eco-design (RGESN)          →  next
Performance (Core Web Vitals)  →  later
Security (passive config/deps) →  later
```

These are **not four scanners**. They are four domains plugged into one
platform loop:

```
Requirement → Assessment → Finding → Explanation → Remediation
→ Verification → Evidence → Monitoring
```

The loop is already domain-neutral in its contract layer. What is
accessibility-specific is the catalog, the scoping rules, the scan pipeline,
the finding vocabulary (check ids, analyzers, locations) and the UI copy. The
work below widens those seams without a rewrite and without a plugin
framework.

## 2. Principles — five separated concepts

| Concept                   | Answers                                                                                                          | Source of truth       | Deterministic                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------- |
| **Standard**              | Which reference document? (`legal/regulatory`, `technical standard`, `measurement framework`, `optional metric`) | Catalog (`Framework`) | n/a                                |
| **Domain**                | Which property of the product? `accessibility \| eco_design \| performance \| security`                          | `Framework.domain`    | n/a                                |
| **Control / Requirement** | Which obligation, and does it hold for this project?                                                             | Catalog + DB          | Yes (or sticky human decision)     |
| **Measurement**           | What value was observed, under which conditions?                                                                 | DB, append-only       | Yes, _given the conditions_        |
| **Score**                 | How does this project compare to a model?                                                                        | Derived, versioned    | Yes, but a model — never a verdict |

Rules that follow, and that every future domain must respect:

- `Measurement → (rule) → Finding → Requirement status`. A score branches off
  for display; it is **never** an input to status.
- A failed or partial measurement is `unable_to_verify`, never a zero and
  never a pass.
- `not_applicable`, "not assessed" (no requirement row / no assessment for
  that domain) and `unable_to_verify` (assessed, inconclusive) are three
  different things and must stay distinguishable in data and UI.
- AI explains and suggests; it never sets a status (unchanged rule).

## 3. Eco-design strategy (RGESN)

### 3.1 What RGESN is, precisely

The _Référentiel général d'écoconception de services numériques_ (RGESN) is the
French eco-design reference framework. The 2024 edition (version 2, published
28 May 2024) was defined by **Arcep and Arcom**, in connection with ADEME,
under the REEN law (loi n° 2021-1485). It is organised in nine families:
Stratégie, Spécifications, Architecture, UX/UI, Contenus, Frontend, Backend,
Hébergement, Algorithmie — each criterion carrying difficulty, priority,
target and the job roles concerned.

It is a **reference framework**, not a product requirement, and this document
does not assert which organisations are legally bound by it. Verify
applicability against the official source before writing product copy.

**Licence:** the dataset is published on data.gouv.fr under **Licence Ouverte
2.0 (Etalab)** — reuse is allowed, including commercially, with attribution.
Ship the attribution (source URL, edition, date of last update) in the catalog
and in exported reports. See §11.

### 3.2 Representation in the catalog

- One `Framework` (`fw-rgesn-2024`, `domain: "eco_design"`).
- One `Control` per criterion (`ctl-rgesn-<theme>-<n>`, `code: "RGESN <ref>"`),
  with no `secondaryCode` (that field is an RGAA↔WCAG cross-reference; it
  becomes optional in Phase 0).
- Themes come from the standard's own families — never invented.
- Presets: "Full RGESN", and "RGESN — priority criteria" if the standard's
  priority levels justify it.
- Automation is data, not a new type: `checkId: null` ⇒ manual. Add an
  explicit `automation` field only if that convention proves insufficient.

### 3.3 Automatable vs manual

RGESN is mostly strategy, specification, process, content and hosting
questions. Expect a **small automatable minority** and a long tail of manual
attestations. The product value for the majority is structured
self-assessment, evidence and history — state that plainly in-product rather
than implying a scanner covers the framework.

Only criteria with an objective, page-observable proxy get a check
(third-party count, heavy media, lazy loading, compression, caching headers,
autoplay, DOM size). Each decision is recorded next to the control as
`checkId` or `null` with a one-line rationale.

**A proxy never passes a whole criterion.** Proxy criteria use heuristic
semantics: findings ⇒ `needs_review`/`failed`; absence ⇒ `unable_to_verify`
unless the criterion is wholly objective.

### 3.4 Measurements (v1)

All browser-observable and structural, deterministic given conditions:

- transferred bytes (total, per resource type), request count;
- third-party request count and bytes;
- DOM node count, max depth;
- image count, uncompressed-format hints;
- compression / caching header presence per resource.

**Excluded from v1:** time-based metrics (LCP, TBT) — noisy on CI runners;
energy or CO₂ estimates — modelled, not measured.

One narrow, injectable contract in `packages/analysis-core/src/measurement/`:

```ts
measurePage(url, conditions) → PageMeasurement {
  metrics: Metric[];
  engine: { id: string; version: string };
  conditions: MeasurementConditions;
  failure?: string;
}
```

Implementations reuse the existing runtime navigation + SSRF guard
(`runtime/url-safety.ts`, `runtime/runtime-navigation.ts`). Store
`engine.id@version` on every row so an engine upgrade never rewrites history.
An external engine (EcoIndex-style) would be another implementation of the
same function — off by default.

### 3.5 Page identity and storage

Page identity is `(projectId, normalized route)` on the existing
`runtimeRoutes`; **no `pages` table in v1**.

`measurements` is append-only (same trigger pattern as evidence):
`(id, project_id, assessment_id, route, engine_id, engine_version, metric_id,
value, unit, conditions, git_sha, deployment_ref, measured_at, detail)`, with
an index on `(project_id, route, metric_id, measured_at desc)`.

Raw HAR is **not** stored (size, third-party content, PII). The summarized
resource list (origin, type, bytes) goes in `detail`.

### 3.6 Scoring

ComplyLoop computes its own **versioned** score (`complyloop-eco/v1`) from
documented structural inputs versus published budgets. It is displayed beside
requirement status, never instead of it. Do not call it "EcoIndex" and do not
reuse EcoIndex constants or LCA values without a licence review.

The compliance percentage shown in a unified view stays
`requirements passed / assessable requirements`. That is a different number
from the score, and must never be derived from it.

### 3.7 Limitations to state in-product

- one run = one device, network and cache condition;
- third parties, consent banners and A/B tests change page weight;
- authenticated pages are out of scope in v1;
- lab numbers are not real-world footprints;
- a measurement says nothing about compliance on its own.

## 4. Monitoring model

```
Project → Routes (runtimeRoutes) → Measurements (per run, route, metric)
        → Assessments (per domain) → Findings → History → Trends → Regressions
```

A page changes because of **code**, **content**, **third parties** or
**infrastructure**. Every measurement stores `git_sha`, `deployment_ref`,
`measured_at` and `conditions`, so a change is either attributable or flagged
as not tied to a commit. This reuses the commit-tied runtime audit work
already shipped (`Assessment.engines.runtimeTied`).

- **Trend** = ordered series for `(route, metric, conditions, engine major)`.
  Points with different conditions or a different engine major are not
  comparable and are never plotted as one line.
- **Regression** = delta versus a baseline (default: median of the last K
  successful default-branch/deployment runs) beyond
  `max(absoluteFloor, relativeThreshold, noiseBand)`. Thresholds are
  user/org configuration, versioned, never silently changed by the system.
  Output: a `warning` finding by default, `violation` only when a user-set
  hard budget is exceeded, plus an alert.
- **Unified view** = per domain: compliance % (status-based) + score (model)
  - open findings + regressions, computed by joins. No aggregate table until
    query timings justify one.

## 5. CI/CD (gated)

```text
PR opened / deployment_status=success ─▶ resolve preview URL + SHA
  ─▶ enqueue job (domain set, trigger=ci, baseline=default-branch ref)
  ─▶ worker measures (+ runtime a11y audit)
  ─▶ compare against baseline with thresholds
  ─▶ CI result {pass | warn | fail | unable} ─▶ GitHub Check Run + summary
```

- A PR scan is **non-authoritative**: it persists no requirement status and
  never auto-verifies. It persists only CI-scoped measurements/results tagged
  with the PR ref.
- Exit semantics: only user-configured hard budgets can `fail`; heuristic
  regressions `warn`; a failed measurement is `unable`, never `pass`.
- **Gate:** this reverses the recorded September 2026 decision _"no per-PR
  Check Runs"_ (see `architecture.md`). It stays blocked until the owner
  records **D-CI**. The path that does not reverse it: a CLI / GitHub Action
  that measures a URL and exits non-zero, with no Check Runs and no PR
  comments.

## 6. Roadmap

Ordered by dependency, not enthusiasm. Every phase ends green on
`npm run verify:gate`.

### Phase 0 — Domain-aware preparation (no new domain)

- **Objective:** make scoping, catalog and "latest assessment" domain-aware
  with zero behavior change for accessibility.
- **Why:** today `scopedControlIds` returns `undefined` (the whole catalog)
  when a project has no preset (`src/server/workspace/project-scope.ts:19`).
  The moment RGESN controls enter `shippedCatalog()`, every unset project
  silently starts assessing RGESN. `latestAssessmentFor` is also domain-blind
  (`src/core/assessment/assessment-helpers.ts:12`), so an eco run would
  become the "previous" assessment of the a11y change-detection path.
- **Areas:** `contract/project-types.ts` (ask first), `catalog/*`,
  `src/server/workspace/project-scope.ts`, `src/core/assessment/`,
  settings/requirements views.
- **Architecture:**
  1. `Framework.domain` (`accessibility` for RGAA/WCAG);
     `Control.secondaryCode` becomes optional.
  2. `Project.presetIds: string[]` replaces `defaultPresetId`, with a
     read-time fallback (`presetIds ?? [defaultPresetId ?? connectDefault]`).
     JSONB payload ⇒ no SQL migration; migrate on write.
  3. `controlsInScope` = union of enabled presets; remove the
     "undefined ⇒ whole catalog" path.
  4. `Assessment.domain` (defaults to `accessibility` on read) and
     `latestAssessmentFor(assessments, projectId, domain)`; update its three
     call sites.
  5. Framework-aggregated catalog; themes move next to each standard.
  6. Job payload gains `domain` (default `accessibility`).
- **DB:** none. **UI:** multi-preset settings (accessibility presets only).
- **Risk:** silent scope change for existing projects — pin it with a
  regression test _before_ touching the scope code: a project with no stored
  preset assesses exactly the RGAA full preset.
- **Not yet:** any RGESN data, `measurements`, new engine buckets.

### Phase 1 — RGESN catalog + manual assessment

- **Objective:** users enable RGESN, see its requirements, and assess criteria
  manually (pass / exception / N/A) with evidence.
- **Why:** delivers eco value with no new engine, and proves the shared model
  on a second standard.
- **Areas:** `catalog/rgesn/*`, requirements page, settings, reports copy.
- **Architecture:** `checkId: null` controls, guidance per control with
  attribution, domain tabs on Requirements, framework-driven report labels.
- **DB:** none (requirements rows are created by the existing refresh path).
- **Risk:** missing attribution; criteria granularity (some criteria have
  sub-checks); an `unable_to_verify` flood — show "not assessed" copy that
  explains it.
- **Not yet:** automated eco checks, measurements, scores, regressions.

### Phase 2 — Measurement engine + history

- **Objective:** measure configured routes and store results historically.
- **Why:** history accrues from the first run; everything quantitative
  depends on it.
- **Areas:** `analysis-core/src/measurement/`, `server/assessment/`, worker,
  `packages/db` (new `measurements` repo), job schema.
- **Architecture:** `measurePage` (§3.4); `runMeasurement` as a **separate**
  server function with **no checkout**; job `domain: "eco_design"`;
  new `measure` stage; deterministic conditions object; per-page failure
  containment (the existing `pageFailures` pattern).
- **DB (ask first, one migration):** the table in §3.5, insert-only.
- **API:** "Measure now" action; push enqueues an eco job when the domain is
  enabled; reads through a reporting loader.
- **UI:** minimal per-route latest-measurements table. No score, no verdicts.
- **Risks:** runner variance (structural metrics only), SSRF (reuse the
  guard), worker cost (reuse the route quota), consent banners, storage
  growth.

### Phase 3 — Measurement-based RGESN checks

- **Objective:** close `measure → finding → remediate → re-measure → verify`
  for eco-design.
- **Architecture:** rules are pure
  `(PageMeasurement[], config) → RawFinding[]`; new `measured` authority
  (passes only when a measurement ran for every configured route and loaded
  cleanly); `FindingLocation.kind = "page"` (url, metric, observed, threshold);
  engine bucket `measurement`; verification = re-measure the same route and
  conditions.
- **Extract now:** the shared "evaluate → reconcile findings" seam from
  `runAssessment`. This is the one justified abstraction — two domains need
  it.
- **DB (ask first):** extend `findings_engine_check` to include
  `measurement` (currently `["ast","runtime"]`,
  `packages/db/src/schema.ts:232`).
- **Risk:** over-claiming automation (default every proxy to non-passing);
  alert fatigue; fingerprinting measurement findings (control + route +
  metric).

### Phase 4 — Trends and score

- **Objective:** per-route trends, per-domain history, `complyloop-eco/v1`.
- **Architecture:** series queries bounded in SQL (the findings list pattern);
  comparability on `(conditions, engine major)`; score computed here, with
  its inputs visible.
- **DB:** rollups only if measured query cost requires them.
- **UI:** accessible charts with a text/table alternative.
- **Risk:** plotting incomparable points; implying score = compliance.

### Phase 5 — Regression detection

- **Objective:** detect and alert on metric regressions against explicit
  baselines.
- **Architecture:** baseline resolver + versioned thresholds in project
  payload (`ecoBudgets`); noise band from historical variance; finding + alert
  (`AlertKind += measurement_regression`); evidence
  `detail.event = "measurement_regression"`.
- **Dependencies:** Phases 2–4.
- **Risk:** third-party variance false positives; threshold sprawl.

### Phase 6 — CI/PR integration (**gated by D-CI**)

Per §5. Dependencies: Phase 5 plus the commit tie (shipped). Risks:
reversing a recorded decision, noisy checks, preview auth, cost/abuse.

### Phase 7 — Performance

- **Objective:** Core Web Vitals and loading metrics as a third domain.
- **Architecture:** new `Framework(domain: "performance")` (measurement
  framework, not regulation), new metric ids in the same `measurements` table,
  lab-vs-field separation, repeated runs + median to tame variance.
- **Rule:** if this phase needs a new table or a second assessment path, the
  Phase 3 seam was wrong — fix the seam first.
- **Not yet:** RUM collection, multi-location runs.

### Phase 8 — Security

- **Objective:** passive header/TLS/cookie checks and dependency signals.
- **Architecture:** reuse the measurement run (response headers are already
  observable); dependency checks as a separate source engine — reconsider
  whether they belong here at all.
- **Not yet:** active scanning or exploitation (legal exposure).

## 7. Architecture TODO

**Critical (Phase 0).** `Framework.domain`; `Project.presetIds`; remove the
whole-catalog fallback; `Assessment.domain` + domain-aware
`latestAssessmentFor`; framework-aggregated catalog; themes next to standards;
optional `secondaryCode`. Pin current RGAA scope with a test first.

**Important (Phases 1–3).** Framework-driven report labels; domain-aware
alerts and dashboard counters; job `domain` + checkout-skip path; engine
bucket `measurement`, `FindingLocation.page`, `measured` authority; shared
evaluate→reconcile seam; per-domain verification strategy (re-audit vs
re-measure vs source merge).

**Later.** `pages` table; rollups; a `Domain` interface (only once Phase 3
duplication is visible); moving the catalog to DB (not needed); org-level
budgets; grouping above `Project`.

## 8. Global TODO

```
P0 — Domain-aware scoping & catalog (Phase 0)
Why: adding RGESN today would silently change scope for every existing
project, and a non-a11y assessment would corrupt a11y change detection.
Scope: Framework.domain; Project.presetIds with read-time fallback; remove
"undefined ⇒ whole catalog"; Assessment.domain; framework-aggregated catalog.
No behavior change for accessibility. Test first.

P0 — Record decisions, fix doc drift
Why: TODO/CRITICAL-TODOS contradicted a recorded permanent decision and linked
missing files; the next agent wastes a cycle re-proposing rejected work.
Scope: this document + architecture decision log + dead links.

P1 — RGESN catalog + manual assessment (Phase 1)
P1 — Measurement engine + append-only history (Phase 2)
P1 — Measurement-based RGESN checks (Phase 3)
P2 — Trends, score, regressions (Phases 4–5)
P2 — CI/PR integration (Phase 6, requires D-CI)
P3 — Performance, then Security (Phases 7–8)
```

## 9. Preserve (do not "clean up" while widening)

Contract status model and `deriveRequirementStatus` precedence; sticky human
decision re-arm; append-only evidence (trigger + frozen kinds); the
`with*Write` model and per-project locks; stale-write guards; the job queue
(lease, heartbeat, idempotency, serial per project); authority-class
discipline and "an empty scan never passes"; the advisory-downgrade rule; AI
isolation (`src/ai` never imports `@/server`, never sets status); SSRF guard
and runtime navigation safety; compile-time catalog with presets; the
JSONB-payload + denormalized-column persistence pattern; tenant isolation;
`server-only` fences; GH Actions worker topology; the finding-page UX
contract; ComplyLoop's own accessibility.

## 10. Decisions and open questions

| ID        | Decision                                                                                                                                     | Status                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| D-Project | `Project` stays the unit; no `DigitalProduct` entity until multi-repo products are a real need                                               | Proposed                      |
| D-Domain  | Domain is a field on `Framework`; no plugin framework                                                                                        | Proposed                      |
| D-Preset  | Replace `defaultPresetId` with `presetIds[]`                                                                                                 | Proposed — Phase 0            |
| D-Measure | Measurements are a separate append-only store, never evidence `detail` as primary storage                                                    | Proposed                      |
| D-Score   | ComplyLoop-owned versioned score; EcoIndex optional/off; score ≠ status                                                                      | Proposed                      |
| D-CI      | **Supersedes the Sep 2026 "no per-PR Check Runs" decision.** Requires explicit owner approval before Phase 6; until then the decision stands | **Open**                      |
| D-Licence | RGESN 2024: Licence Ouverte 2.0, attribution required (verified). EcoIndex constants/LCA data: licence review required before any inclusion  | RGESN resolved, EcoIndex open |

Open questions that must be answered before their phase:

1. Is the shared model right for all four domains? (Yes for requirement →
   finding → evidence; it strains where the primary artifact is a continuous
   number — hence Measurement.)
2. What does "newer" mean for re-arming a sticky decision on a metric? Define
   before Phase 5: a newer regression beyond the decided baseline, not simply
   a newer measurement.
3. Does a proxy criterion ever deserve `passed`? Default: no.
4. Keep `PROMPT.md` as history, or delete it once this direction is recorded?

## 11. Sources

Checked 20 October 2026:

- RGESN 2024 (version 2, 28 May 2024), nine theme families —
  <https://ecoresponsable.numerique.gouv.fr/publications/referentiel-general-ecoconception/>
- RGESN dataset licence **Licence Ouverte 2.0**, publisher DINUM, last
  updated 2 September 2026 —
  <https://www.data.gouv.fr/datasets/referentiel-general-decoconception-de-services-numeriques>
- REEN law framing and Arcep/Arcom authorship — same official page as above
  (§ "La loi relative à la réduction de l'empreinte environnementale du
  numérique").
- EcoIndex — site, analysis rules and calculation published under
  **CC BY-NC-ND** — <https://github.com/cnumr/EcoIndex>
