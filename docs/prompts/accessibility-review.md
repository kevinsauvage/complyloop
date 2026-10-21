# Accessibility review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: changed files under `src/app`, `src/components`)

ComplyLoop enforces RGAA/WCAG, so its own UI must meet the same bar (WCAG 2.2 AA / RGAA 4). Do not edit code. Read `.cursor/rules/ui-conventions.mdc` and `docs/ai/finding-flow.md` for the UX contract.

## Check

1. **Name, role, value** — every interactive element has an accessible name; correct native element first (no `div`-as-button/link); ARIA only where native HTML cannot; state exposed (`aria-expanded`, `aria-current`, `aria-busy`).
2. **Keyboard** — everything operable by keyboard in a logical order; visible focus indicator; no traps; focus managed on route change, dialog open/close, and after actions that remove the focused element; queue navigation (`j`/`k`) intact on finding pages and not firing inside inputs.
3. **Structure** — one `h1`, heading levels not skipped, landmarks (`main`, `nav`), lists and tables with proper headers/captions, skip link works.
4. **Forms** — visible labels programmatically associated, errors linked with `aria-describedby`/`aria-errormessage`, required/invalid state conveyed, autocomplete tokens, no placeholder-as-label.
5. **Status & feedback** — toasts/async results announced (`role="status"`/`alert` used correctly, via `useActionToast`); loading and empty states announced; no information by color alone.
6. **Contrast & reflow** — text ≥4.5:1 (UI components ≥3:1) in light and dark; usable at 200% zoom and 320px width; no fixed tiny text; text-spacing overrides don't break layout; touch targets ≥24px.
7. **Motion & media** — respects `prefers-reduced-motion`; no auto-playing content; images have meaningful or empty `alt`; icons decorative-hidden or labeled.
8. **Language** — `lang` set; foreign phrases marked; link text meaningful out of context; "new tab" disclosed.
9. **Domain copy** — Finding/Requirement/Remediation vocabulary; `automated` vs `human_review` surfaced where status source matters.
10. **Project patterns** — reuse `PageHeader`, `EmptyState`, `page-primitives.tsx`, existing badges/tokens; no new Radix/`ui/` primitive with fewer than 2 consumers.

## Output

`PASS` or `FAIL`, then:

```text
[SEVERITY] path/file.tsx:LINE — problem
  Criterion: WCAG x.y.z (level) / RGAA 4 criterion n.n
  Fix: minimal direction
```

Where static reading cannot decide (contrast, focus order), say "needs browser check" and name the page and state to test (Playwright/axe via `npm run test:e2e`).
