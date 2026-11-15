# TODO

Open work only; shipped work lives in `git log`. Last reviewed 2026-11-15.

## Dependencies

- [ ] **`@vitejs/plugin-react` 6.0 → 6.3** does not install: its peer wants `@babel/core` 8 through
      `@babel/plugin-transform-runtime`. Retry when the Babel 8 chain settles.
- [ ] **ESLint 9 → 10.** Ignored in `.github/dependabot.yml` until the plugins `eslint-config-next` pulls in
      accept it; remove the ignore entry then.
- [ ] **`next-auth@5` beta**, pinned exactly. Move to stable when it ships.
- [ ] **Moderate advisories, none with a safe fix:** `minimatch` through `@typescript-eslint/parser` and `glob`
      through `linkinator` (both are runtime dependencies of `@complyloop/analysis-core`, which lints and
      link-checks the audited repository), `vitest` (dev). npm's proposed fixes are downgrades.
