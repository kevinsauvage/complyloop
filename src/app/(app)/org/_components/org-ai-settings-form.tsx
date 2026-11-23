"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/core/actions/action-state";
import { useActionToast } from "@/hooks/use-action-toast";
import { saveOrgAiConfigAction } from "@/server/actions/org-ai";
import type { AiStatus } from "@/server/ai/types";

/**
 * Gateway key + model form. Never pre-fills the key: the stored one is shown
 * only by its last four characters, and leaving the field blank keeps it.
 */
export function OrgAiSettingsForm({
  orgId,
  status,
}: {
  orgId: string;
  status: AiStatus;
}) {
  const formId = useId();
  const keyId = `${formId}-key`;
  const keyHintId = `${formId}-key-hint`;
  const modelId = `${formId}-model`;
  const modelHintId = `${formId}-model-hint`;

  const [state, formAction, pending] = useActionState(
    saveOrgAiConfigAction,
    initialActionState,
  );
  useActionToast(state, pending);

  const [apiKey, setApiKey] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending || state.ok || !state.message) return;
    errorRef.current?.focus();
  }, [pending, state]);

  // Once stored, the plaintext key has no reason to stay in browser memory.
  const [savedState, setSavedState] = useState(state);
  if (state !== savedState) {
    setSavedState(state);
    if (state.ok) setApiKey("");
  }

  const hasStoredKey = status.source === "org";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="orgId" value={orgId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={keyId}>Vercel AI Gateway API key</Label>
        <Input
          id={keyId}
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required={!hasStoredKey}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            hasStoredKey && status.keyLast4
              ? `••••${status.keyLast4} (leave blank to keep)`
              : "Paste your AI Gateway API key"
          }
          aria-describedby={keyHintId}
        />
        <p id={keyHintId} className="text-xs text-muted-foreground">
          Stored encrypted and never shown again. To use your own Anthropic,
          OpenAI or Google account, add that provider key in your gateway. Set a
          spend limit there too.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={modelId}>Model</Label>
        <Input
          id={modelId}
          name="model"
          required
          autoComplete="off"
          spellCheck={false}
          defaultValue={hasStoredKey ? (status.model ?? "") : ""}
          placeholder="anthropic/claude-sonnet-5-5"
          className="font-mono"
          aria-describedby={modelHintId}
        />
        <p id={modelHintId} className="text-xs text-muted-foreground">
          A gateway model id that supports structured output. Calls request zero
          data retention and no prompt training.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Validating…" : "Save AI settings"}
        </Button>
        {!pending && state.message && !state.ok ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="text-sm text-destructive outline-none"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
