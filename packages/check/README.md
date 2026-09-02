# `@complyloop/check`

Fail CI when accessibility **violations** exist in a React/TypeScript tree. AST checks only — no browser required.

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
```

| Exit code | Meaning |
| --- | --- |
| `0` | No violations |
| `1` | Violations found |
| `2` | Usage or I/O error |

## GitHub Actions

Copy [`templates/github-actions/complyloop-check.yml`](../../templates/github-actions/complyloop-check.yml):

```yaml
- run: npm ci
- run: npx complyloop-check .
```

## Develop in the monorepo

```bash
npm run build:check   # build packages/check/dist/cli.js
npm run check -- .    # bundle or tsx fallback
npm run check -- packages/check/testdata   # deliberate violations (see src/cli/check.test.ts)
```

`testdata/Bad.tsx` exercises heuristic checks (`error-prevention`, `captcha-alternative`, `reduced-motion`, …) plus `img-alt`.
