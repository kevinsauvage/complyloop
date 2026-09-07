# TODO-SIMPLICITY

Simplicity audit of the Compliance Engineering Platform (ComplyLoop).
Generated 2026-09-07. **No application code was modified** — this file is the plan.

**Method:** read architecture docs + product spec, then walked every major module
(`src/server`, `src/server/actions`, `src/core`, `src/ai`, `packages/db`,
`packages/adapters`, `packages/analysis-core` surface, UI components, config).
For each finding the question asked was: _can we get the same result with less
code, fewer concepts, fewer dependencies, or fewer moving parts?_

**Ground rules respected:** no recommendation below weakens the product's
non-negotiables — evidence append-only, AI never sets statuses, deterministic
verification, human-in-the-loop, RBAC, advisory-lock write serialization,
stale-write protection, accessibility of the app itself.

---

## Scope snapshot

- ~70k LOC (incl. colocated tests) across `packages/{analysis-core,db,adapters,check}` + `src/`.
- Largest units: `packages/adapters/src/rgaa/controls.ts` (1,803 — data, fine),
  `check-registry.ts` (969 — check data, fine), `src/server` ≈ 12.3k LOC,
  `src/server/actions` ≈ 4.9k LOC, `src/core` ≈ 3.7k LOC.
- The complexity hotspots are **not** in the analysis engine (that is the
  product) but in the **write pipeline plumbing** (`Db` read model, payload
  structs, status-refresh dance) and **action error-handling idioms**.

Overall verdict: the architecture is sound and unusually well documented. The
findings below are mostly _incidental_ complexity — duplication, dead generics,
parallel idioms — not conceptual overreach. The exception is the in-memory `Db`
read model, which is heritage from a pre-Postgres era and is the single largest
source of incidental complexity left in the repo.

---

### P2-6 · Align `connect.ts` with the standard write protocol — **DONE**

`withConnectWrite` in `workspace-write.ts`: tenancy load, user-scoped org
lock (no project lock), persist insert/delete project + evidence. Connect and
disconnect actions use it instead of hand-rolled transactions.

### P2-7 · Simplify status-refresh bookkeeping in `assessment-status.ts`

- **What:** `refreshRequirementForControl` maintains two arrays
  (`working` + `touched`) with double `findIndex` bookkeeping in `track()`;
  `applyRequirementStatusRefresh` then re-merges `touched` back into
  `ProjectRows` with a third findIndex pass; `mergeRefreshIntoPayload` builds a
  Map for the same "later id wins" merge.
- **Why:** Four merge utilities for one concept; three index scans per updated
  requirement. The in-memory `working` copy exists only to feed sticky-status
  checks that could read the caller's list.
- **How:** `refreshRequirementStatuses` already receives the caller's
  requirements; make it return `{ requirements (updated/created), evidence }`
  written into a single accumulator keyed by id (`Map<id, Requirement>`).
  `applyRequirementStatusRefresh` and `mergeRefreshIntoPayload` become two thin
  adapters over the same accumulator.
- **Files:** `src/server/assessment-status.ts`, `src/server/assessment.ts`.

### P2-8 · Org callbacks should compute, not mutate (`withOrgWrite` dual model)

- **What:** Org domain functions (`inviteOrgMember`, `removeOrgMember`,
  `changeOrgMemberRole`, `createOrganization`, `deleteOrganization` in
  `src/server/orgs.ts`) mutate the in-memory `db` arrays **and** the wrapper
  persists an explicit payload — two sources of truth inside one transaction.
- **Why:** The mutation is discarded after the transaction; only the returned
  payload persists. Readers inside the callback need the mutation, which makes
  every function "mutate for reading, return for writing" — a subtle contract.
- **How:** Make org functions pure compute-over-read (they already receive the
  loaded slice): either pass a scratch copy (like `ProjectRows`) or have them
  return payload + a local view. Pick one convention; the mutate-and-return
  hybrid goes away.
- **Files:** `src/server/orgs.ts`, `src/server/workspace-write.ts`
  (`withOrgWrite`), `src/server/actions/org.ts`.

### P2-9 · Share the report status/tone system with the HTML renderer

- **What:** The HTML report (`src/server/report-html/shared.ts`, 449 lines)
  embeds a full bespoke stylesheet with its own status/severity color palette
  (`STATUS_CLASS`, `--passed-bg`, …) duplicating `status-display.ts` tones, on
  top of **two** report formats (markdown + HTML) sharing `report-model.ts`.
- **Why:** A status/tone change must be made in three places (tokens, markdown
  labels, HTML CSS); the HTML palette silently diverges from app tokens.
- **How:** Generate the HTML CSS variables from the tone map (or reuse a shared
  constant module). Longer term (product decision, not required for
  correctness): consider whether both export formats are still needed — the
  model layer already makes the second renderer cheap, so this is optional.
- **Files:** `src/server/report-html/shared.ts`, `src/core/status-display.ts`,
  `src/server/report-markdown.ts`.

---

## P3 — Low

### P3-9 · One zod schema for the assessment-job row (schema + type + mapper)

`assessmentJobSchema` in `src/core/boundary.ts` re-declares the `AssessmentJob`
shape that `assessment-jobs.ts` types + `jobFromRow` already define. Derive the
zod schema from the type (or generate the type from the schema) so they cannot
drift. Low urgency — the client poller is the only consumer.
**Files:** `src/core/boundary.ts`, `src/server/assessment-jobs.ts`.

### P3-10 · Pick one user-feedback channel per action result

`StatefulActionForm` renders inline `ActionFeedback` **and** `useActionToast`
fires for the same state (toasts keyed off the pending-edge). Every action
success currently surfaces twice. Choose toast-only (recommended: pages keep
state after `revalidatePath`) or inline-only, and delete the dual path.
**Files:** `src/components/stateful-action-form.tsx`,
`src/hooks/use-action-toast.ts`, `src/components/action-feedback.tsx`.
