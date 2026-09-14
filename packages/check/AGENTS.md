# packages/check — agent notes

`npx complyloop-check` CLI (AST only, no runtime). Bundles analysis-core; Playwright stays external.

- Build with `npm run build:check`; smoke-test with `npm run test:check-pack`.
- Testdata lives in `testdata/`; the repo template workflow points `--` at the assessed app root.
- Never import runtime scan paths here — CI gate must stay fast and dependency-light.
