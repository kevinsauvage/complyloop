# Dependency audit

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: all of `package.json`, `packages/*/package.json`; or a single proposed package)

Assess dependency health and necessity. Do not install, upgrade, or edit. Respect the repo policy in `AGENTS.md`: a new dependency needs **2+ consumers**, and the UI dependency surface must not regrow (no new Radix/`ui/` primitive without 2+ consumers).

## Check

1. **Vulnerabilities** — `npm audit --omit=dev` (and full); distinguish reachable from theoretical; note fix versions and whether a major bump is needed.
2. **Necessity** — `npx knip` for unused deps; packages used by one file that stdlib/Node 22+/platform APIs cover; duplicates doing the same job (two date libs, two validators, two icon sets).
3. **Weight** — client bundle impact (`npm run build` route sizes, bundle check in `verify:gate`); tree-shakeability; ESM support; install scripts.
4. **Health** — last release, maintainers, open security advisories, weekly downloads vs. alternatives; license compatible with this repo's `LICENSE`.
5. **Supply chain** — new/unknown publisher, recent ownership change, typosquat-like names, `postinstall` scripts, git/URL dependencies, unpinned ranges on security-critical packages.
6. **Framework alignment** — Next.js 16 / React 19 / Tailwind 4 / Vercel AI SDK compatibility; peer-dependency warnings; versions that match the installed docs (`node_modules/next/dist/docs/`, `node_modules/ai/docs/`).
7. **Placement** — `dependencies` vs `devDependencies`; server-only packages never imported into client code; `packages/analysis-core` (published) keeps a minimal dependency set.
8. **Lockfile** — `package-lock.json` changes match `package.json` intent; no unrelated transitive churn.

## Output

| Package | Action (keep / upgrade / replace / remove) | Reason | Risk | Effort |
| ------- | ------------------------------------------ | ------ | ---- | ------ |

Then: top 3 actions in priority order, and any upgrade that needs a migration guide (link the source, do not guess its contents). If you cannot verify a claim offline, mark it `[VERIFY ONLINE]`.
