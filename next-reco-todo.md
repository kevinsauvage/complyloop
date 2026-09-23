# next-reco-todo.md — Next.js conformance audit

## P2 — SEO / metadata

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

## Known upstream issues

- [ ] **17. `MaxListenersExceededWarning` on the Sentry tunnel rewrite.**
      Requests through the Sentry `tunnelRoute` (`/monitoring` → external ingest,
      `next.config.ts:165`) log `11 close listeners added to [ServerResponse]`.
      Cause: Next 16's external-rewrite proxy
      (`server/lib/router-utils/proxy-request.js` → `httpxy` → `Readable.pipe`, +3)
      plus the Sentry APM SDK (+2) on top of Next's own 6, crossing Node's default of
      10 — benign and per-request, not a leak (vercel/next.js#96973). Upstream fix
      vercel/next.js#97818 is **open** (not in 16.3.6); delete this once an upgrade
      carries it. Not silenced: `events.setMaxListeners(n, ServerResponse)` does not
      scope (Node calls the inherited static, setting the process-wide default), and a
      global bump would mask real leak warnings.
