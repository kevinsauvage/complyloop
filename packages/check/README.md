# `@complyloop/check`

CI gate for assessed apps: scan a React/TypeScript tree and exit non-zero on accessibility **violations**.

## Install

```bash
npm install @complyloop/check
# or from a local checkout of this monorepo (after build):
npm run build:check
npm install /path/to/Compliance-Engineering-Platform/packages/check
```

## Usage

```bash
npx complyloop-check .
# or
npx complyloop-check path/to/app
```

Exit codes: `0` clean, `1` violations found, `2` usage/IO error.

## GitHub Actions

See [`templates/github-actions/complyloop-check.yml`](../../templates/github-actions/complyloop-check.yml):

```yaml
- run: npm ci
- run: npx complyloop-check .
```

## Monorepo development

From the ComplyLoop repo root:

```bash
npm run build:check   # produce packages/check/dist/cli.js
npm run check -- .    # runs the bin (bundle if present, else tsx fallback)
```
