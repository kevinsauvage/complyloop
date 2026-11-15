# TODO

Open work only; shipped work lives in `git log`. Last reviewed 2026-11-15.

## Dependencies

- [ ] **Dependabot #37 (10 production bumps) and #39 (12 dev bumps) fail CI.** Find the breaking package in
      each group and split it out or fix it.
- [ ] **ESLint 9 → 10.** Ignored in `.github/dependabot.yml` until the plugins `eslint-config-next` pulls in
      accept it; remove the ignore entry then.
- [ ] **`next-auth@5` beta**, pinned exactly. Move to stable when it ships.
- [ ] **Moderate advisories, none with a safe fix:** `minimatch` through `@typescript-eslint/parser` and `glob`
      through `linkinator` (both are runtime dependencies of `@complyloop/analysis-core`, which lints and
      link-checks the audited repository), `vitest` (dev). npm's proposed fixes are downgrades.
