# ComplyLoop — Simplicity TODO

Audit date: 2026-09-06 · Scope: entire repo, application + packages + docs.
Constraint: no application code was changed. This file is the only deliverable.

## How this was judged

Every abstraction was asked: **can we get the same result with less code, fewer concepts, fewer dependencies, or fewer moving parts — without losing correctness, accessibility, security, performance, or maintainability?**

The product loop (Requirement → Assessment → Finding → Remediation → Verification → Evidence) is not the problem. The tax is leftover store-shaped persistence, speculative framework-agnostic packaging, and file-level over-splitting.

This is not a broken codebase. Status derivation, check authority, append-only evidence, advisory locks, and stale-write guards are load-bearing. Those stay. The findings below are places where the _mechanism_ is heavier than the _invariant_.

## P1 — High

### 4. `FrameworkAdapter` registry for one catalog and an empty WCAG adapter

- **What is unnecessarily complex:** `FrameworkAdapter` models “register a framework with controls + presets + guidance.” RGAA owns the catalog. WCAG registers `controls: []` and only presets. `guidanceFor` walks adapters until one implements it. Architecture docs and the product spec both say a second framework adapter is **out of scope**; the domain is kept agnostic “so one could be added later.”
- **Why the complexity is a problem:** Speculative architecture. Callers go through `allFrameworkPresets` / `presetById` / `defaultConnectPreset` / `guidanceFor` instead of “here are the presets, here is the catalog.” The empty WCAG adapter and the merge loop exist to look like a plugin system.
- **How it could be simplified:** One catalog module, one presets module (RGAA + WCAG lists), one `guidanceFor(checkId)`. `presetById` is `PRESETS.find(...)`. Delete `FrameworkAdapter`, the `frameworkAdapters` array, and the “add `packages/adapters/src/<name>/`” story until a second _catalog_ exists. WCAG as a **preset over the same controls** is the actual product; keep that, drop the plugin interface.
- **Files:** `packages/adapters/src/types.ts`, `packages/adapters/src/registry.ts`, `packages/adapters/src/wcag/controls.ts`, `packages/adapters/src/wcag/presets.ts`, `docs/ai/architecture.md` (“Adding a framework”).

## P2 — Medium

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

### 13. Display maps are split into many one-topic core files

- **What is unnecessarily complex:** Labels, badge descriptions, status tones, evidence tones, and evidence-kind / requirement-status URL helpers each have their own module + test. Same exhaustive-`Record` pattern repeated. `src/core` is 46 files / ~3.7k lines, many of them 20–80 line maps.
- **Why the complexity is a problem:** Not wrong — just more files than topics. Finding “what do we call `needs_review`?” means guessing among `labels.ts`, `badge-descriptions.ts`, and `status-tone.ts`.
- **How it could be simplified:** One `src/core/display.ts` (or `status-display.ts`) for label + description + tone of the canonical enums. Keep `finding-act.ts`, `rbac.ts`, `remediation.ts`, `finding-list-filter.ts` as behavior modules. URL helpers can sit next to the page that owns the query string, or in one `query-param.ts` (already exists).
- **Files:** `src/core/labels.ts`, `src/core/badge-descriptions.ts`, `src/core/status-tone.ts`, `src/core/evidence-tone.ts`, `src/core/evidence-kind-filter.ts`, `src/core/requirement-status-filter.ts`, `src/core/report-view.ts`.

### 14. `src/server` has several one-function files that do not earn a module

- **What is unnecessarily complex:** `verify-messages.ts` (one string), `src/server/db.ts` (re-exports + two load wrappers), `src/components/dashboard/dashboard-section.tsx` (re-exports `PageSection` under another name).
- **Why the complexity is a problem:** Import graphs grow; grep for the behavior lands on a trampoline.
- **How it could be simplified:** Inline the string next to the verify action. Import `@complyloop/db` from server modules (or keep one `loadWorkspaceDbForViewer` next to `workspace.ts`). Use `PageSection` in the dashboard. No new helpers.
- **Files:** `src/server/verify-messages.ts`, `src/server/db.ts`, `src/components/dashboard/dashboard-section.tsx`.

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
