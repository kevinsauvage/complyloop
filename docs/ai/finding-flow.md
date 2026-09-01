# Finding page flow

UX contract for `/findings/[id]`. Domain statuses and evidence rules:
`.cursor/rules/domain-model.mdc`, `docs/ai/architecture.md`.

## Goal

A developer opening a Finding should answer, in order:

1. What failed, where, and why.
2. What to do **right now** (one primary action).
3. How we will know it is fixed.

Queue navigation (`j` / `k`) stays. Everything else is secondary.

## Page composition

| Block | Component | Role |
| --- | --- | --- |
| Queue | `FindingQueueNav` | Prev/next in the filtered list |
| Header | `PageHeader` + badges | Control, severity, confidence, remediation status, engine |
| Understand | `FindingUnderstandCard` | Why, where, snippet; impact/how-to-fix and AI folded |
| Act | `FindingNextStepPanel` | One beat from `findingAct()` in `src/core/finding-act.ts` |
| Details | handoff + evidence | Handoff only when `showHandoff`; evidence collapsed |

Act panel owns every finding-page action. Dismiss lives in a disclosure
inside Act (`#dismiss-finding`).

## User beats

```text
Understand          Act                         Confirm
(what / where)      (one CTA)                   (how we know)
─────────────────────────────────────────────────────────────
Source, no patch    Generate verified patch
Source, patch ready Review diff → Create draft PR
Source, PR open     Open draft PR               Waiting on merge + re-assessment
Source, resolved    —                           Verified
Runtime, no fix     Generate guidance / copy notes
Runtime, suggested  Approve
Runtime, approved   Mark implemented
Runtime, implemented Verify (re-audit / note)
Dismissed           —                           Documented exception
```

## Durable workflows

### Source (AST)

```text
Assessment → Finding + Remediation (detected, or suggested if deterministic snippet)
        ↓
Generate patch → checkout → deterministic or constrained AI edit
              → focused ComplyLoop re-scan must pass
              → evidence ai_patch_ready, status → suggested
        ↓
Create draft PR → fresh checkout, same edits, GitHub draft PR
              → evidence pull_request_prepared, status → approved
        ↓
Merge on GitHub → webhook / re-assess → Finding resolved, remediation verified
```

Code: `src/server/actions/ai-fix.ts`, `src/server/ai-fix-run.ts`,
`src/ai/verified-fix.ts`, `src/server/actions/pr.ts`,
`src/server/assessment.ts` (`verifyDraftPrRemediation`).

### Runtime (DOM)

```text
Assessment → Finding (usually no ProposedFix)
        ↓
Generate guidance → status suggested (or copy handoff)
        ↓
Approve → Mark implemented (outside the platform) → Verify (runtime re-audit or manual note)
        → Finding resolved
```

Code: `generateAiRemediationAction`, `FindingActionPanel`,
`verifyRemediationAction`.

Never show **Create draft PR** or **Generate patch** for
`location.kind === "dom"`.

## Act panel (`findingAct`)

View-model input: `finding`, `remediation`, `canRemediate`, `prUrl`,
`patchReady`, `githubConnected`, `aiAvailable`.

### Source

| Condition | Title | Primary action |
| --- | --- | --- |
| Open, no verified patch | Fix this Finding | **Generate patch** or **Verify and prepare patch** (`hasSafeDeterministicFix`) |
| Patch ready, no PR | Review patch | **Create draft pull request** (diff inline) |
| PR open, Finding still open | In review on GitHub | **Open draft PR** |
| Resolved / verified | Verified | — |
| Dismissed | Dismissed | — |

Deterministic fixes still go through Generate so ComplyLoop runs on a fresh
checkout. Editable `insert_attribute` (e.g. alt text) uses AI or human
review in the patch flow — not silent apply.

### Runtime

| Condition | Title | Primary action |
| --- | --- | --- |
| Open, no suggestion | Fix at the call site | **Generate guidance**; link to `#copy-handoff` when handoff is available |
| Suggested | Review guidance | **Approve** |
| Approved | Implemented outside ComplyLoop | **Mark implemented** |
| Implemented | Confirm the page is fixed | **Verify** (automated or manual note) |

### Chrome flags

- `showHandoff`: `prUrl === null`, Finding open, and suggestion or
  `finding.fix` exists. Handoff is folded under **Copy patch / PR body**.
- `showDismiss`: open Finding, can remediate, remediation not verified.

## Findings list bulk actions

`canBulkApproveRemediation()` — runtime guidance only. Source findings
use patch → draft PR on the detail page. Server action skips non-DOM
findings.

## Domain lifecycle

Stored remediation statuses:

`detected` → `suggested` → `approved` → `implemented` → `verified`

UI maps these to the beats above; no separate wizard on the finding page.

## Constraints (non-negotiable)

- AI never sets Finding, Requirement, or `verified` status.
- Source patches must pass focused ComplyLoop before preview / PR.
- Evidence is append-only; dismiss is an exception with retained history.
- Repository tests run in GitHub CI, not in the Next request.
- Runtime findings cannot be auto-committed (no reliable source span).

## Tests

Colocate with `finding-act.ts` and `finding-next-step-panel.tsx`:

- Source beats: generate, review patch + PR, in review on GitHub, verified.
- Runtime beats: approve, verify; no patch/PR actions.
- Handoff hidden when `prUrl` is set.
- Bulk approve: runtime only (`findings-bulk-list.test.tsx`).

Keep action tests for `ai-fix`, `pr`, `verifyDraftPrRemediation`.

## Follow-ups

- Cluster → one PR (`todo.md` item 9).
- Auto-propose deterministic patches at assessment time (still require
  ComplyLoop + human PR).
