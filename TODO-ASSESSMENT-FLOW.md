# Assessment Flow Audit — Simplify, Improve, Strengthen

## P2 — Medium

### [ ] P2-5 — Remediation `history[]` duplicates evidence rows; derive the history view instead of storing both

**Why:**
Every remediation transition writes **two** records: a `history` entry appended to the remediation payload _and_ an evidence row (`remediation_approved/_implemented/_verified`, plus `ai_remediation_suggested`). They carry the same `(status, at, note)` triple in different shapes, both persisted, both migrated forever. Evidence is already the append-only audit trail and is already queried per finding (`evidence_finding_at_idx`).

**Where (verified 2026-09-16):**
`packages/analysis-core/src/contract/entities.ts` (`RemediationHistoryEntry` L127–131, `Remediation.history` L138), `src/core/remediation-lifecycle.ts` (`appendRemediationHistory` L50–63), `src/server/assessment/remediation-evidence.ts` (summary/detail helpers L7–41), finding-history UI (`src/components/findings/remediation-history.tsx:18` — sole production `.history` reader).

**Current flow (verified 2026-09-16):**
`advanceRemediation` (`remediation-lifecycle.ts:36-47`) delegates to `appendRemediationHistory`, and `refreshSuggestion` also appends (`:70-99`) — while every caller separately appends evidence with the same note (e.g. `assessment.ts:258-294`, `remediation.ts` approve path, `remediation-verify.ts`).

**Problem:**
Dual-write of the same fact; the two can diverge (a transition that forgets evidence, or evidence without history — e.g. AI explanation writes neither consistently). Readers must know which source to trust per event type.

**Proposed simplification:**
Keep `Remediation.status` + `suggestion` as the persisted state; render history UI from finding-scoped evidence (kinds `remediation_*` + `ai_remediation_suggested` already carry notes in `detail`). Stop appending to `history[]` for new transitions (keep the field for old rows, ignore in UI). **Do not** delete the column (JSONB payload — just stop writing it) and do **not** merge Finding/Remediation tables — the remediation state machine (`remediation-lifecycle.ts`) is meaningful domain, only the duplicated _log_ goes.

**Why this is safe:**
Evidence rows already exist for every transition written through the current code paths; the finding page already loads finding evidence. Status/approval/verify logic reads `status`, never `history` (verify this — grep `history` readers before cutting).

**Impact:** Medium (one dual-write removed; smaller remediation payloads rewritten on every upsert)

**Complexity:** Medium (UI history component re-point + backfill-free coexistence).

**Evidence (verified 2026-09-16):**
`entities.ts:127-138` (history shape); `remediation-lifecycle.ts:36-47` (advance delegates to append), `:50-63`, `:70-99` (`refreshSuggestion` also appends); dual-write sites `remediation.ts:75-89`, `pr.ts:83-101`, `remediation-verify.ts:177+184-191` and `:360-371`, `assessment.ts:258-294`, `remediation-ai.ts:148-171`; `schema.ts:262-272` (`evidence_finding_at_idx` already supports the query). Status/approval/verify logic reads `status`, never `history` — the "verify this" caveat checks out in favor of the simplification (sole production `.history` reader is `remediation-history.tsx:18`).

---

### [ ] P2-6 — AI suggestions/explanations go stale silently when findings are re-scanned

**Why:**
AI outputs are persisted onto the finding/remediation rows with no link to the scan that produced them. When reassessment updates `location`/`fix` (match path L299–305) or resolves + re-creates the finding (P1-5 churn), the stored AI suggestion still describes the old snippet — and nothing marks it stale. Engineers can approve a suggestion for code that no longer exists.

**Where (verified 2026-09-16):**
`src/server/actions/remediation-ai.ts` (explanation append L55–62, suggestion persist L148–171), `src/server/assessment/assessment-findings.ts` (re-detected L286–311, match L312–326), `packages/analysis-core/src/contract/finding-types.ts` (`Explanation` L139–148, `RemediationSuggestion` L171–179), plus `src/server/assessment/ai-fix.ts:224-233` (second un-stamped `refreshSuggestion` persist).

**Proposed simplification:**
Stamp AI artifacts with the producing context (`assessmentId` + `snapshot.gitHead` already available at call time) and surface "suggestion predates latest scan" in the UI when the finding's `assessmentId`/location moved on; refresh-or-discard on re-detect (re-detected path L268–292 is the natural invalidation point — drop AI artifacts there with evidence, since the code changed under them). Also cap `explanations[]` growth (e.g. keep latest AI + deterministic baseline) — today every click appends forever and each append rewrites the whole finding row (bumps `updatedAt`, fights the stale guard).

**Why this is safe:**
No AI, status, or verification logic changes. Stale suggestions become visible instead of silently wrong; approval still requires the same human step.

**Impact:** Medium (prevents approvals against outdated code)

**Complexity:** Small–Medium.

**Evidence (verified 2026-09-16):**
`remediation-ai.ts:59` (unbounded explanations append); `:150-171` (persist + evidence `detail` with no scan/commit ref); `assessment-findings.ts:288-299` (re-detect refreshes location/fix/analyzers, suggestion/explanations untouched) and `:319-326` (match path, same; `assessmentId` deliberately write-once per `:315-318` comment); `finding-types.ts:171-179` (no provenance-of-scan fields); no invalidation path exists anywhere (grep `stale*suggestion|invalidat|predates` — no hits).

---

### [ ] P2-11 — Requirements upsert churns row `id` on conflict; findings cascade off assessments

**Why:**
Two schema-level sharp edges: (a) `upsertRequirements` conflicts on `(projectId, controlId)` but `SET id = excluded.id` — every concurrent writer mints a fresh UUID and _replaces_ the row id, so stable requirement identity doesn't exist across writers (any external reference, log, or future FK to requirement id dangles). (b) `findings.assessmentId → assessments ON DELETE CASCADE`: deleting an assessment row deletes findings (project reset/disconnect paths must be audited for data loss beyond intent).

**Where (verified 2026-09-16 — refs confirmed current):**
`packages/db/src/repo/requirements.ts` L33–68 (conflict target + `id: sql\`excluded.id\``at L61),`packages/db/src/schema.ts` L181–206 (findings FK cascade L189–191), reset/disconnect actions (`project_reset` evidence kind — find the deleter).

**Proposed simplification:**
(a) Stop overwriting `id` on conflict — keep the existing row id (`SET` payload/status only; fall back to deterministic ids `projectId:controlId`-derived if writers need convergence without a read). (b) Audit the reset/disconnect delete path; if assessment deletion is used for retention/reset, either scope the cascade deliberately (document) or null the FK. Both are verify-first, change-second.

> Investigated 2026-09-16, deferred: dropping `id` from the conflict `SET` alone is unsafe — the row would keep its old id while the payload carries the loser's new id, and the stale-write guard (keyed by payload id) would then miss the row and always write through. The correct fix is deterministic ids per `(project, control)`, which is a bigger change touching id generation in assessment-status refresh + requirements actions. No external reader of `requirement.id` exists (identity is `(project, control)` everywhere; no FKs), so current behavior is convergent albeit ugly — revisit together with a deterministic-id decision.

**Why this is safe:**
Requirement identity is `(project, control)` everywhere in code (unique index already enforces it); id stability only _adds_ guarantees. Findings cascade behavior becomes explicit instead of incidental.

**Impact:** Medium (identity stability; prevents reset-time surprises)

**Complexity:** Small–Medium.

**Evidence (verified 2026-09-16):**
`requirements.ts:61` (`id: sql\`excluded.id\``still swaps identity);`schema.ts:189-191`(cascade intact);`assessment-status.ts:150`+`:282`(new requirements still`crypto.randomUUID()`— no deterministic-id change since the 2026-09-16 note below);`mappers.ts:56-62` (payload id passed through).

---
