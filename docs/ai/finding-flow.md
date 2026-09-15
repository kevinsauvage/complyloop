# Finding page flow

UX contract for `/findings/[id]`. Domain:
[`.cursor/rules/domain-model.mdc`](../../.cursor/rules/domain-model.mdc).

Opening a finding answers: **what failed**, **what do I do now** (one
primary action), **how do we know it's fixed**. Queue nav (`j` / `k`)
stays. Everything else is secondary.

| Block      | Component                               | Purpose                                       |
| ---------- | --------------------------------------- | --------------------------------------------- |
| Queue      | `FindingQueueNav`                       | Prev/next                                     |
| Header     | `PageHeader`                            | Control, severity, confidence, status, engine |
| Understand | `FindingUnderstandCard`                 | Why, where, how to fix; AI folded in          |
| Act        | `FindingNextStepPanel`                  | Single CTA from `findingAct()`                |
| History    | `RemediationHistory`                    | Status timeline                               |
| Details    | `DeveloperHandoffCard` + evidence trail | Handoff when `showHandoff`                    |

Dismiss lives in a `<details>` inside Act. Runtime "Generate guidance"
links to `#copy-handoff`.

```
Source, no patch     → Generate patch
Source, patch ready  → Review → Create PR
Source, PR open      → Open draft PR (wait for merge + re-assess)
Source, done         → Verified
Runtime, no fix      → Generate guidance
Runtime, suggested   → Approve
Runtime, approved    → Mark implemented
Runtime, done        → Verify (audit / note)
Dismissed            → Exception on record
```

**Source:** never show Create draft PR or Generate patch for
`location.kind === "dom"`. Path is driven by `patchReady` / `prUrl`, not
intermediate remediation statuses. Code: `actions/ai-fix.ts`, `ai-fix.ts`,
`verified-fix.ts`, `patch.ts`, `pr.ts`, `assessment.ts`.

**Runtime:** Generate guidance → Approve → Mark implemented → Verify.
Code: `generateAiRemediationAction`, `FindingNextStepPanel`.

### Act panel (`findingAct`)

| Source state   | Primary action                                                    |
| -------------- | ----------------------------------------------------------------- |
| Open, no patch | Generate patch (or **Verify and prepare patch** if deterministic) |
| Patch ready    | Create draft PR                                                   |
| PR open        | Open draft PR                                                     |
| Verified       | —                                                                 |

| Runtime state | Primary action    |
| ------------- | ----------------- |
| Open          | Generate guidance |
| Suggested     | Approve           |
| Approved      | Mark implemented  |
| Implemented   | Verify            |

- `showHandoff` — no PR yet, finding open, suggestion or `finding.fix` exists.
- `showDismiss` — open finding, can remediate, not verified.
- Bulk approve (`canBulkApproveRemediation`) — runtime guidance only.

Statuses: `detected → suggested → approved → implemented → verified`.
Only `verified` closes the loop. AI never sets status. Source patches
must pass ComplyLoop. Runtime findings cannot be auto-committed.
