# UX improvement tickets

Twenty Jira-ready stories to make ComplyLoop feel like an engineering tool, not a compliance archive. They come from walking the live surfaces (`Dashboard`, `Requirements`, `Findings`, finding detail, `Evidence`, `Settings`, `Account`) against the core loop in the product spec:

```
Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence
```

**How to import:** each ticket is a Story. Copy the summary into Jira’s title field; paste the rest into the description. Priorities assume a first-time engineer is the primary user.

---

## UX-1 — Guided first assessment (connect → target → preview URL → run)

**Type:** Story
**Priority:** Highest
**Labels:** `ux` `onboarding` `dashboard`
**Epic:** First-run experience

**User story:** As a first-time engineer, I want a short checklist after I connect a repo so I understand what to do before I hit “all green.”

**Context:** After connect, the dashboard is an empty state with “Run assessment” and a buried mention of preview URL in Settings. Runtime-only checks stay `unable_to_verify` with no explanation of the missing preview URL. Spec §25: a first-time user should see clear pass/fail **and** understand unverifiable checks. Spec §23: connecting a repo and getting the first useful result should be extremely fast.

**Acceptance criteria:**

- After a repo is connected and before the first completed assessment, the dashboard shows a 3-step checklist: (1) assessment target, (2) optional preview URL, (3) run assessment.
- Step 2 links to (or inlines) the runtime URL field; skipping it is explicit (“source-only for now”).
- When runtime-only counts are `unable_to_verify`, copy says to set a preview URL to assess those checks — not that the product “couldn’t tell.”
- Completing a step marks it done without a separate onboarding product.

---

## UX-2 — Make “Unable to verify” understandable and actionable

**Type:** Story
**Priority:** Highest
**Labels:** `ux` `dashboard` `requirements` `copy`
**Epic:** Status literacy

**User story:** As an engineer, I want to know _why_ a requirement is unverifiable and what I can do about it, so I don’t treat it as a pass or a scanner bug.

**Context:** Dashboard status tiles for `unable_to_verify` and `not_applicable` are not links (`STATUS_HREF` only covers failed / needs_review / passed). Runtime-only controls (contrast, title, landmarks, target size, …) stay unverifiable until axe runs. Nothing on the tile explains that. Users who skip Settings will think the scan was incomplete or that those controls passed.

**Acceptance criteria:**

- The `unable_to_verify` tile is clickable and opens Requirements filtered to that status.
- Tile or empty copy distinguishes “needs a preview URL” vs “needs human review” vs “scanner cannot score this control.”
- Requirements in that status show the next action (set preview URL, record human pass, or record exception) instead of only a badge.

---

## UX-4 — Filter and search findings before opening them

**Type:** Story
**Priority:** Highest
**Labels:** `ux` `findings` `triage`
**Epic:** Findings triage

**User story:** As an engineer with dozens of open findings, I want to search and filter by severity, engine, file, and control so I can pick what to fix this afternoon.

**Context:** `/findings` is a prioritized flat list with Open / Resolved / Dismissed tabs, pagination, and bulk approve/dismiss. There is no search, no severity filter, no engine (AST vs runtime) filter, no file/path filter. The only way to find “everything in `Button.tsx`” is to scan location monospace lines page by page.

**Acceptance criteria:**

- Findings list supports: text search (control code, title, reason, path), severity, engine (`ast` / `runtime`), remediation status.
- Filters persist in the URL (`?q=&severity=&engine=`).
- Empty filter results say what is filtered, with a clear “reset” control.
- Bulk select still applies to the **visible page**; copy states that.

---

## UX-5 — Requirement cards jump to their open findings

**Type:** Story
**Priority:** High
**Labels:** `ux` `requirements` `findings` `navigation`
**Epic:** Core loop navigation

**User story:** As an engineer reading a failed requirement, I want one click to the findings that caused the failure.

**Context:** `RequirementCard` shows “N open findings · updated …” as plain text. There is no link to `/findings` filtered by `controlId`. The core loop is Requirement → Finding; the UI currently makes that a dead end.

**Acceptance criteria:**

- “N open findings” is a link to `/findings?control=<id>` (open tab).
- Zero open findings is not a fake link.
- From a failed requirement, the primary action is “See findings,” not only “Record exception.”

---

## UX-6 — Finding detail: one obvious next action, then evidence

**Type:** Story
**Priority:** Highest
**Labels:** `ux` `findings` `remediation`
**Epic:** Finding-to-fix

**User story:** As an engineer opening a finding, I want the next useful action above the fold, not after four cards of explanation, lifecycle, snippet, and patch.

**Context:** Finding detail is a long vertical stack: badges → Where (snippet) → Explanation (why / impact / how to fix) → Remediation (6-step lifecycle + AI) → Developer handoff (diff + PR body + Create PR) → Dismiss → Evidence trail. Spec §9: compliance information should always be actionable. Spec §28: tell the team what failed, why, where, how to fix, the proposed change, and the evidence. Today the proposed change and PR CTA sit at the bottom.

**Acceptance criteria:**

- Open findings show a sticky or top “Next step” panel: Approve, Open PR, Apply, Verify, or “Fix manually / dismiss” — whichever the remediation status allows.
- Explanation and evidence remain on the page but do not push the CTA below the fold on a typical laptop viewport.
- View-only roles still see the next step, with the existing permission notice instead of a dead button.

---

## UX-7 — “Open pull request” is the primary fix path (not “apply to disk”)

**Type:** Story
**Priority:** High
**Labels:** `ux` `remediation` `github` `copy`
**Epic:** Finding-to-fix

**User story:** As an engineer, I want the default fix path to be a GitHub PR I can review, not a write to some workspace checkout I don’t understand.

**Context:** After approval, `FindingActionPanel` leads with “Apply change to the file” (“Writes the approved fix into the project checkout on disk”) and a secondary “Mark implemented externally.” `CreatePrForm` is buried in `DeveloperHandoffCard` with copy about `gh` being available. Spec §20: failure → proposed change → pull request → verification, without translating the finding by hand.

**Acceptance criteria:**

- When the project has GitHub connected and the finding has an automatable fix, “Create pull request” is the primary button on the finding.
- “Apply to workspace checkout” is clearly labeled as a local/server checkout action (or hidden in self-hosted contexts where it is misleading).
- After a PR is created, the finding shows the PR URL persistently (not only a toast).
- Copy never implies the finding is done at `implemented` — only `verified` closes the loop (existing domain rule, surfaced in the UI).

---

## UX-8 — “By cause” view: fix the shared component, not 47 rows

**Type:** Story
**Priority:** Highest
**Labels:** `ux` `findings` `clusters`
**Epic:** Root-cause UX

**User story:** As an engineer, I want to work from shared root causes so one change clears many findings.

**Context:** Spec §17: 47 failures from one `Button` should become one change. Dashboard shows top 5 clusters as labels linking to `/findings` (the whole list). Findings page shows a “Shared root causes” card of location chips, then a flat list. There is no cluster page, no cluster filter, and no “open PR for this cluster.”

**Acceptance criteria:**

- Findings has a “By cause” tab (alongside Open / Resolved / Dismissed, or as a view toggle).
- Each cluster shows: label, finding count, shared file/component, severity mix, and a link to the findings in that cluster.
- Opening a cluster does not dump the user onto an unfiltered list.
- Cluster cards do not invent a second domain noun (keep “Finding” / “cluster of findings”).

---

## UX-9 — Evidence records link back into the loop

**Type:** Story
**Priority:** High
**Labels:** `ux` `evidence` `navigation`
**Epic:** Evidence as a product

**User story:** As an engineer or auditor scanning the evidence trail, I want to open the related finding or requirement from a row, not read a disconnected log.

**Context:** `/evidence` is a paginated list of kind badge + timestamp + summary. Rows do not link to findings, requirements, assessments, or PRs. Finding detail has a local trail; the global page is a firehose. Spec §13: for every requirement, users should walk status → assessment → finding → remediation → verification → evidence.

**Acceptance criteria:**

- Where an evidence record has `findingId` / `requirementId` / `assessmentId`, the row is a link (or contains one) to that entity.
- Optional filter by evidence kind (detected, verified, dismissed, regression, …) via URL.
- Kind labels stay human (`evidenceKindLabel`); raw enum strings stay out of the primary UI (finding detail still shows `record.kind` in a mono badge — align that too).

---

## UX-10 — Navigation shows what needs attention

**Type:** Story
**Priority:** High
**Labels:** `ux` `nav` `dashboard`
**Epic:** Wayfinding

**User story:** As an engineer landing in the app, I want the sidebar to tell me how many open findings and unread regression alerts I have, without opening Dashboard.

**Context:** `NavLinks` is six static items (Dashboard, Requirements, Findings, Evidence, Settings, Account). Unread alerts only appear on the dashboard. Open finding count is invisible until you open Findings or Dashboard. Spec §14: users should quickly answer “what needs attention?”

**Acceptance criteria:**

- Findings nav item shows the open-finding count for the active project (or a discreet badge).
- Dashboard or a dedicated Alerts item shows unread regression count when > 0.
- Badges are accessible (not color-only; `aria-label` includes the count).
- View-only users still see counts.

---

## UX-11 — Assessment progress you can trust without refreshing

**Type:** Story
**Priority:** High
**Labels:** `ux` `assessment` `dashboard`
**Epic:** Assessment feedback

**User story:** As an engineer who just clicked “Run assessment,” I want live job status on the dashboard so I know whether to wait, leave, or fix the worker.

**Context:** `AssessmentJobStatus` lists recent jobs (queued / running / succeeded / failed) from the last server render. There is no polling, no estimate, and in production a note that jobs stay queued until `npm run worker` — operator copy on a product page. “Run assessment” becomes “Assessing…” then a static page until reload.

**Acceptance criteria:**

- While a job is `queued` or `running` for the active project, the dashboard updates without a full manual refresh (poll or similar).
- Failed jobs show the error and a retry path (`Run assessment` again) next to the job, not only in the page header.
- Operator-only copy (`npm run worker`) is not shown to end users; if the worker is down, say “Assessment is delayed — try again shortly” (or equivalent product copy).
- Completing a job moves focus/attention to new findings or “no new failures.”

---

## UX-12 — Regression alerts go somewhere useful

**Type:** Story
**Priority:** High
**Labels:** `ux` `alerts` `continuous`
**Epic:** Continuous monitoring

**User story:** As an engineer who sees “compliance regression detected,” I want to open the requirement/finding and the change that caused it, not only dismiss the banner.

**Context:** `DashboardAlertsCard` shows summary, trigger/from→to, and a “Dismiss” button that marks the alert read. There is no link to the requirement, finding, commit, or assessment. Spec §8: show what changed, which requirement was affected, why it now fails, who introduced the change, relevant code, recommended remediation. In-app alerts currently only _announce_.

**Acceptance criteria:**

- Each unread alert has a primary link to the affected requirement or finding (whichever exists).
- Change context (commit / file) is a link when available.
- “Dismiss” is labeled “Mark as read” so it is not confused with dismissing a finding.
- Empty dashboard (no unread alerts) does not invent a fake alerts module.

---

## UX-13 — Two exports: engineering report and audit report

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `evidence` `reports`
**Epic:** Two audiences, same data

**User story:** As an engineer I want a short failing-requirement report; as a reviewer I want status, evidence, exceptions, and timestamps — not 200 JSX snippets.

**Context:** Evidence page Export offers Report (Markdown), Report (HTML), and JSON. One document mixes findings, snippets, remediation, and the trail. Spec §21 asks for two views from the same data. Managers/auditors opening HTML in a new tab currently get the engineering dump.

**Acceptance criteria:**

- Export menu has **Engineering** (open findings, clusters, locations, remediations) and **Audit** (requirement status table, determination method, exceptions, verification evidence, no source snippets).
- Default for the in-app “Export” control is Engineering when the viewer came from Findings; Audit is equally obvious from Evidence.
- Both views reuse the same underlying records; they do not claim a new compliance status.

---

## UX-14 — Explain severity, confidence, engine, and determination in the UI

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `copy` `a11y` `findings`
**Epic:** Status literacy

**User story:** As an engineer new to the product, I want to know what “High / Deterministic / AST / Automated” means for whether I should act.

**Context:** `TooltipProvider` is mounted in the root layout, but badges never use tooltips. Finding chrome stacks Severity, Confidence, Remediation status, and Engine. Requirements stack status + determination (`automated` vs `human_review`). None of these terms are defined in the UI. An accessibility platform should not make its own chrome cryptic.

**Acceptance criteria:**

- Each status/severity/confidence/engine/determination badge has an accessible description (tooltip + keyboard) in one sentence of engineer language.
- Copy distinguishes “AI confidence” (never status) from “deterministic check result.”
- No new colors; reuse existing badge tokens.

---

## UX-15 — Move through the finding queue without returning to the list

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `findings` `keyboard`
**Epic:** Finding-to-fix

**User story:** As an engineer triaging findings, I want Next / Previous (and a keyboard shortcut) so I can approve or skip without losing my place.

**Context:** Finding detail back link is always `← All findings` (`/findings`), dropping tab, page, and filters. There is no next/previous. After bulk work, returning to page 3 of Open is guesswork.

**Acceptance criteria:**

- Finding detail has Previous / Next within the current filtered/tabbed queue.
- Back link returns to the list with the same `tab`, `page`, and filters.
- Keyboard: documented shortcut for next/previous that does not steal input from forms.
- End of queue: clear “no more open findings” — not a 404.

---

## UX-16 — Light theme and a print-friendly evidence/audit view

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `theming` `evidence` `a11y`
**Epic:** Multi-audience UI

**User story:** As a compliance reviewer sharing a screen or printing evidence, I want a light, readable view — not only the forced dark app chrome.

**Context:** Root layout hard-codes `className={... dark ...}`. There is no theme toggle. Audit HTML opens in a new tab still inside the dark system. Secondary users (spec §27) include auditors and managers who will project or print.

**Acceptance criteria:**

- Users can switch light / dark; preference persists (`localStorage` or equivalent).
- Default can remain dark for engineers; light must meet the same contrast bar the product enforces on scanned apps.
- Audit HTML report is readable in print (no dark-only backgrounds that wash out).
- Theme toggle is labeled and keyboard-accessible.

---

## UX-17 — Finding and remediation layouts that work on a phone

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `mobile` `findings`
**Epic:** Responsive workflow

**User story:** As an engineer reviewing a finding on a phone (PR review on the go), I want to understand where it is and what to do next without a six-column stepper and overflowing monospace.

**Context:** App shell already uses a Sheet nav on small screens. Finding remediation lifecycle is `sm:grid-cols-6`; explanation is `sm:grid-cols-3`; snippets and diffs are `overflow-x-auto`. Workspace context + page header + badge row consume vertical space before “Where.”

**Acceptance criteria:**

- Below `sm`, the remediation lifecycle is a compact current-step + “N of 6” (not six cramped columns).
- Primary CTA remains reachable without horizontal scroll.
- Code snippets remain copyable; horizontal scroll is on the snippet, not the page.
- Smoke-check Dashboard, Findings list, finding detail, and Evidence at a ~390px viewport.

---

## UX-18 — Connect a GitHub repo when you have more than 50

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `onboarding` `github`
**Epic:** First-run experience

**User story:** As an engineer in a multi-repo org, I want to find and connect the right repository without hoping it is in the first 50 GitHub results.

**Context:** `ConnectProjectPanel` loads `listGitHubRepos({ perPage: 50 })`. The picker filters that list client-side. Empty/App-install copy is decent; scale is not. Connecting the wrong repo (or not seeing the right one) is a first-run failure. Spec §23: minimal friction to first useful result.

**Acceptance criteria:**

- User can search GitHub (or page results) beyond the first 50 repos returned for the session.
- Repos are grouped by owner/org when multiple owners appear.
- Already-connected repos stay visibly connected (existing `connectedByFullName` behavior) after search.
- Failure states stay product copy, not OAuth-scope debug, unless the viewer is an operator.

---

## UX-19 — Runtime coverage as a first-class setup, not a Settings footnote

**Type:** Story
**Priority:** High
**Labels:** `ux` `settings` `assessment` `onboarding`
**Epic:** First-run experience

**User story:** As an engineer, I want to see whether this project is source-only or source + rendered pages, and change that without hunting Settings.

**Context:** Preview URL and routes live only on `/settings`. Dashboard first-run copy mentions Settings in a subordinate sentence. After an assessment, there is no persistent “coverage” chip (AST only vs AST + axe, pages scanned, last runtime error). `unable_to_verify` then looks like a quality problem rather than a coverage gap.

**Acceptance criteria:**

- Dashboard (and optionally the workspace strip) shows coverage: “Source only” vs “Source + preview (`n` pages)” with a link to edit.
- Last runtime error from the assessment is visible next to coverage, not only inside Settings body text.
- Saving a preview URL from the first-run checklist (UX-1) updates this chip.
- Does not auto-pass runtime-only controls without a successful runtime audit.

---

## UX-20 — Empty and success states that say what to do next

**Type:** Story
**Priority:** Medium
**Labels:** `ux` `empty-states` `copy`
**Epic:** Wayfinding

**User story:** As an engineer who just verified the last finding — or who opened Evidence too early — I want the empty state to confirm progress and point to the next loop step.

**Context:** Empty states are generic: “Connect a repository,” “Run your first assessment,” “No findings yet,” “No evidence yet,” “No open findings. Everything detected has been fixed…” Findings with zero records send you to the dashboard. There is no “latest verification,” no “export audit report,” no “set preview URL to unlock N checks.” Spec §14 also asks: what was recently fixed, what is verified, where are regressions.

**Acceptance criteria:**

- Dashboard with zero open findings highlights recently verified remediations and unread regressions (or their absence) instead of only a green-ish empty list.
- Evidence empty state tells the user to run an assessment (existing) **and** what evidence will look like after one run.
- Findings empty-after-assessment (“no open findings”) offers Export audit report and a link to Requirements — not only “Go to dashboard.”
- Copy uses domain vocabulary (Finding, Requirement, Remediation, Evidence) and engineer language, not legal tone.

---

## Suggested Jira import order

1. UX-1, UX-19, UX-2 — first run tells the truth about coverage
2. UX-6, UX-7, UX-8 — finding → fix in the developer workflow
3. UX-4, UX-3, UX-5, UX-10 — triage and navigation
4. UX-11, UX-12 — assessment and regressions
5. UX-9, UX-13, UX-20 — evidence and success
6. UX-14, UX-15, UX-17, UX-16, UX-18 — literacy, queue, mobile, theme, connect-at-scale
