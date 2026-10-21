# Dead code removal

**Mode:** edits · **Scope:** `{{SCOPE}}` (default: whole repo)

Remove code that nothing uses. Behavior must not change.

## Steps

1. **Detect.** `npx knip` (config: `knip.json`) for unused files, exports, types, and dependencies. Supplement with `rg -n '<symbol>'` and `graft callers <symbol>` before deleting anything.
2. **Verify each candidate is truly dead.** Check for: dynamic imports and string-built paths, Next.js conventions (`page`, `layout`, `route`, `proxy`, `instrumentation`, `opengraph-image`), `package.json` scripts, GitHub Actions workflows, `scripts/`, Playwright/e2e use, public package API of `packages/analysis-core` (published — exports may be consumed externally), and framework-called exports.
3. **Remove** in small, themed commits-worth of change: unused exports → unused files → unused dependencies → commented-out code and stale flags/env vars (also from `.env.example` and docs).
4. **Do not** touch: `drizzle/` migrations, `packages/analysis-core/src/contract/`, generated output (`.next/`, `dist/`, `coverage/`), `graft/` (rebuild it with `graft build` instead).
5. **Gate.** `npm run verify:gate`, then `npm run knip` clean or each remaining item justified in `knip.json` with a reason.

## Report

- Removed: files / exports / deps (with names).
- Kept despite flagged, and why.
- Docs or env references updated.

If a deletion is ambiguous (possible external consumer), leave it and list it under "needs a human decision".
