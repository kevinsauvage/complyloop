# packages/analysis-core — agent notes

Deterministic AST + runtime engine. AI never sets statuses here.

- Add a check id via: `CHECK_IDS` → `checks/registry.ts` (or `jsx-a11y-scan.ts` map) → `check-authority.ts` list → runtime map if needed → catalog `checkId` → `catalog/**/guidance.ts`. Then run `check-authority.test.ts` + `catalog-coverage.test.ts`.
- Authority precedence: site_level → runtime_only → heuristic → standard. Composition-sensitive defers to runtime at merge (`merge-findings.ts`), not as a separate class.
- Shared AST helpers live in `checks/heuristic-utils.ts` (~14 dependents — run the full `checks/` suite on change; do not rename/split without a design task). Use `aria-query`/`axobject-query`, never hardcoded ARIA tables.
- Never add `@axe-core/playwright`; never import `ssrf-guard/node` in app code. Runtime URLs: per-URL `assertSafeRuntimeUrl`.
- Colocate `*.test.ts` with violation + clean cases.
