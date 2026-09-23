# next-reco-todo.md — Next.js conformance audit

## P2 — performance

- [ ] **9. Consider the React Compiler (optional).**
      Left open — adds `babel-plugin-react-compiler` and build-time cost. Needs a
      deliberate call, not a silent flag flip —
      `02-guides/upgrading/version-16.md:395-438`,
      `05-config/01-next-config-js/reactCompiler.md:40`.

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
