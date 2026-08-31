# ComplyLoop — prioritized todo

Analyzed against `compliance-engineering-product-spec.md`, `docs/ai/architecture.md`, and the current codebase (including uncommitted requirements-intake work). Date: 2026-08-31.

Priority is **product risk**, not effort. P0 items can claim compliance without evidence. P1 ships the slice already in progress. P2–P3 strengthen the core loop. P4 is post-MVP.

---

## P0 — Correctness (never claim pass without evidence)

### 1. Stop false-passing axe-only controls when runtime did not run — DONE

- **What:** Ten modeled checks have axe mappings but **no AST implementation** and are **not** in `RUNTIME_ONLY_CHECK_IDS`: `table-headers`, `page-heading`, `content-region`, `label-in-name`, `lang-parts`, `aria-roledescription`, `presentation-role`, `no-auto-refresh`, `no-orientation-lock`, `landmark-unique`. With no findings, `deriveRequirementStatus` returns `passed`.
- **Why:** Spec principle *evidence over claims*. An AST-only assessment currently marks those requirements passed even though they were never evaluated. The existing six runtime-only checks (`color-contrast`, `document-title`, `bypass`, `landmark-one-main`, `nested-interactive`, `target-size`) already stay `unable_to_verify` — these ten should too.
- **How:** Add them to `RUNTIME_ONLY_CHECK_IDS` in `src/analysis/check-authority.ts`. Extend `assessment-status` tests so an AST-only run leaves them `unable_to_verify`, and a successful axe run can pass/fail them. Update architecture docs in the same change.
- **Done:** All sixteen axe-only checks are in `RUNTIME_ONLY_CHECK_IDS`; architecture/README counts updated.

### 2. Reports must name the project’s assessment target, not `frameworks[0]` — DONE

- **What:** `reportInputForProject` and the JSON export use `db.frameworks[0]`. Markdown report lines hardcode `- **RGAA:** ${control.secondaryCode}` even when the target is WCAG.
- **Why:** Users who set WCAG AA get an audit artifact that still looks like RGAA Full. Wrong framework on exported evidence breaks trust with auditors.
- **How:** Resolve framework from `project.assessmentPresetId` → `presetById` → `frameworkId`. Use `controlDisplayCodes` (same as the requirements page) for primary/secondary labels. Cover both RGAA and WCAG presets in `src/server/report.test.ts`.
- **Done:** `frameworkForProject` used by Markdown/HTML report input and JSON export; display codes swap for WCAG targets.
---

## P1 — Finish the current slice and keep docs honest

### 3. Land the in-flight requirements intake — DONE

- **What:** Uncommitted work replaces topical/import/custom intake with a single **framework + level** target (Full / AA / AAA), plus theme grouping on the assessed list (`control-theme.ts`, `AssessedRequirementList`).
- **Why:** Half-landed intake will confuse users and conflict with tests that already expect “no topical, import, or custom intake.” Finish one model before adding more.
- **How:** Complete the remaining wiring (`inScopeControlIds` + `assessmentPresetId` on connect and re-assess). Run `npm run lint && npm run typecheck && npm run test && npm run build`. Commit as one change with architecture + README updates (item 4).
- **Done:** Connect defaults to Full RGAA; intake panel sets target with toast; dashboard / findings / reports / JSON export filter to the active scope. Fresh DB only — no legacy project backfill.

### 4. Sync check counts in README and architecture — DONE

- **What:** README still says **18** AST checks. Architecture still says **21** AST + 6 runtime-only. The registry has **29** AST checks; axe maps ~60+ rules onto **16** additional check ids (6 declared runtime-only + 10 that currently false-pass — item 1).
- **Why:** Agents and humans plan from those docs. Stale counts hide coverage holes.
- **How:** After item 1, rewrite the “Analysis checks (current)” section in `docs/ai/architecture.md` and the assessment walkthrough in `README.md` as three lists: AST, runtime-only, composition-sensitive.
- **Done:** Architecture lists AST (29) / runtime-only (16) / composition-sensitive (8) plus intake model; README walkthrough matches.
### 5. Stop duplicating RGAA and WCAG controls under the same IDs

- **What:** `ctl-img-alt` (and every sibling) exists in both `rgaa/controls.ts` and `wcag/controls.ts`. `mergeAdapterControls` keys by id, so the second adapter never lands — WCAG is a display swap (`controlDisplayCodes`) over RGAA rows.
- **Why:** Fine as a temporary trick; it will break the next adapter (SOC 2, custom) and makes “framework-agnostic catalog” a lie in the database.
- **How:** One shared control catalog with `code` / `secondaryCode` plus `frameworkId` only on the **preset**, or distinct ids (`ctl-rgaa-img-alt` / `ctl-wcag-img-alt`) that share `checkId`. Prefer the first: presets own the framework, controls stay unique. Migrate seed merge accordingly.

### 6. GitHub App empty state needs an install path

- **What:** With the App configured, an empty repo picker says “Install the App on the repos you want to assess, then refresh” — no link, no `GITHUB_APP_SLUG` deep-link.
- **Why:** Production **requires** a GitHub App (`assertProductionGitHubApp`). First-run friction here kills the spec’s “connect a repo and get a useful result fast.”
- **How:** Add `GITHUB_APP_SLUG` (or full install URL) to env. Empty state: button to `https://github.com/apps/<slug>/installations/new`, then refetch. Document in `docs/deploy.md`.

---

## P2 — Core loop DX (assess → fix → verify in the PR)

### 7. Default runtime audit is only `/`

- **What:** If a preview URL is set and `runtimeRoutes` is empty, `runtimeRoutesFor` audits `["/"]` only. Routes are a manual textarea on Settings.
- **Why:** Contrast, skip links, landmarks, and the ten axe-only controls never see login/app routes. Composition-sensitive AST false positives stay the status truth on those pages.
- **How:** Keep manual routes as override. Add a conservative default: parse Next.js `app/` and `pages/` for static pathnames (no dynamic segments), cap at `ASSESSMENT_MAX_RUNTIME_PAGES`. Show “N routes discovered” on Settings. Do not crawl the live site (SSRF).

### 8. Check Runs should annotate failing files

- **What:** `postPullRequestCheckRun` posts a pass/fail summary with no `output.annotations`. Developers must leave GitHub and open ComplyLoop to see where.
- **Why:** Spec §9: PR → checks → see why, in the developer workflow.
- **How:** Map open source findings to Check Run annotations (`path`, `start_line`, `message`, cap 50). Link the assessment in the summary. Keep DOM findings in the summary text (no file path).

### 9. One PR per cluster, not only per finding

- **What:** `createPullRequestAction` is bound to a single finding. Dashboard already clusters by check + file/component (`clusterFindings`).
- **Why:** Spec §17: 47 failures from one `Button` should become one change, not 47 PRs.
- **How:** From a cluster card, open a PR that applies every **source** finding in that cluster with a structured fix (same `checkId` + file). Re-use `applyFix` + existing PR body template. Skip DOM findings (handoff only).

### 10. Guided first assessment (runtime URL before “all green”)

- **What:** Connect → empty dashboard → “Run assessment.” Runtime URL is buried in Settings. First run will pass axe-only controls as `unable_to_verify` (after item 1) with no explanation of what to do next.
- **Why:** Spec §25 success: first-time user sees clear pass/fail **and** understands unverifiable checks.
- **How:** After connect, a short checklist on the dashboard: (1) assessment target, (2) optional preview URL, (3) run assessment. When runtime-only counts are `unable_to_verify`, the empty/status copy must say “set a preview URL to assess these.”

### 11. CI package testdata lags the new AST checks

- **What:** `@complyloop/check` scans via `allChecks`, but `packages/check/testdata/Bad.tsx` still targets the older set. New checks (`pointer-gesture`, `error-suggestion`, …) have unit tests only.
- **Why:** The published CLI is the AST gate customers run in GitHub Actions. Fixture drift means we don’t know the CLI still fails on a realistic tree.
- **How:** Extend `Bad.tsx` (or add files) with one deliberate violation per new AST check. Assert `npx complyloop-check` exit 1 in the package README or a small script test.

---

## P3 — Spec differentiators (still inside accessibility MVP)

### 12. Stop loading the whole tenant database into memory

- **What:** Every request `loadDbFromPostgres` selects **all** frameworks, projects, findings, and evidence JSONB payloads into a `Db` object, then filters in process.
- **Why:** Evidence is append-only and unbounded. This will not survive a real org. It also makes Postgres constraints decorative — the app is still an in-memory store with a disk backup.
- **How:** Do not boil the ocean. First: scope loaders by `orgId` / `projectId` (workspace already knows both). Evidence and findings: paginated queries matching the UI. Keep JSONB payloads until a later normalized schema. Update `docs/ai/architecture.md` when the load shape changes.

### 13. Split engineering vs audit report views

- **What:** One Markdown/HTML export mixes findings, snippets, remediation, and the evidence trail. Spec §21 asks for two audiences from the same data.
- **Why:** Engineers want failing requirement + location + fix. Auditors want status, evidence, exceptions, timestamps — not 200 JSX snippets.
- **How:** Two export actions (or a `view=` query): **Engineering** (open findings, clusters, remediations) and **Audit** (requirement status table, determination, exceptions, verification evidence, no snippets). Reuse `ReportInput`.

### 14. Clustered remediation on the findings page, not only the dashboard

- **What:** `prioritizeClusters` is shown on the dashboard (top 5). Findings page is a flat prioritized list with bulk approve/dismiss.
- **Why:** The differentiator is “fix the shared component,” not a prettier table.
- **How:** Add a “By cause” tab on `/findings` using existing `FindingCluster`. Each cluster links to the shared file and (after item 9) “Open PR for cluster.”

### 15. Regression alerts leave the product

- **What:** Webhooks re-assess, evidence records `regression: true`, dashboard shows unread in-app alerts. No email, Slack, or GitHub issue.
- **Why:** Spec §8: continuous value is *noticing* a regression after a PR. If nobody opens the dashboard, the loop dies.
- **How:** MVP: post a Check Run annotation + optional GitHub issue/comment on the default branch when a previously `passed` requirement becomes `failed`. Email/Slack later. Do not invent a notification platform.

### 16. Manual RGAA criteria that AST/axe cannot score

- **What:** Catalog is the machine-checkable subset (~45 controls). Full RGAA 4 is much larger (captions quality, cognitive load, etc.). Human pass exists only for `checkId: null` controls, and the catalog currently has none seeded.
- **Why:** Teams still need a place to record human assessment + evidence for unauditable criteria without pretending the scanner covered them.
- **How:** Add a small set of `checkId: null` controls (start with 5–10 high-audit ones). Requirements UI already supports human pass / exception. Do not auto-pass them (already handled in `assessment-status.ts`).

---

## P4 — After the accessibility MVP loop is trustworthy

### 17. Custom / imported requirements

- **What:** Spec §6 step 1: bring requirements from an audit, customer, or checklist. Current intake (in-flight) **removed** import and custom controls on purpose.
- **Why:** Right call until presets are solid. Needed before agencies/multi-client (spec secondary customer).
- **How:** Reintroduce as a **third intake path** on the same page: paste/CSV → `checkId: null` controls on a `fw-custom` framework. Do not mix into RGAA presets. Restore, don’t invent a new model.

### 18. More connectors and frameworks

- **What:** GitHub-only (`ProjectSource = "github"`). Adapters are RGAA/WCAG only.
- **Why:** Spec long-term: SOC 2, ISO 27001, EU CRA, EAA. Not the MVP.
- **How:** After item 5 (unique controls), a new adapter is `src/adapters/<name>/` + registry entry. Next connector: GitLab or a zip upload — only when a customer needs it.

### 19. Counsel-reviewed legal + billing

- **What:** `/legal/privacy` and `/legal/terms` are labeled drafts. No billing.
- **Why:** Blockers for paid orgs, not for proving the loop.
- **How:** Replace drafts with counsel copy before charging. Billing: pick a provider when you have a price, not before.

---

## Suggested order of work

1. ~~**Item 1** (false pass)~~ — done.
2. ~~**Item 3 + 4** — finish intake, tell the truth in docs.~~ — done.
3. ~~**Item 2** — reports match the chosen target.~~ — done.
4. **Item 6 + 10** — first-run connect and assess.
5. **Item 7 + 8 + 9** — runtime coverage and PR-native fixes.
6. **Item 12** when evidence volume hurts; **16–19** only after the loop is honest.
