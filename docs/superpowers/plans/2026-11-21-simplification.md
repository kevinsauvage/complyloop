# Simplification review — is the complexity worth it?

> **Status: applied (2026-11-23).** All recommendations, gateway-only keys
> included: S1–S8 removed, S9–S10 kept, R2 simplified. R3 and §5 remain open.
> R2 deviation: a single `jsonb_strip_nulls` expression would also strip nulls
> nested inside `lastDeployment`, so the merge keeps one `CASE` per
> delivery-owned path, generated from a path list.

## 1. Scope and method

- Whole repo measured (≈60k source lines, ≈60k test lines). Largest files are
  domain content (RGAA catalog `controls.ts` 1.8k, check families), which is
  expected and not a simplification target.
- Hunted for over-engineering patterns: duplicated mechanisms (write/lock
  primitives, crypto, env access, rate limits), thin wrappers, redundant stored
  state, features that re-implement what a dependency or provider already does.
- Deep-read: everything in the uncommitted change set (BYOK + GitHub repo id),
  the write primitives, rate limits, report rendering, env access.
- **Not** deep-read: the assessment pipeline (`src/server/assessment`, 5.6k),
  runtime analysis (`analysis-core/src/runtime`, 8.5k), check families. They are
  covered by tests and documented decisions; judging them needs a dedicated
  pass (§5).

## 2. Verdict

The committed codebase is in good shape: one write primitive per scope
(`withProjectTx`, `withOrgWrite`, `withConnectWrite`, `withProjectLock`), one
env module, knip-enforced dead-code removal, rate limits as readable one-line
wrappers. No change recommended there.

**The uncommitted BYOK feature is where complexity outran value.** It adds
≈2,600 source lines (≈6,900 with tests/docs) for "an org uses its own AI key".
Three of the bugs found in review lived in its optional machinery (cross-
provider key reuse via the model-listing action, OpenAI strict-schema
rejection, Google's 400 for bad keys), and two race fixes exist only because of
the sticky error state. A gateway-key-only BYOK is ≈600–800 lines.

## 3. BYOK — item by item

Each row: what it costs, what it buys, recommendation.

| #   | Piece                                                                                                                                                            | Cost (approx.)                                             | What it buys                                                                                                                                                                                    | Recommendation                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Monthly token cap + usage metering** (`org_ai_usage` table, `usage.ts`, cap action/UI, `onUsage` plumbing)                                                     | ≈500 lines, 1 table, metering on every AI path             | A soft cap that can overshoot. With BYOK the customer pays their provider, and every provider (AI Gateway budgets, Anthropic/OpenAI spend limits, Google quotas) enforces a hard limit already. | **Remove.** Keep per-user and per-org rate limits. Point admins to their provider's spend limit in the UI copy.                                            |
| S2  | **Sticky key error state** (`last_error_code`, failure tracker, revision-scoped writes, `key_rejected` / `model_unavailable` statuses)                           | ≈150 lines, 2 race fixes                                   | Buttons greyed out with "key rejected" before anyone clicks.                                                                                                                                    | **Remove.** Show the provider's rejection when the call fails (already a clear `PublicError`).                                                             |
| S3  | **Direct provider keys** (Anthropic, OpenAI, Google): 3 SDK deps, model allowlists, retention acknowledgement (columns, DB check, checkbox), per-provider quirks | ≈500 lines, 3 deps, 2 of the bugs found                    | Customers without a Vercel account. Note: an AI Gateway key already lets a customer use their own Anthropic/OpenAI/Google key (gateway BYOK) with enforced ZDR routing.                         | **Product decision.** Recommend gateway-only; add direct keys later if a customer asks.                                                                    |
| S4  | **Live model listing** (`listOrgAiModelsAction`, gateway `getAvailableModels`, timeout wrapper, "Load models" UI)                                                | ≈150 lines; the cross-provider key-leak bug came from here | A dropdown instead of typing a model id.                                                                                                                                                        | **Remove.** Text input; the save-time test call already proves key + model.                                                                                |
| S5  | **Key-version rotation** (`_VERSION`, `_PREVIOUS`, re-encrypt module + script, ops stale-version check)                                                          | ≈250 lines                                                 | Rotate the encryption secret without admins re-entering keys.                                                                                                                                   | **Product decision.** Pre-launch with few orgs: remove; rotation = new secret + admins re-enter (UI already says so). Keep if many orgs are expected soon. |
| S6  | **`enabled` toggle**                                                                                                                                             | action, status reason, UI section                          | Pause the org key without deleting it.                                                                                                                                                          | **Remove.** Removing the key does the same; re-entering takes seconds.                                                                                     |
| S7  | **`AI_ALLOW_PLATFORM_FALLBACK` flag**                                                                                                                            | env var, parsing, tests, docs                              | Nothing: leaving `AI_GATEWAY_API_KEY` unset already disables the fallback.                                                                                                                      | **Remove.**                                                                                                                                                |
| S8  | **`aiSource` / `aiKind` on findings, suggestions, patches** (contract change in `analysis-core`, an ask-first area)                                              | contract fields, zod schema, evidence detail, UI labels    | "via your organization's Anthropic key" next to AI output. `model` is already recorded.                                                                                                         | **Remove.** Low value for a contract change; with S3 too, `contract/ai-credentials.ts` goes as well and `analysis-core/contract` is untouched.             |
| S9  | **Config audit table** (`org_ai_settings_events` + "recent changes" UI)                                                                                          | table, repo, UI list                                       | Who changed AI routing and when. Relevant for a compliance product.                                                                                                                             | **Keep**, or reduce to `updated_by`/`updated_at` on the row if you don't need history.                                                                     |
| S10 | **`org.manage_ai` permission**                                                                                                                                   | one permission, same roles as `org.manage_members`         | Separate grant later.                                                                                                                                                                           | Keep (cheap).                                                                                                                                              |

Kept as-is (worth it): AES-256-GCM with org id as AAD; explicit provider
instances (no OIDC fallback billing the operator); org-scoped write lock with
permission re-check; ZDR routing on gateway calls; output-token bound; key never
sent to the client or logs.

**If S1–S8 are applied:** BYOK = one table (`org_id, model, iv, tag,
ciphertext, key_last4, updated_by, updated_at` + optional audit table), one
secret box, a resolver (org key → platform env → off), save/remove actions, one
settings card. Estimated −1,800 source lines, −1 table, −3 dependencies,
−3 env vars.

## 4. GitHub repo id (uncommitted)

| #   | Piece                                                                                                               | Recommendation                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Route webhooks by `repoId` (+ legacy name rows), index                                                              | **Keep.** Fixes real mis-routing after renames.                                                                                                                                                     |
| R2  | `updateProject` keeps delivery-owned fields through four nested `CASE`/`jsonb_set` expressions                      | **Simplify** to one expression: `excluded.payload \|\| <stored delivery fields>` with a single `jsonb_set` for the `github` object. Same behavior, readable, covered by `projects-lookup` DB tests. |
| R3  | `sourceRef` stored and healed separately although it is always `https://github.com/${fullName}` for GitHub projects | **Simplify later** (contract change, ask-first): derive it from `github.fullName`. Removes one healed field. Not urgent.                                                                            |

## 5. Rest of the project — candidates for a dedicated pass

Evidence-based, not yet deep-read; each needs its own review before any change.

- **Two AES-GCM implementations**: `src/server/github/github-tokens.ts`
  (key = `sha256(AUTH_SECRET)`) and the new `src/server/ai/secret-box.ts`. One
  module with a per-purpose key would halve the crypto surface. Changing GitHub
  token encryption needs a data migration — plan separately.
- **Assessment pipeline** (`src/server/assessment`, 23 files, 5.6k lines: jobs,
  lease, dispatch, scheduler, scratch, pipeline, status, findings, auto-verify,
  monitor…). Largest server subsystem; worth checking for stages that could
  merge, now that the worker is a GitHub Action with a 15-minute backstop.
- **Runtime analysis** (`analysis-core/src/runtime`, 112 files, 8.5k lines):
  check for custom checks that duplicate axe-core rules.
- **Docs for agents** (≈3,200 lines across AGENTS.md, architecture.md, rules,
  plans): `architecture.md` is 42 KB and restates code-level detail that graft
  already indexes. Trimming it lowers the cost of every agent session.

## 6. Order if approved

1. S7, S4, S2, S6, S8 (no product trade-off; pure removal). Gate.
2. S1 and S3 per your decision. Gate + DB tests.
3. S5 per your decision.
4. R2. DB tests.
5. Update the BYOK plan doc and `architecture.md` to match.
