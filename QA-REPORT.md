# QA Report — next-portfolio assessment review

Date: 2026-09-24
Environment: ComplyLoop dev server `localhost:3002`, Postgres `localhost:5433`,
project **next-portfolio** (`kevinsauvage/next-portfolio`, `www.kevin-sauvage.com`),
preview routes `/` and `/projects/modern-ecommerce-platform`.
Baseline data: 3 assessments, 76 findings (71 open / 5 resolved), 147 requirements
(88 passed · 6 failed · 6 needs_review · 6 N/A · 41 unable_to_verify).

Tools used: chrome-devtools MCP (live DOM + Lighthouse/axe + app walkthrough),
`gh` (repo source), direct SQL.

---

## 1. Global functionality — PASS

| Surface                   | Result                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                 | 71 open findings, 60% pass rate, alerts 0, pipeline + activity render; counts reconcile with DB (76−5 resolved = 71; 88/147 = 60%)           |
| Findings list `?tab=open` | 71 open / 5 resolved / 0 dismissed; 25 rows/page; severity/found-in/remediation filters + search work; no console errors                     |
| Finding detail            | Beats, badges (Open/Serious/Detected/Live page/Confidence), snippet, copy check id/selector, AI + dismiss actions, evidence trail all render |
| Requirements              | 147 in scope, status legend, per-control cards; no console errors                                                                            |
| Evidence + exports        | `GET /evidence/report` (md, 64 KB) and `/report/html` (64 KB) → 200; `loadReportInput` correct                                               |
| APIs                      | `/api/health` 200; `/api/projects/:id/assessment-jobs` 200; `/api/github/repos?q=` 200                                                       |
| Errors                    | Only a benign CSS-preload warn; no runtime/network errors in the app                                                                         |

**App's own accessibility** (Lighthouse on `/findings`): Accessibility 100,
Best Practices 100. One real defect surfaced (see §4).

---

## 2. Finding correctness — verdicts

Registry has 15 open finding classes; the 44 `color-contrast` entries are one class.

| checkId                          |   n | Engine        | Verdict                | Evidence                                                                                                                                                                                                                                                                     |
| -------------------------------- | --: | ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color-contrast`                 |  44 | runtime (axe) | ✅ Correct             | axe **incomplete** (“background color could not be determined due to a background gradient”) → correctly `warning`/`needs_review`, not `failed`. Lighthouse shows no definite contrast violation.                                                                            |
| `aria-props`                     |   1 | runtime (axe) | ✅ Correct             | Live DOM: `<p aria-label="Availability…">` with no role → genuine RGAA 7.1 / 4.1.2. (axe reports it incomplete → warning.)                                                                                                                                                   |
| `new-window-onload`              |   7 | ast           | ✅ Correct             | `target="_blank"` links with no “new window” warning (RGAA 13.2). Check id is a misnomer — behaviour is target=_blank.                                                                                                                                                       |
| `forced-colors`                  |   3 | runtime       | ✅ Correct             | Custom forced-colors probe on testimonial prev/next buttons; plausible.                                                                                                                                                                                                      |
| `resize-text`                    |   2 | runtime       | ⚠️ Review              | Fires at 200% on `blockquote.line-clamp-6` and an `article` with `overflow-hidden`. Real clipping, but line-clamp is intentional truncation — manual call.                                                                                                                   |
| `multiple-ways`                  |   1 | site-level    | ⚠️ Likely FP           | `mechanismCount` only counts nav + search + a **linked** sitemap. Site has header+footer nav on both routes and a `sitemap.xml`; nav alone = 1 → flagged. Too strict for a site with nav + footer link list.                                                                 |
| `non-text-contrast`              |   3 | runtime       | ❌ False positive      | Measures **border** contrast (~1.70:1) on a green “Resume” text/CTA and the icon-only “Next testimonial” button. Both are identified by their text/icon (8.7:1 text contrast); WCAG 1.4.11 does not require the boundary at 3:1 when the control is not boundary-identified. |
| `supplementary-content-keyboard` |   2 | runtime       | ❌ False positive      | Flagged anchor has `title` **identical** to its `aria-label` (“Visit my GitHub profile”). The info is the accessible name, not hover-only.                                                                                                                                   |
| `captcha-alternative`            |   1 | runtime       | ❌ False positive      | Contact form uses **invisible Google reCAPTCHA v3**; detector matched the always-present `grecaptcha-badge` branding element, not a challenge. No alternative modality is required for a score-based v3.                                                                     |
| `status-live`                    |   1 | ast           | ❌ False positive      | `<Toaster>` (sonner) renders its own `aria-live="polite"` internally (confirmed in `sonner/dist`). The AST only sees the call site.                                                                                                                                          |
| `error-prevention`               |   2 | ast + runtime | ❌ False positive (×2) | `HIGH_RISK` regex matches the word **“terms”** in the reCAPTCHA “Terms of Service” notice inside a normal contact form. Not a legal/financial/test submission.                                                                                                               |
| `both-colors`                    |   4 | ast           | ❌ False positive      | All in `src/app/opengraph-image.tsx` — an `ImageResponse` (next/og) social card, not user HTML with user stylesheets. RGAA 10.5 does not apply.                                                                                                                              |

### Net effect on the compliance verdict

`failed` (6) is driven by open **violations**: `forced-colors`, `resize-text`,
`non-text-contrast`, `captcha-alternative`, `supplementary-content-keyboard`,
`multiple-ways`. Of these, **4 are false positives or likely false**
(`non-text-contrast`, `captcha-alternative`, `supplementary-content-keyboard`,
`multiple-ways`). `needs_review` (6) includes 3 false positives
(`error-prevention`, `both-colors`, `status-live`).

→ The dashboard over-reports failures: roughly **4 of 6 “failed” requirements are
not real**, and ~7 of 71 open findings are false positives. For a compliance
product a false **fail** is less dangerous than a false pass, but it still erodes
trust and sends engineers to fix non-problems.

---

## 3. Bug list (fix the false positives at the source)

1. **`supplementary-content-keyboard` — skip when `title` is already the accessible name.**
   `packages/analysis-core/src/runtime/custom-checks/supplementary-content-keyboard.ts:32-45`
   — add `aria-label`/accessible-name check: if `title` text ⊆ accessible name (or `aria-label` present), don’t flag.
2. **`error-prevention` — don’t treat “terms/conditions/legal” as high-impact by substring.**
   `packages/analysis-core/src/patterns/multilingual.ts` (`HIGH_RISK`) used by
   `checks/families/forms.ts:617-640` and `runtime/custom-checks/error-prevention.ts`.
   Require a genuine transaction signal (payment/checkout/submit-application) or exclude
   “terms of service / privacy” consent boilerplate.
3. **`both-colors` — skip non-DOM render contexts.**
   `packages/analysis-core/src/checks/families/behavior.ts:505-520` — ignore `ImageResponse`/`next/og`
   files (and any component under `app/**/opengraph-image|icon|twitter-image`).
4. **`status-live` — don’t flag sonner/known toast libs (or accept an internal live region).**
   `packages/analysis-core/src/checks/families/behavior.ts:96-116` — drop the `Toaster`/`Sonner`
   host heuristic (sonner always renders `aria-live` internally).
5. **`captcha-alternative` — distinguish invisible/score-based captchas (reCAPTCHA v3).**
   `packages/analysis-core/src/runtime/custom-checks/captcha-candidates.ts` — don’t treat the
   `grecaptcha-badge` branding element as a challenge.
6. **`non-text-contrast` — only require boundary contrast when the control is boundary-identified.**
   `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts` +
   `interactive-control-selectors.ts` — skip controls whose visible text/icon already meets 3:1
   against the background.
7. **Duplicate findings across engines.** `error-prevention` (and `color-contrast`
   incomplete) surface as both AST and runtime rows because dedupe keys on
   checkId + location (source vs DOM differ). Consider collapsing by
   `checkId + controlId` when one engine is authoritative.

---

## 4. App defects found during the walkthrough

1. **`label-content-name-mismatch` (WCAG 2.5.3) — navigation badges.**
   `src/components/shell/nav-links.tsx:48-57` — `badgeAccessibleLabel` returns
   `"Findings, 71 open findings"` while the visible text is `"Findings 71"`; the
   comma breaks the substring rule (axe flagged it on `/findings`). Same pattern for
   the dashboard unread-alerts badge. Fix: make the accessible name contain the
   visible text contiguously, e.g. `` `${label} ${count} open findings` ``.

---

## 5. Config notes

- Runtime route `/projects/modern-ecommerce-platform` is **valid** (a portfolio
  case-study page), not a 404 — but if it wasn’t intended as an audit target,
  trim `runtimeRoutes` in Settings.
- `color-contrast` will stay `needs_review` on this site because the theme is
  gradient-heavy; axe cannot resolve gradient backgrounds. That is correct
  behaviour, not a bug.

---

## 6. Fixes applied

Policy chosen: **downgrade inference checks so they never hard-fail, and delete the weakest ones.**

**App bug**

- `src/components/shell/nav-links.tsx` — badge accessible name now `${label} ${count} open findings` so the visible text `Findings 71` is a contiguous substring (WCAG 2.5.3). Covered by `nav-links.test.tsx`.

**Deleted / removed**

- `both-colors` check deleted (AST impl + registry + `CHECK_REGISTRY` entry). `ctl-both-colors` stays as a **manual** control (`checkId: null`) so the preset count is unchanged; guidance entry removed. It was an inline-style inference with a weak RGAA 10.5 premise.
- `status-live` — removed the `Toaster` / `Sonner` host heuristic (sonner and peers render their own live region internally). The invalid-field live-region logic stays.

**Downgraded to `warning` (needs_review, never `failed`)** — new `advisory` registry flag + `isAdvisoryCheck`, honoured by the runtime custom-check adapter:

- `non-text-contrast` (border geometry can be decorative)
- `supplementary-content-keyboard` (title semantics)
- `multiple-ways` (site-level mechanism counting)
- `captcha-alternative` (AST path set to `warning`; runtime already advisory)

Deterministic probes (`forced-colors`, `resize-text`, `reflow`, …) are unchanged and still assert violations.

**Precision fixes kept (cut needs_review noise)**

- `error-prevention`: consent boilerplate ("Terms of Service", "Privacy Policy", FR/ES/DE equivalents) stripped before `HIGH_RISK` matching, in both AST and runtime.
- `supplementary-content-keyboard`: skip when the `title` is already the element's accessible name (`aria-label` / `aria-labelledby` / text).

Net effect on next assessment: `failed` should drop from 6 to the deterministic set (`forced-colors`, `resize-text`); the former false "failed" controls (`non-text-contrast`, `captcha-alternative`, `supplementary-content-keyboard`, `multiple-ways`) move to `needs_review`, and `both-colors` disappears from the assessment entirely.

## 7. Verification round — propagation bugs found

Re-running the assessment after the fixes initially still showed the old
verdicts. Two real propagation bugs (not the check fixes) were the cause:

1. **Re-detected findings kept their original verdict.** `reconcileControlFindings`
   updated `fix`/`location`/analyzer fields on a re-detected open finding but
   never `kind`/`severity`/`confidence`, so a check's verdict change never
   reached an already-open finding. Fixed in
   `src/server/assessment/assessment-findings.ts` (+ test).
2. **Retired checks orphaned their findings.** A control whose check was
   removed (now manual) is skipped by the reconcile, so its open findings sat
   open forever. The orphan reconcile in `src/server/assessment/assessment.ts`
   now also closes findings whose `checkId` is no longer registered
   (`isRegisteredCheck`, `check_authority`).
3. **Reused AST scans hid engine changes.** `scanMode: reused` (commit + scope
   - engine signature unchanged) skips the AST entirely. Bumped
     `ANALYSIS_ENGINE_VERSION` to `2026.09.24.1` so the next run re-derives.

### Verified result (run `416d7469`, full scan)

| status                                           | controls                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failed` (2)                                     | `ctl-forced-colors`, `ctl-resize-text` (deterministic only)                                                                                        |
| `needs_review` (7)                               | `aria-props`, `captcha-alternative`, `color-contrast`, `multiple-ways`, `new-window-onload`, `non-text-contrast`, `supplementary-content-keyboard` |
| `both-colors`, `status-live`, `error-prevention` | retired / no longer detected                                                                                                                       |

`failed` went 6 → 2 and every former false "failed" control now lands in
`needs_review` (human confirmation), which is the intended behaviour.
