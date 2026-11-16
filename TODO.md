# TODO

Open work only; shipped work lives in `git log`. Last reviewed 2026-11-15.

## Dependencies

- [ ] **`postgres` (postgres.js) 3.4.9 → 4.1.1** (Dependabot #41, red). The PR bumps only the root manifest;
      `packages/db` must move with it. With both on 4.1.1 the install resolves, and one test stops compiling
      (`packages/analysis-core/src/runtime/raw-finding-from-dom.test.ts` types `import("postgres")` as callable; v4
      is ESM-only). Then run `npm run db:migrate`, `npx drizzle-kit check`, `npm run test:db` and `npm run test:e2e`
      against a throwaway Postgres before pushing: the driver's parameter typing changed, and `scripts/db-migrate.ts`
      relies on `sql.unsafe` and `sql.begin`. Persistence change, so plan and review first (AGENTS.md).

- [ ] **`@vitejs/plugin-react` 6.0 → 6.3** does not install: its peer wants `@babel/core` 8 through
      `@babel/plugin-transform-runtime`. Retry when the Babel 8 chain settles.
- [ ] **ESLint 9 → 10.** Ignored in `.github/dependabot.yml` until the plugins `eslint-config-next` pulls in
      accept it; remove the ignore entry then.
- [ ] **`next-auth@5` beta**, pinned exactly. Move to stable when it ships.
- [ ] **Moderate advisories, none with a safe fix:** `minimatch` through `@typescript-eslint/parser` and `glob`
      through `linkinator` (both are runtime dependencies of `@complyloop/analysis-core`, which lints and
      link-checks the audited repository), `vitest` (dev). npm's proposed fixes are downgrades.
