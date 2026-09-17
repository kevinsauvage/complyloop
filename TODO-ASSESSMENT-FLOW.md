# Assessment Flow Audit — Simplify, Improve, Strengthen

## P2 — Medium

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
