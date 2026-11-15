# TODO

Open work only; shipped work lives in `git log`. Last reviewed 2026-11-15.

## Decide

- [ ] **`develop` holds unmerged features.** Eight commits from 2026-10-21/22 never reached `main`: the project
      as part of the URL (`src/app/(app)/projects/[projectId]/`), the sitemap page picker
      (`packages/analysis-core/src/runtime/sitemap.ts`) and `noUncheckedIndexedAccess`. `main` has moved on since
      (265 files differ), so a merge will conflict. Either port the features onto `main` or delete the branch.
      **Why:** finished work is missing from production, and the branch still gets Vercel previews.

## Dependencies

- [ ] **Dependabot #37 (10 production bumps) and #39 (12 dev bumps) fail CI.** Find the breaking package in
      each group and split it out or fix it.
- [ ] **ESLint 9 → 10.** Ignored in `.github/dependabot.yml` until the plugins `eslint-config-next` pulls in
      accept it; remove the ignore entry then.
- [ ] **`next-auth@5` beta**, pinned exactly. Move to stable when it ships.
- [ ] **Moderate advisories, none with a safe fix:** `minimatch` through `@typescript-eslint/parser` and `glob`
      through `linkinator` (both are runtime dependencies of `@complyloop/analysis-core`, which lints and
      link-checks the audited repository), `vitest` (dev). npm's proposed fixes are downgrades.
