# Architecture refactor backlog

Where we are, what to extract next, and with what payoff. **Sibling doc:** [`ai/architecture.md`](./ai/architecture.md) for the current shape; this file is the _work_ backlog on top of it.

## Current shape (snapshot)

| Layer                    | LOC   | Nature                                                      |
| ------------------------ | ----- | ----------------------------------------------------------- |
| `packages/analysis-core` | 12.4k | Analysis engine + contract: `contract/`, `checks/`, `runtime/`, `scan.ts` |
| `packages/adapters`      | ~3.2k | RGAA/WCAG catalog, presets, guidance, control-theme         |
| `packages/db`            | ~3k   | Postgres persistence — schema, `repo/` mappers, workspace-load, client |
| `packages/domain`        | ~0.5k | Product domain model — orgs, projects, requirements, catalog types, `PresetCatalog` port |
| `src/server`             | 7.1k  | App layer; `actions/` 4.5k, application logic                |
| `src/components`         | 8.0k  | UI (feature folders)                                        |
| `src/app`                | 2.3k  | Next routes/API                                             |
| `src/core`               | 1.7k  | 25 framework-agnostic helpers (domain types + PresetCatalog moved out) |
| `src/ai`                 | 0.4k  | explain / fix / remediate                                   |

Already healthy: the shared contract (`analysis-core/contract`), domain model, adapters catalog, and DB are each their own package; `src/core` is framework-agnostic and ESLint-enforced; the app imports all four packages directly. Extraction work below is about *releasing* the remaining seam (worker).

## Extraction candidates

### T1 ~~Move `src/core/location.ts` → `analysis-core/contract/location.ts`~~ **DONE**

> Done: moved `location.ts` + `location.test.ts` into `contract/`, rewired ~27 import sites (incl. the CLI and all of `src/ai`), added the `location` aggregate export to `contract/index.ts`. Verified: `typecheck`, `lint`, `build:core`, `build:check`, full test suite (1153 passed). The bundled CLI now contains **0** references to `src/core/location`.

**Why.** The `Location` type lives in `contract/finding-types.ts`, but the formatters `formatLocationRef` / `locationSnippet` / `domLocationDetails` (24 import sites incl. the CLI and all of `src/ai`) live in the **app**. The `@complyloop/check` CLI (`src/cli/check.ts`) imports `../core/location` from app source — so the published CLI reaches into the app tree today. They're pure functions over the type; they belong beside it.

- **Workload:** ~0.5 day (move file, rewire ~24 imports, rebuild CLI, run `build:core` + `build:check`).
- **Priority:** P1 — highest payoff per hour.
- **Win:** CLI decouples from the app and becomes buildable from `analysis-core` alone; removes a build-snapshot wart.
- **Risks:** low. Respect `.ts`-specifier Turbopack rule (see G1).

### T2 ~~Extract `src/server/db-store/` → `@complyloop/db`~~ **DONE**

> Done (option A): extracted a `@complyloop/domain` package (the product domain model from `src/core/project-types.ts` + `DEFAULT_PAGE_SIZE`), extracted `@complyloop/db` (all 27 db-store files: 16 src + 11 repo) on top of it, parameterized the adapter catalog merge as a `CatalogMerger` port injected by app callers, and added `addEvidence` to the db package. Wired workspaces, vitest include/coverage, eslint package boundary guards, `next.config` `transpilePackages`, Dockerfile (build + ship dist + exports swap for all 3 packages), npm `build:domain`/`build:db`, nested `.gitignore`. Db package emits publish-safe `.js`-extension `dist`.
> **Full cutover done:** the temporary `src/core/project-types.ts` re-export shim was **removed** — all 88 import sites now use `@complyloop/domain/project-types` directly, and no reference to the old `@/core/project-types` path remains. `@/core/pagination` remains (real pagination logic; its `DEFAULT_PAGE_SIZE` re-export from domain is a legit re-export, not a shim).
> Verified final: root + package `typecheck`, `lint`, `build:domain`, `build:db`, build:core, full `next build` (all routes), compose config valid, full `npm run test` (252 passed / 2 skipped; the single flake — `check-pack.smoke.test.ts` 10s hook timeout under full-suite parallel load — passes in isolation and doesn't touch db/domain).
> **Note (premise correction):** the task's "clean leaf" assumption was false — db-store rows are the app's domain types (Project/Organization/etc., not in the analysis contract), so standalone extraction required extracting the domain model first. Read the archived original "Why" below for the original framing.

- **Why.** Two deployables ship one tree today: the Next app (docker `app`) and the worker (`npx tsx scripts/run-assessment-worker.ts`, docker `worker`); both pull `src/server` incl. `db-store`. `db-store` is already a clean leaf (only `drizzle-orm` + `postgres`, no app imports, emits `contract` types) — schema, 11 `repo/` mappers, `client`.
- **Workload:** 2–4 days (move + package.json + exports + Dockerfile paths + migration step).
- **Priority:** P1 — the actual "scale" lever; prerequisite for T3.
- **Win:** one versioned persistence artifact shared by app **and** worker; independent deploys; clean boundary verified by isolated build.
- **Risks:** `drizzle/0000_init.sql` and `db:migrate` seeding wire-up; docker compose paths.

### T3 · Extract the worker as its own workspace/package

**Scope:** `scripts/run-assessment-worker.ts` + `assessment-worker.ts` + `assessment-jobs.ts` + `repo-checkout.ts` + `git.ts`.

- **Workload:** 2–4 days (reduced from 3–5 — the persistence boundary is already a package via T2; worker now needs only `@complyloop/db` + `@complyloop/analysis-core`).
- **Priority:** P2 — only pays if "scale" means independent worker deployment/throughput.
- **Win:** worker can be released, versioned, and scaled without the web app; isolates heavy deps (`playwright`, `linkinator`, `html-validate`).
- **Risks:** medium now (T2 already split out DB); still needs a stable shared contract with the app.

### T4 ~~Extract `src/adapters/` → `@complyloop/adapters`~~ **DONE**

> Done: moved all 9 adapters source files (`registry`, `control-theme`, `types`, `rgaa/{controls,guidance,pertinence-twins,presets}`, `wcag/{controls,presets}`) + 9 test files into `@complyloop/adapters` (git renames detected). Moved the `PresetCatalog` port interface into `@complyloop/domain/preset.ts` (the adapters' only app import was `@/core/project-preset`, now gone — adapters imports only `domain` + `analysis-core`). Rewired internal imports to relative `.ts`, rewrote 29 app consumers to `@complyloop/adapters/*`, updated 2 scripts. Wired vitest include/coverage, eslint leaf-boundary guard (now covers adapters + db + domain), dist-ignore, `next.config` `transpilePackages`, Dockerfile (build + ship dist + exports swap), npm `build:adapters`. Adapters emits publish-safe `.js`-extension `dist`. `src/adapters` fully removed.
> **Note (premise refinement):** adapters imports the analysis **engine** subpaths (`types`, `check-authority`, `checks/registry`, `runtime/*`), not just `contract` — but no app/server layers, so the package is a clean standalone leaf. Catalog ↔ check-id alignment preserved (catalog-coverage + check-authority integration tests pass).
> Verified: `typecheck`, `lint`, `build:adapters` (isolated + dist `.js` confirmed), `build:domain`, `build:core`, adapter tests (9 files / 35 passed), full `npm run test` (253 passed / 2 skipped), full `next build` (all routes).

Pure catalog data + guidance; imports only `contract`; "how to add a framework" is already the documented seam. Payoff is independent versioning of the RGAA/WCAG catalog against the product.

- **Workload:** 1–2 days.
- **Priority:** P3 — defer until a second catalog consumer exists (today app-only).
- **Win:** regulation updates ship/version independently.
- **Risks:** keep catalog ↔ check-id alignment intact (`analysis-strategy.md` "unmapped check id is invisible").

## Explicitly NOT extracting now

- `src/ai/` (428 LOC) — single consumer; cost > benefit.
- Most of `src/core/` — product-domain helpers (RBAC, finding-UX, presets); the domain types they operate on already live in `@complyloop/domain`. Only a `location.ts`-style pure helper would justify a move, and it's now in contract.

## Guardrails

- **G1 · Turbopack `.ts`-extension rule.** `analysis-core`, `domain`, `db`, and `adapters` exports point at `src/*.ts` with `.ts` specifiers. A published consumer must resolve through `publishConfig.exports → dist/` + `predev`/`prebuild` hooks, never `paths → src/`. The packages emit `.js`-extension `dist` via `rewriteRelativeImportExtensions`.
- **G2 · Catalog alignment.** Any adapter/db split must preserve catalog ↔ check-id mapping and the `htmlValidateOwned` gate.
- **G3 · One source of truth.** Extraction must be live import (one source), not a copy-at-build snapshot.

## Suggested order

1. ~~**T1** — location → contract~~ ✅
2. ~~**T2** — domain + db extraction~~ ✅
3. ~~**T4** — adapters package~~ ✅
4. **T3** — worker independence (now the only remaining; can proceed directly since DB + analysis + domain are packaged).
