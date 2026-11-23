# Plan — Bring Your Own AI Key (BYOK)

> **Status: implemented, then reduced (2026-11-23).** The
> [simplification review](./2026-11-21-simplification.md) removed direct
> provider keys, the token cap and metering, the stored key-error state, the
> enable toggle, live model listing, key-version rotation,
> `AI_ALLOW_PLATFORM_FALLBACK` and the `aiSource`/`aiKind` provenance fields.
> Sections below that describe those pieces are historical. Current behavior:
> [`docs/ai/architecture.md`](../../ai/architecture.md).
>
> Date: 2026-11-21 · Scope: the complete feature, delivered as one release.
> Touches high-risk areas (secrets at rest, migrations, tenancy) → needs an
> independent review before merge (AGENTS.md).

## 1. Goal

Let an organization use **its own AI credentials** for ComplyLoop's AI features
(finding explanation, remediation suggestion, AI patch generation) instead of
the operator's `AI_GATEWAY_API_KEY` / `AI_MODEL`.

Why it matters:

- **Cost**: AI spend is billed to the customer, not the operator.
- **Data control**: prompts carry client source code. Customers route it
  through their own provider contract or gateway policy.
- **Adoption**: self-hosted and pilot orgs can turn AI on without the operator
  enabling it globally.

Non-goals (unchanged rules from `.cursor/rules/ai-features.mdc`): AI still never
sets a status, never marks a remediation `verified`, never writes evidence on
its own authority.

## 2. Scope of the release

| In scope                                                                                                |
| ------------------------------------------------------------------------------------------------------- |
| Org-level AI configuration managed by admins/owners                                                     |
| Credential kinds: **Vercel AI Gateway key**, **Anthropic key**, **OpenAI key**, **Google (Gemini) key** |
| Key validation on save, model picker per kind                                                           |
| Encryption at rest with a dedicated, rotatable secret                                                   |
| Platform-key fallback controlled by the operator                                                        |
| Per-org token usage tracking and an optional monthly token cap                                          |
| Settings UI on `/org`, AI gating on the finding page, audit trail of config changes                     |
| Docs, privacy copy, ops checks, re-encryption script                                                    |

Explicitly **not** in scope (product decisions, not deferred work): per-project
or per-user keys, other providers (Mistral, Azure OpenAI, Bedrock, self-hosted
endpoints). Adding a kind later is one entry in the provider registry (§5.1).

## 3. Current state (analysis)

| Aspect             | Today                                                                                                                                          | Where                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Credentials        | One global `AI_GATEWAY_API_KEY` env var                                                                                                        | `src/ai/ai-call.ts:66-69`                                                     |
| Model              | One global `AI_MODEL` env var, **no default** (fail-closed so code is never sent to a non-ZDR model)                                           | `src/ai/ai-call.ts:57-59`                                                     |
| Provider wiring    | `generateText({ model: "<provider/model>" })` — a bare string, resolved by the AI SDK's default global provider (Vercel AI Gateway)            | `src/ai/ai-call.ts:184-189`                                                   |
| Availability check | `aiAvailable()` = env key && env model; read from `process.env` directly because `src/ai` must not import `@/server/*`                         | `src/ai/ai-call.ts:66`                                                        |
| Callers            | `generateAiExplanation`, `generateAiRemediation` (call `aiAvailable()` themselves); `proposeFixEdits` (gets `aiAvailable` from the caller)     | `src/ai/explainer.ts`, `src/ai/remediation.ts`, `src/ai/patch.ts`             |
| Server entry       | `generateAiExplanationAction`, `generateAiRemediationAction`, `generateAiFixAction` — all `project.remediate`, all `assertAiRateLimit(userId)` | `src/server/actions/remediation-ai.ts`, `src/server/actions/ai-fix.ts`        |
| UI gating          | `finding-detail-view.ts` computes `aiAvailable` globally → `findingAct()` + `FindingUnderstandCard` disable buttons                            | `src/server/workspace/finding-detail-view.ts:109`                             |
| Worker             | Does **not** call AI (only `deterministicExplanation`) → BYOK stays request-path only                                                          | `src/server/assessment/assessment-findings.ts:31`                             |
| Provenance         | `model: resolveAiModel()` stamped on explanations/suggestions/patches                                                                          | explainer/remediation/patch                                                   |
| Secrets precedent  | GitHub tokens: AES-256-GCM, key = `sha256(AUTH_SECRET)`, row `{v, iv, tag, ciphertext}`, decrypt failure → `PublicError` + `reportError`       | `src/server/github/github-tokens.ts`, `packages/db/src/repo/github-tokens.ts` |
| Tenancy / RBAC     | Org-scoped roles; `org.manage_members` is admin/owner only; no "org settings" permission yet                                                   | `src/core/rbac.ts`                                                            |
| Org settings UI    | `/org` page: overview, members, data lifecycle (export/delete). No settings card                                                               | `src/app/(app)/org/`                                                          |
| Privacy copy       | Names `AI_GATEWAY_API_KEY` + `AI_MODEL` as the only AI subprocessor path                                                                       | `src/app/(marketing)/legal/privacy/page.tsx:74-81`                            |

Hidden coupling to fix: because the model is passed as a **string**, the SDK
picks credentials implicitly. On Vercel, with no `AI_GATEWAY_API_KEY`, the
gateway provider falls back to the deployment's **OIDC token** — i.e. the
operator's account. Every call must use an explicitly built provider so a
missing/blank customer key can never silently bill the operator.

## 4. Decisions

### D1. Scope: per organization

Projects, roles, billing and data lifecycle are org-scoped. A per-user key would
make the same finding behave differently depending on who clicks, and the key
would leave with the user. → **One AI configuration per org**, managed by
admins/owners.

### D2. Credential kinds

| Kind         | Package                   | Model ids                                    | Key validation                            | Data-retention control                                                                     |
| ------------ | ------------------------- | -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ai_gateway` | `ai` (`createGateway`)    | `provider/model` from the customer's gateway | `getAvailableModels()` (free) + test call | `providerOptions.gateway.zeroDataRetention: true`, `disallowPromptTraining: true` enforced |
| `anthropic`  | `@ai-sdk/anthropic` (new) | curated allowlist                            | 1-token test call on the chosen model     | Customer's own contract with the provider                                                  |
| `openai`     | `@ai-sdk/openai` (new)    | curated allowlist                            | 1-token test call on the chosen model     | Customer's own contract with the provider                                                  |
| `google`     | `@ai-sdk/google` (new)    | curated allowlist                            | 1-token test call on the chosen model     | Customer's own contract with the provider                                                  |

Direct provider keys go straight to the provider — the operator's gateway is
not in the path, so self-hosted deployments need no operator AI account.

The curated allowlist (`src/ai/provider-models.ts`) holds models that support
structured output (all three AI features use `Output.object`). It is code, so
adding a model is a reviewed one-line change.

### D3. Data retention acknowledgement for direct providers

ComplyLoop cannot enforce zero-data-retention on a direct provider key — the
terms are between the customer and the provider. Saving an `anthropic` /
`openai` / `google` key requires the admin to tick: _"Finding context and source
snippets will be sent to <provider> under my organization's agreement with
<provider>."_ The acknowledgement (user, time, provider) is stored and written
to the audit trail. Gateway keys keep the enforced ZDR routing instead.

### D4. Precedence

```
org config (enabled)  →  org key + org model
else operator env (AI_GATEWAY_API_KEY + AI_MODEL), if AI_ALLOW_PLATFORM_FALLBACK  →  platform AI
else  →  AI disabled
```

`AI_ALLOW_PLATFORM_FALLBACK` defaults to `true` (today's behavior). An org with
its own config **never** falls back to the platform key when its key fails —
a broken customer key must not move spend or data to the operator's account.

### D5. Encryption: dedicated, versioned secret

Do **not** reuse `sha256(AUTH_SECRET)`: rotating the session secret would brick
every stored key, and one compromise would expose both sessions and
third-party API keys.

- `AI_KEYS_ENCRYPTION_KEY` — 32 random bytes, base64. Required for BYOK; absent
  → the settings card says BYOK is not available on this deployment.
- `AI_KEYS_ENCRYPTION_KEY_PREVIOUS` — accepted for decryption during rotation;
  rows are re-encrypted with the current key on write and by
  `npm run ops:reencrypt-ai-keys`.
- AES-256-GCM, `key_version` per row, AAD = `orgId` (a ciphertext copied to
  another org fails authentication).

### D6. Permission

New `org.manage_ai` permission (`src/core/rbac.ts`): admin + owner. Every
member sees whether AI is on, which provider/model, and usage — never the key.

### D7. Usage and cap

Each AI call records `usage.inputTokens` / `usage.outputTokens` against the
org and the current UTC month. Admins may set a monthly token cap; when
reached, AI calls fail with a clear `PublicError` until the next month or a
higher cap. The check runs before the call, so concurrent calls can overshoot
by at most the in-flight calls (accepted; documented on the card).

## 5. Architecture

### 5.1 `src/ai` — injected configuration, no env reads

`src/ai` must not import `@/server/*`, so the resolved configuration is passed in.

```ts
// src/ai/ai-config.ts (new)
export interface AiConfig {
  model: LanguageModel; // explicit provider instance, never a bare string
  modelId: string; // provenance
  kind: AiCredentialKind; // "ai_gateway" | "anthropic" | "openai" | "google"
  source: "org" | "platform";
  providerOptions?: ProviderOptions;
}

// src/ai/provider-registry.ts (new)
// kind → { build(apiKey, modelId): LanguageModel, models: readonly string[] | "gateway", providerOptions? }
```

- `aiCall({ config, ... })` replaces `available` + `resolveAiModel()`.
  `config === null` ⇒ unavailable (same short-circuit / `throwIfUnavailable`).
  `aiCall` returns `{ output, usage }` so the server can meter it.
- `generateAiExplanation`, `generateAiRemediation`, `proposeFixEdits`,
  `generatePatchCandidate` take `config` instead of reading env.
- Provenance: `model: config.modelId`, plus `aiSource` and `aiKind` on
  explanations/suggestions/patches, shown in the UI ("via your org's Anthropic key").
- `aiAvailable()` / `resolveAiModel()` are removed from `src/ai`.

### 5.2 `src/server/ai/` (new, `server-only`)

- `secret-box.ts` — `seal(plaintext, aad)` / `open(row, aad)` with versioned
  keys (D5).
- `ai-config.ts`
  - `resolveAiConfigForOrg(orgId): Promise<AiConfig | null>` — loads the row,
    decrypts, builds the provider through the registry; platform fallback per
    D4, also built explicitly (`createGateway({ apiKey: env })`), removing the
    OIDC fallback for every path.
  - `aiStatusForOrg(orgId)` — no decrypt: `{ available, source, kind, model,
lastErrorCode, usage, cap }` for UI gating.
  - Decrypt failure → `reportError({ code: "ai_key_unreadable", orgId })` +
    `PublicError("Your organization's AI key can't be read. An admin must re-enter it.")`.
- `validate-key.ts` — per kind (D2), short timeout, typed result
  (`ok | auth_failed | model_unavailable | network`). Never logs the key.
- `usage.ts` — `assertWithinCap(orgId)` before the call, `recordUsage(orgId, usage)`
  after (outside the project transaction, like the AI call itself).
- Runtime auth failures (gateway `GatewayAuthenticationError`, provider 401/403)
  set `last_error_code` so the card shows "key rejected".

### 5.3 Server actions

New `src/server/actions/org-ai.ts` (`"use server"`, `withOrgWrite`,
`org.manage_ai`, rate-limited):

| Action                    | Input                                               | Behavior                                                                                                                                         |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listOrgAiModelsAction`   | `orgId`, `kind`, `apiKey?`                          | Gateway: live list. Providers: allowlist. Uses stored key when `apiKey` is omitted                                                               |
| `saveOrgAiConfigAction`   | `orgId`, `kind`, `apiKey?`, `model`, `acknowledged` | zod-validate; require ack for direct kinds; validate key + model; seal; upsert; audit row. `apiKey` omitted = keep stored key, change model only |
| `setOrgAiEnabledAction`   | `orgId`, `enabled`                                  | Toggle without deleting                                                                                                                          |
| `setOrgAiTokenCapAction`  | `orgId`, `monthlyTokenCap \| null`                  | Set or clear the cap                                                                                                                             |
| `removeOrgAiConfigAction` | `orgId`                                             | Delete the row (hard delete of the secret is intended); audit row                                                                                |

Existing actions (`remediation-ai.ts`, `ai-fix.ts`): resolve
`resolveAiConfigForOrg(project.orgId)`, `assertWithinCap`, call, `recordUsage`.
Rate limits: keep `ai:${userId}`, add `ai-org:${orgId}`.

Secret hygiene: the key is never echoed in `ActionState`, error reports, logs,
exports or audit detail. `src/lib/redact.ts` gains patterns for gateway,
Anthropic (`sk-ant-`), OpenAI (`sk-`) and Google (`AIza`) key shapes.

### 5.4 Data model

Migration `drizzle/0009_org_ai_settings.sql` (**ask-first area**):

```sql
CREATE TABLE org_ai_settings (
  org_id             text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('ai_gateway','anthropic','openai','google')),
  model              text NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  key_version        smallint NOT NULL,
  iv                 text NOT NULL,
  tag                text NOT NULL,
  ciphertext         text NOT NULL,
  key_last4          text NOT NULL,
  monthly_token_cap  bigint CHECK (monthly_token_cap IS NULL OR monthly_token_cap > 0),
  retention_ack_by   text,
  retention_ack_at   timestamptz,
  validated_at       timestamptz,
  last_error_code    text,
  updated_by         text NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'ai_gateway' OR retention_ack_at IS NOT NULL)
);

CREATE TABLE org_ai_usage (
  org_id         text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period         date NOT NULL,              -- first day of the UTC month
  source         text NOT NULL CHECK (source IN ('org','platform')),
  input_tokens   bigint NOT NULL DEFAULT 0,
  output_tokens  bigint NOT NULL DEFAULT 0,
  calls          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period, source)
);
```

- Cascades cover org deletion; no new delete path.
- Org export includes `{ kind, model, enabled, keyLast4, cap, ack, updatedAt }`
  and usage — never ciphertext.
- Repo modules `packages/db/src/repo/org-ai-settings.ts` and `org-ai-usage.ts`
  (persistence only, like `github-tokens.ts`). Usage is an atomic
  `INSERT … ON CONFLICT DO UPDATE SET input_tokens = input_tokens + …`.
- Config changes write an `org_ai_settings_events` row (kind, model, enabled,
  cap, ack — never the key), so the audit trail shows when AI routing changed.
  The compliance `evidence` vocabulary is frozen and project-scoped, so
  org-level settings changes use their own audit table rather than extending
  it.

### 5.5 UI

- `/org`: `OrgAiSettingsCard` (server component) + `OrgAiSettingsForm` (client
  leaf). Visible to all members; editable with `org.manage_ai`.
  - States: _Not configured_ · _Platform AI in use_ · _Your key
    (Anthropic ••••abcd), model X, validated <date>_ · _Key rejected — re-enter_
    · _Monthly cap reached_.
  - Provider radio group → key input (`type="password"`, `autocomplete="off"`,
    never pre-filled) → model select (populated after validation) →
    retention acknowledgement (direct kinds) → save.
  - Usage this month vs cap, with a plain-text figure (not only a bar).
  - Labelled fields, associated errors, focus moved to the error summary on
    failure — the form must pass ComplyLoop's own RGAA audit.
- Finding page: `finding-detail-view.ts` uses `aiStatusForOrg(project.orgId)`;
  disabled AI buttons explain why (not configured / key rejected / cap reached)
  and link admins to Organization → AI.
- Toasts through `useActionToast`.

### 5.6 Docs, legal, ops

- `docs/ai/architecture.md`: config resolution, provider registry, tables,
  secret box, usage metering.
- `docs/vercel.md` + `.env.example`: `AI_KEYS_ENCRYPTION_KEY`,
  `AI_KEYS_ENCRYPTION_KEY_PREVIOUS`, `AI_ALLOW_PLATFORM_FALLBACK`.
- `npm run ops:check`: error when `org_ai_settings` rows exist and
  `AI_KEYS_ENCRYPTION_KEY` is missing; warn on rows with an old `key_version`.
- `npm run ops:reencrypt-ai-keys` script.
- Privacy page: AI data goes either to the operator's gateway or to the
  provider/gateway the customer configured, under the customer's agreement.
- `.cursor/rules/ai-features.mdc`: build models from `AiConfig`; never pass a
  bare model string; never log or return an AI key.
- `README.md`, `AGENTS.md` stack table: new `@ai-sdk/*` packages.

## 6. Implementation order (one release, one PR series)

Steps are ordered so each one builds and passes the gate on its own; the
feature ships when all are merged.

| Step | Content                                                                                       | Risk   | Verify                                                               |
| ---- | --------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| 1    | `src/ai` takes `AiConfig`; resolver returns platform config only; explicit gateway provider   | Low    | Existing `src/ai/*.test.ts` + action tests, behavior unchanged       |
| 2    | Provider registry + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` + model allowlist | Medium | Registry unit tests; structured-output smoke test per kind (mocked)  |
| 3    | Secret box + env + rotation                                                                   | High   | Round-trip, wrong AAD, wrong key, previous-key decrypt               |
| 4    | Migration + repos + export exclusion + `org.manage_ai`                                        | High   | `npm run test:db`; constraints test; export asserts no ciphertext    |
| 5    | Resolver precedence, key validation, usage metering + cap, org-ai actions, audit rows         | High   | Test matrix §7                                                       |
| 6    | Org AI settings card + finding page gating                                                    | Medium | RTL tests; `accessibility-reviewer` agent; e2e with mocked providers |
| 7    | Docs, privacy, ops scripts                                                                    | Low    | `npm run verify:gate`                                                |
| 8    | Independent security review (`security-auditor`, fresh context) on the full diff              | —      | Findings resolved before release                                     |

## 7. Test matrix

- No org config + platform env → platform used (today's behavior).
- No org config + `AI_ALLOW_PLATFORM_FALLBACK=false` → AI disabled, copy points to settings.
- Org config enabled (each kind) → org key used; platform key never read.
- Org config disabled → D4 rule.
- Org key rejected at runtime → `PublicError`, `last_error_code` set, **no** platform retry.
- Gateway kind sends ZDR + no-training provider options; direct kinds do not claim ZDR.
- Saving a direct-kind key without acknowledgement → rejected (action + DB check).
- Model outside the allowlist / not in gateway list → rejected.
- Decrypt failure (rotated key without `_PREVIOUS`) → `PublicError` + `reportError`; finding page still renders.
- Ciphertext moved to another org row → authentication failure (AAD).
- Cap reached → AI blocked with clear message; usage increments atomically under concurrency.
- Member/viewer cannot read, set, toggle or remove config; viewer cannot trigger AI (unchanged).
- Key never appears in action results, error reports, logs, org export, evidence detail.
- Provenance on generated items records `modelId`, `aiSource`, `aiKind`.

## 8. Risks

| Risk                                   | Mitigation                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Key leakage via logs/errors            | Key never in error detail; redact patterns per provider; absence tests            |
| Silent spend on operator account       | Explicit providers everywhere; no fallback after an org-key failure               |
| Bricked keys after secret rotation     | Dedicated versioned key + `_PREVIOUS` + re-encrypt script + ops:check             |
| Code sent under weaker retention terms | ZDR enforced on gateway kind; explicit, audited acknowledgement for direct kinds  |
| Cross-tenant key use                   | Resolver keyed by `project.orgId` under the existing project guard; AAD = orgId   |
| Provider model drift / deprecation     | Allowlist in code; `model_unavailable` surfaced on the card with a re-pick prompt |
| Long AI calls holding locks            | Unchanged: resolve, call and meter outside `withProjectTx`                        |

## 9. Files expected to change

```
src/ai/ai-call.ts, explainer.ts, remediation.ts, patch.ts, verified-fix.ts (+ tests)
src/ai/ai-config.ts, provider-registry.ts, provider-models.ts     (new)
src/server/ai/secret-box.ts, ai-config.ts, validate-key.ts, usage.ts  (new, server-only)
src/server/actions/org-ai.ts                                     (new)
src/server/actions/remediation-ai.ts, ai-fix.ts
src/server/assessment/ai-fix.ts
src/server/workspace/finding-detail-view.ts, orgs.ts (export)
src/server/rate-limit.ts, src/lib/redact.ts
src/core/rbac.ts, src/core/findings/finding-act.ts
src/app/(app)/org/page.tsx, _components/org-ai-settings-card.tsx, org-ai-settings-form.tsx
src/app/(app)/projects/[projectId]/findings/_components/finding-understand-card.tsx
src/app/(marketing)/legal/privacy/page.tsx
packages/db/src/schema.ts, packages/db/src/repo/org-ai-settings.ts, org-ai-usage.ts
drizzle/0009_org_ai_settings.sql                                 (ask first)
package.json (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google)
docs/ai/architecture.md, docs/vercel.md, .env.example, README.md, AGENTS.md, .cursor/rules/ai-features.mdc
scripts/ (ops:check, ops:reencrypt-ai-keys)
```
