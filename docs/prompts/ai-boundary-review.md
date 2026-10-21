# AI boundary review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: `src/ai/`, `src/server/actions/remediation-ai.ts`, plus any caller in the diff)

Review product AI features (explanation, remediation, patch generation). Read `.cursor/rules/ai-features.mdc` first. Do not edit code.

## Check

1. **Never decides** — AI output cannot set a requirement/finding status, `verified`, severity, or any compliance claim. Trace every consumer of AI output to prove it.
2. **Typed at the boundary** — model output parsed with Zod (or equivalent) before use; failures degrade gracefully and are surfaced, not silently replaced with plausible text.
3. **Provenance** — AI-derived content is labeled as such in storage and UI; model, prompt version, and inputs' identity are recorded so output can be audited.
4. **Prompt injection** — scanned repo content, file names, comments, and page text are untrusted: delimited from instructions, never able to trigger tools/actions, never echoed into privileged contexts, never able to alter the output schema.
5. **Patches** — generated patches are validated (path allow-list, size limit, applies cleanly, no `dom`-location source patch path), reviewed by a human before any PR/commit, and never include secrets or touch ask-first areas.
6. **Data minimization** — only the necessary snippet leaves the system; secrets/tokens/env values redacted (`redact.ts`) before prompting; no tenant data crosses orgs in one prompt.
7. **Cost & abuse** — rate limits, token/size caps, timeouts, retry with backoff; no unbounded loops; AI is optional — product works when it is off or failing.
8. **Models** — IDs come from config, not scattered literals; AI SDK usage matches the installed version's docs (`node_modules/ai/docs/`), not memory.
9. **Tests** — hostile, malformed, empty, and oversized model outputs are covered; AI is mocked, never called in tests.

## Output

```text
[SEVERITY] path/file.ts:LINE — boundary violated
  Scenario: input (including hostile repo content) → bad outcome
  Fix: minimal direction
```

End with `BOUNDARIES HOLD` or `BREACHES FOUND`.
