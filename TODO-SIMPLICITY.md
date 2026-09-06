# ComplyLoop — Simplicity TODO

Audit date: 2026-09-06 · Scope: entire repo, application + packages + docs.
Constraint: no application code was changed. This file is the only deliverable.

## How this was judged

Every abstraction was asked: **can we get the same result with less code, fewer concepts, fewer dependencies, or fewer moving parts — without losing correctness, accessibility, security, performance, or maintainability?**

The product loop (Requirement → Assessment → Finding → Remediation → Verification → Evidence) is not the problem. The tax is leftover store-shaped persistence, speculative framework-agnostic packaging, and file-level over-splitting.

This is not a broken codebase. Status derivation, check authority, append-only evidence, advisory locks, and stale-write guards are load-bearing. Those stay. The findings below are places where the _mechanism_ is heavier than the _invariant_.

---

## Verdict

The single complexity that infects the most code is the **in-memory `Db` blob**: load collections into arrays, mutate them in place, deep-clone a “before” snapshot, then persist a `JSON.stringify` diff. That pattern is a document-store leftover sitting on Postgres. It is why writes need scopes, two persist functions, key-order mapper tests, and `structuredClone` landmines.

After that: a **183-line domain package**, a **catalog copied into Postgres**, and a **FrameworkAdapter registry for one shared catalog**. None of those earn their packaging cost at current product scope (RGAA/WCAG, one agency, GitHub only).

Do not flatten the analysis engines, merge the two report renderers, or move jobs off Postgres. Those would add concepts, not remove them.

---

## P0 — Critical

## P1 — High

### 3. ~~`@complyloop/domain` is a workspace package for 183 lines of types~~ **Done (2026-09-06)**

Product types live in `@complyloop/analysis-core/contract/` (`project-types.ts`, `preset.ts`, `assessment-jobs.ts`). The `packages/domain` workspace, `build:domain`, and eslint special-case are removed.

### 4. `FrameworkAdapter` registry for one catalog and an empty WCAG adapter

- **What is unnecessarily complex:** `FrameworkAdapter` models “register a framework with controls + presets + guidance.” RGAA owns the catalog. WCAG registers `controls: []` and only presets. `guidanceFor` walks adapters until one implements it. Architecture docs and the product spec both say a second framework adapter is **out of scope**; the domain is kept agnostic “so one could be added later.”
- **Why the complexity is a problem:** Speculative architecture. Callers go through `allFrameworkPresets` / `presetById` / `defaultConnectPreset` / `guidanceFor` instead of “here are the presets, here is the catalog.” The empty WCAG adapter and the merge loop exist to look like a plugin system.
- **How it could be simplified:** One catalog module, one presets module (RGAA + WCAG lists), one `guidanceFor(checkId)`. `presetById` is `PRESETS.find(...)`. Delete `FrameworkAdapter`, the `frameworkAdapters` array, and the “add `packages/adapters/src/<name>/`” story until a second _catalog_ exists. WCAG as a **preset over the same controls** is the actual product; keep that, drop the plugin interface.
- **Files:** `packages/adapters/src/types.ts`, `packages/adapters/src/registry.ts`, `packages/adapters/src/wcag/controls.ts`, `packages/adapters/src/wcag/presets.ts`, `docs/ai/architecture.md` (“Adding a framework”).

### 5. `inScopeControlIds` is a second, usually-dead copy of the preset

- **What is unnecessarily complex:** Connect and Settings write both `defaultPresetId` and `inScopeControlIds` (a snapshot of `preset.controlIds`). Assessment scope prefers the **live** preset membership and only reads `inScopeControlIds` when no preset is set. Connect always sets a preset. So the stored id list is unused on the path that matters, and can drift from the live preset.
- **Why the complexity is a problem:** Two fields for one idea (“which controls does this project assess?”). Writers must keep them in sync; readers must know which one wins. The snapshot does not freeze assessment scope — the comment on `scopedControlIds` says the live preset is intentional.
- **How it could be simplified:** Store `defaultPresetId` only. Resolve scope with `presetById(id).controlIds`. Drop `inScopeControlIds` from `Project` and stop copying arrays on connect/preset change. If a future “custom subset” is needed, add it then — not now.
- **Files:** `packages/domain/src/project-types.ts`, `src/server/assessment-status.ts` (`scopedControlIds`), `src/server/project-preset.ts`, `src/server/connect-github.ts`, `src/server/actions/project-preset.ts`.

---

## P2 — Medium

### 6. Assessment is split across too many modules for one use case

- **What is unnecessarily complex:** The assessment use case is `assessment.ts`, `assessment-engines.ts` (43 lines), `assessment-findings.ts`, `assessment-helpers.ts`, `assessment-status.ts`, `assessment-jobs.ts`, `assessment-job-drain.ts`, `assessment-worker.ts`, plus `actions/assessment.ts`. `buildAssessmentEngines` is a single mapper. Job status/trigger parsers still hand-roll linear scans of 5- and 2-element unions.
- **Why the complexity is a problem:** Eight files and eight names for “run a scan and persist.” The split is past the point of single responsibility and into “one concept per file.” Navigating a bug means hopping the graph.
- **How it could be simplified:** Fold `assessment-engines.ts` into `assessment.ts`. Keep worker / jobs / drain as the async boundary (that split is real). Merge `assessment-helpers.ts` into `assessment-findings.ts` unless a second caller appears. Implement `parseJobStatus` / `parseJobTrigger` with a `Set` (or a one-liner type guard) on the imported consts — no aliases.
- **Files:** `src/server/assessment.ts`, `src/server/assessment-engines.ts`, `src/server/assessment-findings.ts`, `src/server/assessment-helpers.ts`, `src/server/assessment-status.ts`, `src/server/assessment-jobs.ts`, `src/server/assessment-job-drain.ts`, `src/server/assessment-worker.ts`, `src/server/actions/assessment.ts`.

### 7. Connect is five modules plus a one-off error class

- **What is unnecessarily complex:** GitHub connect is `connect-github.ts`, `connect-shared.ts`, `connect-active.ts`, `connect-policy.ts` (16 lines wrapping `roleHasPermission`), `connect-error.ts` (`ConnectError extends PublicError` with code `"connect"`), plus `actions/connect.ts`. `setActiveProject` is a visibility check, not connect.
- **Why the complexity is a problem:** Five files to clone a repo and insert a project. `ConnectError` vs `PublicError("…", "connect")` is a second error type with no extra behavior.
- **How it could be simplified:** One `connect-github.ts` (clone + record + name helpers) and the action. Inline `userCanConnectProjects` next to RBAC or `project-capabilities`. Throw `PublicError`. Move `setActiveProject` next to cookies / visibility.
- **Files:** `src/server/connect-github.ts`, `src/server/connect-shared.ts`, `src/server/connect-active.ts`, `src/server/connect-policy.ts`, `src/server/connect-error.ts`, `src/server/actions/connect.ts`.

### 8. Optional AI is a pipeline of many small files

- **What is unnecessarily complex:** AI is `src/ai/` (`ai-call.ts`, `explainer.ts`, `remediation.ts`, `fix-propose.ts`, `verified-fix.ts`, `schemas.ts` = one `z.enum`, `model.ts`, `warn.ts`) plus server `ai-fix-run.ts`, `ai-fix-persist.ts`, `ai-fix-result.ts`, `actions/ai-fix.ts`, `actions/remediation-ai.ts`. `proposeFixEdits` duplicates the `generateObject` + warn shell that `aiCall` already provides, because it must throw instead of returning null — that difference is one parameter, not a second module family.
- **Why the complexity is a problem:** Explain / suggest / patch are three features, not twelve concepts. New work means guessing which `ai-fix-*` file owns the next line.
- **How it could be simplified:** Keep three feature modules (explain, suggest, patch) and one `aiCall` that accepts `{ onFailure: "null" | "throw" }`. Collapse `ai-fix-run` + `ai-fix-persist` + `ai-fix-result` into the patch action (or one `ai-fix.ts`). Leave `verified-fix.ts` if the verify-before-suggest invariant needs a name.
- **Files:** `src/ai/*`, `src/server/ai-fix-run.ts`, `src/server/ai-fix-persist.ts`, `src/server/ai-fix-result.ts`, `src/server/actions/ai-fix.ts`, `src/server/actions/remediation-ai.ts`.

### 9. `PresetCatalog` port is ceremony around one fallback

- **What is unnecessarily complex:** `src/core` must not import adapters, so `projectDefaultPresetId(project, catalog)` takes a `PresetCatalog` `{ isValidPresetId, defaultConnectPresetId }`. Adapters export a matching object. Core re-exports the type from domain.
- **Why the complexity is a problem:** Three modules (domain port, core helper, adapter implementation) for “use the stored preset id if it exists, else `preset-rgaa-full`.” Validity is already `presetById(id) !== undefined` at the server boundary.
- **How it could be simplified:** Resolve the preset in server/adapter code (`presetById(project.defaultPresetId) ?? defaultConnectPreset()`). Delete `PresetCatalog`, `src/core/project-preset.ts`, and the domain `preset.ts` file. Core does not need this helper.
- **Files:** `packages/domain/src/preset.ts`, `src/core/project-preset.ts`, `packages/adapters/src/registry.ts` (`presetCatalog`).

### 10. Product types live inside the scanner package

- **What is unnecessarily complex:** `Finding`, `Remediation`, `Assessment`, `EvidenceRecord`, `Alert`, and `PublicError` live in `packages/analysis-core/src/contract/`. Domain and the app import product entities from the analysis package. `RawFinding` (scan output) vs `Finding` (persisted) is a real split; stuffing the product aggregate into the scanner is not.
- **Why the complexity is a problem:** Dependency arrow is inverted: persistence and UI depend on a scan library for `Organization`-adjacent types like evidence and alerts. `PublicError` is an HTTP/UI concern inside analysis-core so eslint can allow `src/core` to import it.
- **How it could be simplified:** Keep `RawFinding`, `CheckId`, location, and requirement-status derivation in analysis-core (the CLI needs those). Move persisted `Finding` / `Remediation` / `EvidenceRecord` / `PublicError` next to the collapsed domain types (item 3). analysis-core continues to emit `RawFinding`; the server maps into `Finding`.
- **Files:** `packages/analysis-core/src/contract/*`, `packages/analysis-core/src/types.ts`, `packages/analysis-core/src/contract/public-error.ts`.

### 11. `getWorkspace()` hydrates a full project document for every page

- **What is unnecessarily complex:** `getWorkspace()` always loads catalog + orgs + the active project’s requirements, findings, remediations, alerts, latest assessment, and an evidence window into `Db` arrays. Findings and dashboard pages then filter/paginate **in memory**. Evidence list/export already query Postgres directly (`postgres-queries.ts`) — two read styles.
- **Why the complexity is a problem:** Pages that need a count or a page of findings still think in “the whole store.” Combined with P0, reads and writes share the blob mental model. At agency scale this is probably fast enough; it is still more moving parts than “this page runs this query.”
- **How it could be simplified:** After P0, stop assembling a `Db` for mutations. For reads, keep a small workspace context (viewer, org, project, capabilities) and let pages load what they render — the evidence page is the template. Do not introduce a query-builder framework; a few functions in `postgres-queries.ts` / `repo/*` are enough. Do **not** add Redis or a read-model service.
- **Files:** `src/server/workspace.ts`, `packages/db/src/workspace-load.ts`, `src/app/(app)/findings/page.tsx`, `src/app/(app)/dashboard/page.tsx`, `packages/db/src/postgres-queries.ts`.

### 12. Report loading is three entry modules

- **What is unnecessarily complex:** `report.ts` (scope + re-exports markdown builders), `report-load.ts` (HTTP context), `report-model.ts` (IR), then `report-markdown.ts` and `report-html/*`. `frameworkForProject` / `reportInputForProject` are thin wrappers over assessment-status + visibility helpers.
- **Why the complexity is a problem:** Three names for “build the export input.” The IR + two renderers are justified (different escaping). The extra facades are not.
- **How it could be simplified:** Keep `report-model.ts` + the two renderers. Fold `report.ts` + `report-load.ts` into one `loadReportInput(request)` used by the export routes.
- **Files:** `src/server/report.ts`, `src/server/report-load.ts`, `src/server/report-model.ts`, `src/app/(app)/evidence/report/**`.

### 13. Display maps are split into many one-topic core files

- **What is unnecessarily complex:** Labels, badge descriptions, status tones, evidence tones, and evidence-kind / requirement-status URL helpers each have their own module + test. Same exhaustive-`Record` pattern repeated. `src/core` is 46 files / ~3.7k lines, many of them 20–80 line maps.
- **Why the complexity is a problem:** Not wrong — just more files than topics. Finding “what do we call `needs_review`?” means guessing among `labels.ts`, `badge-descriptions.ts`, and `status-tone.ts`.
- **How it could be simplified:** One `src/core/display.ts` (or `status-display.ts`) for label + description + tone of the canonical enums. Keep `finding-act.ts`, `rbac.ts`, `remediation.ts`, `finding-list-filter.ts` as behavior modules. URL helpers can sit next to the page that owns the query string, or in one `query-param.ts` (already exists).
- **Files:** `src/core/labels.ts`, `src/core/badge-descriptions.ts`, `src/core/status-tone.ts`, `src/core/evidence-tone.ts`, `src/core/evidence-kind-filter.ts`, `src/core/requirement-status-filter.ts`, `src/core/report-view.ts`.

### 14. `src/server` has several one-function files that do not earn a module

- **What is unnecessarily complex:** `verify-messages.ts` (one string), `connect-policy.ts` (one RBAC wrapper), `assessment-engines.ts` (one mapper), `src/server/db.ts` (re-exports + two load wrappers), `src/components/dashboard/dashboard-section.tsx` (re-exports `PageSection` under another name).
- **Why the complexity is a problem:** Import graphs grow; grep for the behavior lands on a trampoline.
- **How it could be simplified:** Inline the string next to the verify action. Import `@complyloop/db` from server modules (or keep one `loadWorkspaceDbForViewer` next to `workspace.ts`). Use `PageSection` in the dashboard. No new helpers.
- **Files:** `src/server/verify-messages.ts`, `src/server/connect-policy.ts`, `src/server/assessment-engines.ts`, `src/server/db.ts`, `src/components/dashboard/dashboard-section.tsx`.

---

## P3 — Low

### 15. Package barrels contradict the repo’s own rule

- **What is unnecessarily complex:** `packages/*/src/index.ts` files exist only to `export *` from sibling modules. The quality rule says no barrel files that just re-export; consumers already import subpaths (`@complyloop/db/client`, `@complyloop/domain/project-types`).
- **Why the complexity is a problem:** Two legal import styles for the same symbol. Barrels invite accidental wide imports.
- **How it could be simplified:** Delete the barrels (or stop documenting the bare specifier). Keep `"./*"` exports.
- **Files:** `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/adapters/src/index.ts`, `packages/analysis-core/src/index.ts`, `packages/analysis-core/src/contract/index.ts`.

### 16. Persistence helpers are split by filename more than by job

- **What is unnecessarily complex:** `postgres-queries.ts`, `postgres-evidence.ts`, `postgres-scope.ts` (two constants), `postgres-url.ts`, `postgres-ssl.ts`, plus `repo/*`. Evidence listing lives in `postgres-queries`; evidence insert lives in `repo/evidence.ts`.
- **Why the complexity is a problem:** “Where does this SQL go?” has two answers.
- **How it could be simplified:** After P0/P11, put reads that are not generic repo CRUD in one `queries.ts`. Constants can live at the top of that file. Keep `postgres-ssl.ts` / `postgres-url.ts` next to the client — those are connection concerns.
- **Files:** `packages/db/src/postgres-*.ts`, `packages/db/src/repo/*`.

### 17. Agent/doc surface restates the same module map

- **What is unnecessarily complex:** `AGENTS.md`, `CLAUDE.md`, `docs/ai/architecture.md`, `docs/compliance-engineering-product-spec.md`, and eight `.cursor/rules/*.mdc` files all list packages, the core loop, and “framework-agnostic / second adapter later.” CLAUDE.md is mostly a Next.js-injected stub that points at AGENTS.md.
- **Why the complexity is a problem:** The “later” adapter story leaks into every orientation doc and quietly justifies items 3–4. Agents get three maps of the same folders.
- **How it could be simplified:** One orientation (`AGENTS.md`) + architecture (shape/persistence only) + product spec (who/scope). Rules stay enforceable constraints, not a second architecture essay. Drop “add `adapters/src/<name>`” until that work is in scope.
- **Files:** `AGENTS.md`, `CLAUDE.md`, `docs/ai/architecture.md`, `docs/compliance-engineering-product-spec.md`, `.cursor/rules/*`.

### 18. Dashboard UI is over-filed

- **What is unnecessarily complex:** The dashboard page imports a dozen local components (`dashboard-overview`, `dashboard-activity-sections`, `dashboard-alerts-card`, `dashboard-status-counts`, `dashboard-workspace-toolbar`, `dashboard-section`, …). Several are presentational slices of one screen, not reused elsewhere.
- **Why the complexity is a problem:** Editing the dashboard means opening the page plus a folder of fragments. `dashboard-section.tsx` is a pure alias.
- **How it could be simplified:** Collocate the screen: keep genuinely reused pieces (`RuntimeCoverageChip`, `AssessmentJobStatusLive`, `FirstAssessmentChecklist`). Inline one-off cards into `dashboard-overview.tsx` or the page. Use `PageSection` directly.
- **Files:** `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`.

### 19. `graft/` is a second index of the same codebase

- **What is unnecessarily complex:** A generated graph (`graft/`) plus `graft ask/map` workflow, documented in AGENTS.md, that must be rebuilt after large changes.
- **Why the complexity is a problem:** Another artifact to keep in sync. Useful for agents; not required for the product.
- **How it could be simplified:** Keep it if you actually query it; do not treat `graft build` as part of the definition of done. Do not add a third index.
- **Files:** `graft/`, `AGENTS.md` (Graft section).

---

## Explicitly rejected — do not “simplify” these

These look like complexity. Removing them would lose correctness, an actual product boundary, or replace a boring solution with a fancier one.

| Temptation                                                                    | Why to leave it                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flatten Finding/Remediation JSONB into columns                                | Nested `location` / `fix` / engines would become a worse schema. JSONB for the document + a few indexed columns is the boring Postgres choice. The problem is the **mutate-and-diff layer on top**, not JSONB. |
| Share markdown + HTML report _renderers_                                      | One `ReportModel` is enough sharing. Escaping and layout differ. A shared renderer would be the over-abstraction.                                                                                              |
| Split `analysis-core` or extract `contract/` as a sixth package               | The CLI (`packages/check`) already justifies the analysis package. More packages is the opposite of simpler. Collapse _domain_ instead.                                                                        |
| Move jobs to Redis/SQS                                                        | `FOR UPDATE SKIP LOCKED` + leases + per-project serial is the standard Postgres queue. A broker is a new operational dependency.                                                                               |
| Split the worker into its own deployable                                      | It is a script over the same code. Packaging it separately adds a release graph for no isolation win.                                                                                                          |
| Delete check-authority / merge-findings / html-validate                       | Fail-closed status rules and RGAA 8.2 / 10.1 ownership are product correctness, not ceremony.                                                                                                                  |
| SQL-paginate findings “for cleanliness”                                       | One active project at agency scale. In-memory filter after a project load is fine until a measurement says otherwise. Prefer P11’s “load what the page needs” over a generic pagination framework.             |
| Dedup `e2e/fixtures/sample-app/Bad.tsx` and `packages/check/testdata/Bad.tsx` | Different harnesses; coupling them is not simpler.                                                                                                                                                             |
| Remove AES-256-GCM token storage, SSRF guards, rate limits, evidence trigger  | Security / audit invariants.                                                                                                                                                                                   |
| `finding-act.ts` state machine                                                | One exhaustive view model for the finding page. Folding it into JSX would hide the workflow.                                                                                                                   |
| shadcn `cn()` / `clsx` / `tailwind-merge` / Radix                             | Standard UI stack; replacing it is churn.                                                                                                                                                                      |
| 75 AST checks in one registry                                                 | The domain _is_ the check list. Splitting by RGAA theme would add navigation without shrinking the problem.                                                                                                    |

---

## Suggested order

1. **P0 #1** — replace mutate-and-diff with explicit upserts (keep locks + stale-write + append-only evidence). This unlocks simpler actions and tests.
2. **P1 #2 + #5** — catalog from source; one field for assessment scope.
3. **P1 #3 + #4 + P2 #9** — delete the domain package and the adapter plugin interface in one packaging pass.
4. **P2 #6–#8, #12–#14** — fold trampoline files as you touch those features.
5. **P3** — opportunistically.

Do not start a “simplicity rewrite” branch that touches all of this at once. Each item should land as a small, behavior-preserving change with the existing quality gate:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
