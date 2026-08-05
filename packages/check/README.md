# `@complyloop/check`

CI gate for assessed apps: scan a React/TypeScript tree and exit non-zero on accessibility **violations**.

## Usage (this monorepo)

```bash
npx complyloop-check .
# or
npm run check -- .
```

## GitHub Actions (customer app)

Until the package is published to npm, install from this repo (or copy the workflow from `templates/github-actions/`):

```yaml
- run: npx --yes --package=tsx --package=file:../path-to-complyloop/packages/check complyloop-check .
```

Prefer linking the workspace when ComplyLoop is a sibling checkout:

```bash
npm install ../Compliance-Engineering-Platform/packages/check
npx complyloop-check .
```

After a future npm publish: `npx @complyloop/check .`
