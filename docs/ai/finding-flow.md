# Finding page flow

UX contract for `/findings/[id]`. Domain rules: [`.cursor/rules/domain-model.mdc`](../../.cursor/rules/domain-model.mdc), [`architecture.md`](./architecture.md).

## What the developer should get

Opening a finding answers three questions:

1. **What failed?** — requirement, location, snippet, impact.
2. **What do I do now?** — one primary action (Act panel).
3. **How do we know it's fixed?** — verification path.

Queue nav (`j` / `k`) stays. Everything else is secondary.

## Page layout

| Block | Component | Purpose |
| --- | --- | --- |
| Queue | `FindingQueueNav` | Prev/next in filtered list |
| Header | `PageHeader` | Control, severity, confidence, status, engine |
| Understand | `FindingUnderstandCard` | Why, where, how to fix; AI folded in |
| Act | `FindingNextStepPanel` | Single CTA from `findingAct()` |
| Details | Handoff + evidence | Handoff when needed; evidence collapsed |

Dismiss lives in a disclosure inside Act (`#dismiss-finding`).

## User beats

```
Understand          Act                    Confirm
──────────          ───                    ───────
Source, no patch    Generate patch
Source, patch ready Review → Create PR
Source, PR open     Open draft PR          Wait for merge + re-assess
Source, done        —                      Verified
Runtime, no fix     Generate guidance
Runtime, suggested  Approve
Runtime, approved   Mark implemented
Runtime, done       Verify (audit / note)
Dismissed           —                      Exception on record
```

## Workflows

### Source (AST)

```
Assessment → Finding + Remediation (detected / suggested)
     ↓
Generate patch → fresh checkout → edit → ComplyLoop must pass
     ↓
Create draft PR → evidence pull_request_prepared → approved
     ↓
Merge on GitHub → re-assess → verified
```

**Code:** `src/server/actions/ai-fix.ts`, `src/server/ai-fix-run.ts`, `src/ai/verified-fix.ts`, `src/server/actions/pr.ts`, `src/server/assessment.ts`.

Never show **Create draft PR** or **Generate patch** for `location.kind === "dom"`.

### Runtime (DOM)

```
Assessment → Finding (usually no ProposedFix)
     ↓
Generate guidance → suggested
     ↓
Approve → Mark implemented → Verify (re-audit or manual note) → verified
```

**Code:** `generateAiRemediationAction`, `FindingNextStepPanel`, remediation actions.

## Act panel rules (`findingAct`)

Input: `finding`, `remediation`, `canRemediate`, `prUrl`, `patchReady`, `githubConnected`, `aiAvailable`.

### Source findings

| State | Title | Primary action |
| --- | --- | --- |
| Open, no patch | Fix this Finding | **Generate patch** |
| Patch ready | Review patch | **Create draft PR** |
| PR open | In review on GitHub | **Open draft PR** |
| Verified | Verified | — |

Deterministic fixes still go through Generate (fresh checkout + ComplyLoop). Editable attributes (e.g. alt text) use AI or human review in the patch flow.

### Runtime findings

| State | Title | Primary action |
| --- | --- | --- |
| Open | Fix at the call site | **Generate guidance** |
| Suggested | Review guidance | **Approve** |
| Approved | Implemented outside | **Mark implemented** |
| Implemented | Confirm fix | **Verify** |

### UI flags

- **`showHandoff`** — no PR yet, finding open, suggestion or `finding.fix` exists.
- **`showDismiss`** — open finding, can remediate, not verified.

## Bulk actions (findings list)

`canBulkApproveRemediation()` — **runtime guidance only**. Source findings use patch → PR on the detail page.

## Remediation statuses

```
detected → suggested → approved → implemented → verified
```

UI maps these to the beats above — no separate wizard.

## Non-negotiable

- AI never sets finding, requirement, or `verified` status.
- Source patches must pass ComplyLoop before preview / PR.
- Evidence is append-only; dismiss = exception with history.
- Repo tests run in GitHub CI, not in the Next request.
- Runtime findings cannot be auto-committed (no reliable source span).

## Tests

Colocate with `finding-act.ts` and `finding-next-step-panel.tsx`:

- Source: generate, review + PR, in review, verified.
- Runtime: approve, verify; no patch/PR actions.
- Handoff hidden when `prUrl` is set.
- Bulk approve: runtime only (`findings-bulk-list.test.tsx`).

## Follow-ups

- Cluster → one PR (`todo.md` item 9).
- Auto-propose deterministic patches at assessment (still require ComplyLoop + human PR).
