# `@complyloop/check`

Fail CI when accessibility **violations** exist in a React/TypeScript tree. AST checks plus `eslint-plugin-jsx-a11y` — no browser required.

## Install

```bash
npm install @complyloop/check
```

From this monorepo (after build):

```bash
npm run build:check
npm install ./packages/check
```

## Run

```bash
npx complyloop-check .
npx complyloop-check path/to/app
npx complyloop-check --help
```

## Output

Plain text on stdout (not JSON):

```
ComplyLoop check: scanned N file(s) in <path>
  V violation(s), W warning(s)
  FAIL <checkId> <location> — <reason>
  WARN <checkId> <location> — <reason>
```

Only `FAIL` lines (violations) cause exit code `1`. Warnings are reported but do not fail CI.

| Exit code | Meaning |
| --- | --- |
| `0` | No violations (warnings may still be printed) |
| `1` | At least one violation finding |
| `2` | Usage or I/O error (path is not a directory) |

## Gate matrix (what CI can and cannot catch)

This gate is **AST-only**: it scans source (`scanProject`) with no browser, so
it catches static violations (missing alt, invalid ARIA, label association…)
but **cannot verify runtime-only checks** — contrast, landmarks, reflow,
keyboard behavior, and other rules that need a rendered page (authority
`runtime_only` in `packages/analysis-core/src/check-authority.ts`, derived from
`CHECK_REGISTRY`).

Every run prints the current runtime-only count to stderr:

```
complyloop-check: AST-only gate; N runtime-only check(s) require a preview audit and cannot fail this gate.
```

Cover those with a preview audit from the app (Settings → Preview URL), which
runs Playwright + axe over the live pages. There is intentionally no
`--runtime` mode in this package (browser engines stay out of the CI
dependency closure).

## GitHub Actions

Copy [`templates/github-actions/complyloop-check.yml`](../../templates/github-actions/complyloop-check.yml):

```yaml
- run: npm ci
- run: npx complyloop-check .
```

## Develop in the monorepo

Source lives in this package (`src/check.ts`). `analysis-core` is a workspace
devDependency and is bundled into `dist/cli.js`; published runtime deps stay
external so the tarball does not pull Playwright.

```bash
npm run build:check   # build packages/check/dist/cli.js
npm run check -- .    # bundle or tsx fallback
npm run check -- packages/check/testdata   # deliberate violations (see src/check.test.ts)
```

`testdata/Bad.tsx` exercises heuristic checks (`error-prevention`, `captcha-alternative`, …) plus jsx-a11y `img-alt`.
