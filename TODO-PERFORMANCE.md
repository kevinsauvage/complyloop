# TODO — Performance

## P2 — Medium

- [ ] **App layout blocks children streaming on the nav-attention count**
  - Where: `src/app/(app)/layout.tsx:10-27` awaits `navAttentionForProject` (and `WorkspaceContext`) before rendering `{children}`; no `<Suspense>` around them.
  - Change: Move the attention count (and context strip) into small async components wrapped in `<Suspense>` with a neutral fallback so the shell and page stream first.
  - Expected impact: Better TTFB/first paint and streaming on every app route.
  - Risk: low.
  - Confidence: **Confirmed** structure; measure route Server-Timing.

- [ ] **`html-validate` DOM-to-source mapping is near-quadratic per page**
  - Where: `packages/analysis-core/src/runtime/html-validate-runtime.ts:107-133` (`selectorOf` walks ancestors + sibling scans; `:154` `el.outerHTML` per element), `:209-227` (`elementAtOffset` scans the element array twice per message), `:276` (`offsetForLineColumn` scans from 0 per message).
  - Change: Sort messages by offset and sweep elements once; compute offsets incrementally; avoid `outerHTML` for elements not referenced by messages.
  - Expected impact: Visible on large pages (thousands of elements, many messages).
  - Risk: medium.
  - Confidence: **Measure first** — element count × message count × time in `htmlValidateFindingsForPage`.

- [ ] **Runtime pages and link checks run strictly serially**
  - Where: `packages/analysis-core/src/runtime/scan.ts:189-283` (`for (const url of urls) { await context.newPage(); … }`), `packages/analysis-core/src/runtime/site-level/link-check.ts:138-164` (linkinator per URL).
  - Change: Bounded page pool (2–4) over independent URLs with the shared DNS cache from P0; run a subset of starting URLs for site-level checks.
  - Expected impact: Runtime-phase wall time moves from N × per-page time toward N/pool.
  - Risk: medium (resource contention, shared route interceptor).
  - Confidence: **Measure first** — per-URL durations and total scan wall time.
