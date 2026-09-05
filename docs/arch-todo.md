# Architecture refactor backlog

Where we are, what to extract next, and with what payoff. **Sibling doc:** [`ai/architecture.md`](./ai/architecture.md) for the current shape; this file is the *work* backlog on top of it.

## Current shape (snapshot)

| Layer | LOC | Nature |
| --- | --- | --- |
| `packages/analysis-core` | 12.4k | True package: `contract/`, `checks/`, `runtime/`, `scan.ts` |
| `src/server` | 9.2k | App layer; `actions/` 4.5k, `db-store/` 2.1k |
| `src/components` | 8.0k | UI (feature folders) |
| `src/adapters` | 3.2k | RGAA/WCAG catalog + presets + guidance |
| `src/app` | 2.3k | Next routes/API |
| `src/core` | 1.8k | 26 framework-agnostic helpers |
| `src/ai` | 0.4k | explain / fix / remediate |

Already healthy: `contract/` is the shared seam, `src/core` is framework-agnostic and ESLint-enforced, `db-store` is a clean leaf. Extraction work below is about **releasing** the seams, not creating them.

## Extraction candidates

### T1 ~~Move `src/core/location.ts` → `analysis-core/contract/location.ts`~~ **DONE**

> Done: moved `location.ts` + `location.test.ts` into `contract/`, rewired ~27 import sites (incl. the CLI and all of `src/ai`), added the `location` aggregate export to `contract/index.ts`. Verified: `typecheck`, `lint`, `build:core`, `build:check`, full test suite (1153 passed). The bundled CLI now contains **0** references to `src/core/location`.

**Why.** The `Location` type lives in `contract/finding-types.ts`, but the formatters `formatLocationRef` / `locationSnippet` / `domLocationDetails` (24 import sites incl. the CLI and all of `src/ai`) live in the **app**. The `@complyloop/check` CLI (`src/cli/check.ts`) imports `../core/location` from app source — so the published CLI reaches into the app tree today. They're pure functions over the type; they belong beside it.

- **Workload:** ~0.5 day (move file, rewire ~24 imports, rebuild CLI, run `build:core` + `build:check`).
- **Priority:** P1 — highest payoff per hour.
- **Win:** CLI decouples from the app and becomes buildable from `analysis-core` alone; removes a build-snapshot wart.
- **Risks:** low. Respect `.ts`-specifier Turbopack rule (see G1).

### T2 · Extract `src/server/db-store/` → `@complyloop/db`

- **Why.** Two deployables ship one tree today: the Next app (docker `app`) and the worker (`npx tsx scripts/run-assessment-worker.ts`, docker `worker`); both pull `src/server` incl. `db-store`. `db-store` is already a clean leaf (only `drizzle-orm` + `postgres`, no app imports, emits `contract` types) — schema, 11 `repo/` mappers, `client`.
- **Workload:** 2–4 days (move + package.json + exports + Dockerfile paths + migration step).
- **Priority:** P1 — the actual "scale" lever; prerequisite for T3.
- **Win:** one versioned persistence artifact shared by app **and** worker; independent deploys; clean boundary verified by isolated build.
- **Risks:** `drizzle/0000_init.sql` and `db:migrate` seeding wire-up; docker compose paths.

### T3 · Extract the worker as its own workspace/package

**Scope:** `scripts/run-assessment-worker.ts` + `assessment-worker.ts` + `assessment-jobs.ts` + `repo-checkout.ts` + `git.ts`.

- **Workload:** 3–5 days.
- **Priority:** P2 (needs T2 first) — only pays if "scale" means independent worker deployment/throughput.
- **Win:** worker can be released, versioned, and scaled without the web app; isolates heavy deps (`playwright`, `linkinator`, `html-validate`).
- **Risks:** large; needs a stable shared contract with the app; do only after T2.

### T4 Extract `src/adapters/` → `@complyloop/adapters`

Pure catalog data + guidance; imports only `contract`; "how to add a framework" is already the documented seam. Payoff is independent versioning of the RGAA/WCAG catalog against the product.

- **Workload:** 1–2 days.
- **Priority:** P3 — defer until a second catalog consumer exists (today app-only).
- **Win:** regulation updates ship/version independently.
- **Risks:** keep catalog ↔ check-id alignment intact (`analysis-strategy.md` "unmapped check id is invisible").

## Explicitly NOT extracting now

- `src/ai/` (428 LOC) — single consumer; cost > benefit.
- Most of `src/core/` — product-domain (RBAC, finding-UX, presets); only `location.ts` is reusable outside the app.

## Guardrails

- **G1 · Turbopack `.ts`-extension rule.** `analysis-core` exports point at `src/*.ts` with `.ts` specifiers. A published consumer must resolve through `publishConfig.exports → dist/` + `predev`/`prebuild` hooks, never `paths → src/`.
- **G2 · Catalog alignment.** Any adapter/db split must preserve catalog ↔ check-id mapping and the `htmlValidateOwned` gate.
- **G3 · One source of truth.** Extraction must be live import (one source), not a copy-at-build snapshot.

## Suggested order

1. **T1** — do first; cheapest, cleans the CLI.
2. **T2** — the scale prereq.
3. **T3** — worker independence (after T2).
4. **T4** — adapters only when a second consumer appears.