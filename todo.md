## P2 — Core loop DX (assess → fix → verify in the PR)

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

### 12. Stop loading the whole tenant database into memory — DONE

- **What:** Every request `loadDbFromPostgres` selected **all** frameworks, projects, findings, and evidence JSONB payloads into a `Db` object, then filtered in process.
- **Why:** Evidence is append-only and unbounded. This will not survive a real org. It also makes Postgres constraints decorative — the app is still an in-memory store with a disk backup.
- **How (done):** Scoped loaders by org/project (`Db.loadScope`); workspace reads cap evidence; evidence UI/exports use SQL pagination/full project queries; persist prune is scope-aware so partial loads cannot wipe other tenants. See `docs/ai/architecture.md`.

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
- **Why:** Spec §8: continuous value is _noticing_ a regression after a PR. If nobody opens the dashboard, the loop dies.
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
4. ~~**Item 6 + 10** — first-run connect and assess.~~ Item 6 done; item 10 still P2.
5. **Item 7 + 8 + 9** — runtime coverage and PR-native fixes.
6. **Item 12** when evidence volume hurts; **16–19** only after the loop is honest.
