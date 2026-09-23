# next-reco-todo.md — Next.js conformance audit

Source of truth: the bundled Next.js docs in `node_modules/next/dist/docs/`
(installed `next@16.3.5`), App Router only. Every item cites the doc that
motivates it and the code location it applies to. Severity: **P1** correctness /
config, **P2** performance / SEO, **P3** optional hardening.

Baseline: `npm run verify:gate` green. Nothing here is a broken build; these are
documented recommendations the project does not yet follow.

> P1 (correctness & config) is done — see **Applied** at the bottom.

## P2 — performance

- [ ] **6. Use `next/image` for GitHub avatars.**
      `src/components/shell/auth-controls.tsx:81` renders
      `<AvatarImage src={user.image}>` — a raw `<img>` with no intrinsic size
      (layout shift, no optimization). The production checklist recommends the Image
      component (`02-guides/production-checklist.md:93`); `next/image` requires
      `images.remotePatterns` for `avatars.githubusercontent.com` because
      `images.domains` is deprecated in v16
      (`02-guides/upgrading/version-16.md:878-905`). Set `width`/`height` (or `fill`)
      and note `images.qualities` now defaults to `[75]`
      (`version-16.md:775-804`).

- [ ] **7. Add `lucide-react` to `optimizePackageImports`.**
      `next.config.ts:94` optimizes only `radix-ui`, but 29 files import
      `lucide-react`. The docs call this out for icon/utility libraries —
      `02-guides/package-bundling.md:158`, `02-guides/local-development.md:164`.

- [ ] **8. Add `useReportWebVitals` for field Core Web Vitals.**
      No client vitals are collected today (`02-guides/production-checklist.md:139`,
      `02-guides/analytics.md:77`). Add a `"use client"` leaf imported by the root
      layout, reporting via `navigator.sendBeacon` / `fetch(..., { keepalive: true })`
      to Sentry.

- [ ] **9. Consider the React Compiler (optional).**
      Stable, opt-in, needs `babel-plugin-react-compiler` (not installed) —
      `02-guides/upgrading/version-16.md:395-438`,
      `05-config/01-next-config-js/reactCompiler.md:40`. Weigh the added Babel
      build-time cost.

- [ ] **10. Add dev-only fetch/HMR logging (optional).**
      `logging.fetches.fullUrl` and `experimental.serverComponentsHmrCache` speed up
      debugging and HMR — `02-guides/local-development.md:224-232`.

## P2 — SEO / metadata

- [ ] **11. Add an Open Graph image.**
      No `opengraph-image`/`twitter-image` file exists, so shared links have no
      image — `02-guides/production-checklist.md:114`,
      `03-file-conventions/01-metadata/opengraph-image.md`. Add
      `src/app/opengraph-image.tsx` (`ImageResponse`) or a static asset.

- [ ] **12. Add JSON-LD to the marketing pages.**
      No structured data today (`02-guides/json-ld.md:9-11`). Use a native
      `<script type="application/ld+json">` and escape `<` as `\u003c` to avoid XSS.

- [ ] **13. Use `<Link>` for internal navigation.**
      `src/app/(app)/org/page.tsx:77` uses `<a href="/org">Retry</a>`, bypassing
      client-side navigation/prefetch (`03-api-reference/02-components/link.md:84`).
      (`evidence-export-menu.tsx:68` is a download link — leave as `<a>`.)

## P3 — security hardening (optional)

- [ ] **14. Consider `experimental.taint: true`.**
      Declarative guard against passing server objects/secrets across the boundary;
      also taints `process.env` — `02-guides/data-security.md:226`,
      `05-config/01-next-config-js/taint.md:20`. Not a substitute for validation.

- [ ] **15. Plan `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for self-hosting.**
      Required for stable action-ID encryption across instances / rolling deploys —
      `02-guides/data-security.md:532`, `02-guides/server-actions.md:85`. Vercel
      manages this today; document it in `docs/vercel.md` for any non-Vercel target.

- [ ] **16. Add `global-not-found.tsx` (experimental).**
      Accessible 404 for unmatched routes across the app —
      `02-guides/production-checklist.md:88`,
      `03-file-conventions/not-found.md:60-66`. Requires
      `experimental.globalNotFound: true`.

## Compliant — no action (recorded to avoid churn)

- Async request APIs: `params`/`searchParams` awaited, `cookies()`/`headers()`
  async everywhere (`version-16.md:281-291`).
- Error UI: `error.tsx` per workspace segment, `global-error.tsx` defines its own
  `<html>`/`<body>` (`error.md:163`), `loading.tsx` per segment, `not-found.tsx`.
- Server Actions authenticate/authorize inside the action via
  `with*Write` + `requireOnActive` (`data-security.md:291`).
- `import "server-only"` in 61 modules (`data-security.md:245`); DB reads
  deduped with `React.cache` (`01-getting-started/06-fetching-data.md:546`).
- CSP with a per-request nonce in `src/proxy.ts`
  (`02-guides/content-security-policy.md`); proxy does optimistic JWT checks
  only, never the sole defense (`02-guides/authentication.md:1033,1121`).
- `serverExternalPackages`, top-level `turbopack.root`, ESLint flat config,
  `data-scroll-behavior="smooth"`, no `edge` runtime, no `unstable_` APIs, no
  `next/script`, `revalidateTag` (2-arg) not used.
- `cacheComponents` intentionally off with a documented rationale
  (`next.config.ts:32`).

## Applied

P1 — correctness & config (done):

- Removed the redundant `export const runtime = "nodejs"` from all three Route
  Handlers (`webhook`, `health`, `assessment-jobs`).
- Removed the redundant `export const dynamic = "force-dynamic"` from Route
  Handlers (`repos`, `health`, `assessment-jobs`); `docs/ai/architecture.md`
  updated — handlers are dynamic by default, and pages stay dynamic-from-usage.
- Added `metadataBase` to the root layout metadata
  (`NEXT_PUBLIC_APP_URL ?? AUTH_URL ?? http://localhost:3000`).
- Enabled `typedRoutes: true`. This surfaced 29 untyped hrefs; they are now
  route-typed (`Route` / route-literal template types) across the filter-param
  helpers (`href`, `findingsListHref`, `findingDetailHref`, `evidenceKindHref`,
  `reportHref`, `requirementsStatusHref`, `requirementsPageHref`,
  `evidenceRecordHref`), dashboard loader types, and component props
  (`PaginationNav`, `PageActionLink`, `FilterChipList`, `nav-links`,
  `AppErrorCard`, `ActiveChip`, `StatusNavLink`, dashboard stats/alerts).
